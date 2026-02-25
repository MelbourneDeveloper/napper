module Nap.Core.Runner

open System
open System.Diagnostics
open System.Net.Http
open System.Text
open System.Text.Json
open System.Text.RegularExpressions
open Nap.Core

let private httpClient = new HttpClient()

/// Execute an HTTP request from a resolved NapRequest
let executeRequest (request: NapRequest) : Async<NapResponse> = async {
    Logger.info $"HTTP {request.Method} {request.Url}"
    Logger.debug $"Request headers: {request.Headers.Count} headers"
    let msg = new HttpRequestMessage(request.Method.ToNetMethod(), request.Url)

    // Add headers
    for kv in request.Headers do
        // Content headers need to go on the content object
        if kv.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase) then ()
        else msg.Headers.TryAddWithoutValidation(kv.Key, kv.Value) |> ignore

    // Add body if present
    match request.Body with
    | Some body ->
        msg.Content <- new StringContent(body.Content, Encoding.UTF8, body.ContentType)
    | None -> ()

    let sw = Stopwatch.StartNew()
    let! response = httpClient.SendAsync(msg) |> Async.AwaitTask
    sw.Stop()

    let! body = response.Content.ReadAsStringAsync() |> Async.AwaitTask
    Logger.info $"HTTP {int response.StatusCode} in {sw.Elapsed.TotalMilliseconds:F0}ms"
    Logger.debug $"Response body length: {body.Length}"
    let headers =
        response.Headers
        |> Seq.append response.Content.Headers
        |> Seq.map (fun kv -> kv.Key, kv.Value |> String.concat ", ")
        |> Map.ofSeq

    return {
        StatusCode = int response.StatusCode
        Headers = headers
        Body = body
        Duration = sw.Elapsed
    }
}

/// Evaluate assertions against a response
let evaluateAssertions (assertions: Assertion list) (response: NapResponse) : AssertionResult list =
    let tryGetJsonPath (path: string) (body: string) : string option =
        try
            let doc = JsonDocument.Parse(body)
            let parts = path.Split('.')
            let mutable current = doc.RootElement
            let mutable found = true
            for part in parts do
                if found then
                    match current.ValueKind with
                    | JsonValueKind.Object ->
                        match current.TryGetProperty(part) with
                        | true, prop -> current <- prop
                        | false, _ -> found <- false
                    | _ -> found <- false
            if found then
                match current.ValueKind with
                | JsonValueKind.String -> Some (current.GetString())
                | JsonValueKind.Number -> Some (current.GetRawText())
                | JsonValueKind.True -> Some "true"
                | JsonValueKind.False -> Some "false"
                | JsonValueKind.Null -> Some "null"
                | _ -> Some (current.GetRawText())
            else None
        with _ -> None

    assertions |> List.map (fun assertion ->
        let target = assertion.Target
        let actual =
            if target = "status" then
                Some (string response.StatusCode)
            elif target = "duration" then
                Some (sprintf "%.0fms" response.Duration.TotalMilliseconds)
            elif target.StartsWith "headers." then
                let headerName = target.Substring(8)
                response.Headers
                |> Map.tryFind headerName
                |> Option.orElseWith (fun () ->
                    response.Headers |> Map.tryPick (fun k v ->
                        if k.Equals(headerName, StringComparison.OrdinalIgnoreCase)
                        then Some v else None))
            elif target.StartsWith "body." then
                let path = target.Substring(5)
                tryGetJsonPath path response.Body
            elif target = "body" then
                Some response.Body
            else None

        match assertion.Op with
        | Equals expected ->
            let passed = actual |> Option.map (fun a -> a = expected) |> Option.defaultValue false
            { Assertion = assertion; Passed = passed; Expected = expected; Actual = actual |> Option.defaultValue "<missing>" }
        | Exists ->
            let passed = actual.IsSome
            { Assertion = assertion; Passed = passed; Expected = "exists"; Actual = if actual.IsSome then "exists" else "<missing>" }
        | Contains expected ->
            let passed = actual |> Option.map (fun a -> a.Contains(expected, StringComparison.OrdinalIgnoreCase)) |> Option.defaultValue false
            { Assertion = assertion; Passed = passed; Expected = $"contains \"{expected}\""; Actual = actual |> Option.defaultValue "<missing>" }
        | Matches pattern ->
            let passed = actual |> Option.map (fun a -> Regex.IsMatch(a, pattern)) |> Option.defaultValue false
            { Assertion = assertion; Passed = passed; Expected = $"matches \"{pattern}\""; Actual = actual |> Option.defaultValue "<missing>" }
        | LessThan expected ->
            let passed =
                match actual with
                | Some a ->
                    // Try numeric, then duration (e.g. 500ms)
                    let parseNum (s: string) =
                        let s = s.TrimEnd('m', 's')
                        match Double.TryParse(s) with
                        | true, v -> Some v
                        | _ -> None
                    match parseNum a, parseNum expected with
                    | Some av, Some ev -> av < ev
                    | _ -> false
                | None -> false
            { Assertion = assertion; Passed = passed; Expected = $"< {expected}"; Actual = actual |> Option.defaultValue "<missing>" }
        | GreaterThan expected ->
            let passed =
                match actual with
                | Some a ->
                    let parseNum (s: string) =
                        let s = s.TrimEnd('m', 's')
                        match Double.TryParse(s) with
                        | true, v -> Some v
                        | _ -> None
                    match parseNum a, parseNum expected with
                    | Some av, Some ev -> av > ev
                    | _ -> false
                | None -> false
            { Assertion = assertion; Passed = passed; Expected = $"> {expected}"; Actual = actual |> Option.defaultValue "<missing>" }
    )

/// Run an F# script (.fsx) and capture its output
let runScript (scriptPath: string) : Async<NapResult> = async {
    Logger.info $"Script start: {scriptPath}"
    let psi = ProcessStartInfo()
    psi.FileName <- "dotnet"
    psi.Arguments <- $"fsi \"{scriptPath}\""
    psi.WorkingDirectory <- System.IO.Path.GetDirectoryName(scriptPath)
    psi.RedirectStandardOutput <- true
    psi.RedirectStandardError <- true
    psi.UseShellExecute <- false
    psi.CreateNoWindow <- true

    let sw = Stopwatch.StartNew()

    try
        use proc = Process.Start(psi)
        let! stdout = proc.StandardOutput.ReadToEndAsync() |> Async.AwaitTask
        let! stderr = proc.StandardError.ReadToEndAsync() |> Async.AwaitTask
        do! proc.WaitForExitAsync() |> Async.AwaitTask
        sw.Stop()

        let logLines =
            stdout.Split('\n')
            |> Array.map (fun l -> l.TrimEnd('\r'))
            |> Array.filter (fun l -> l.Length > 0)
            |> Array.toList

        let passed = proc.ExitCode = 0
        Logger.info $"Script exit code: {proc.ExitCode}"
        let error =
            if passed then None
            elif stderr.Length > 0 then Some stderr
            else Some $"Script exited with code {proc.ExitCode}"

        return {
            File = scriptPath
            Request = { Method = GET; Url = ""; Headers = Map.empty; Body = None }
            Response = None
            Assertions = []
            Passed = passed
            Error = error
            Log = logLines
        }
    with ex ->
        sw.Stop()
        Logger.error $"Script failed: {ex.Message}"
        return {
            File = scriptPath
            Request = { Method = GET; Url = ""; Headers = Map.empty; Body = None }
            Response = None
            Assertions = []
            Passed = false
            Error = Some $"Script failed to start: {ex.Message}"
            Log = []
        }
}

/// Run a single .nap file end-to-end
let runNapFile (filePath: string) (vars: Map<string, string>) (envName: string option) : Async<NapResult> = async {
    Logger.info $"File: {filePath}"
    let dir = System.IO.Path.GetDirectoryName(filePath)
    let content = System.IO.File.ReadAllText(filePath)

    match Parser.parseNapFile content with
    | Error msg ->
        Logger.error $"Parse error in {filePath}: {msg}"
        return {
            File = filePath
            Request = { Method = GET; Url = ""; Headers = Map.empty; Body = None }
            Response = None
            Assertions = []
            Passed = false
            Error = Some $"Parse error: {msg}"
            Log = []
        }
    | Ok napFile ->
        // Resolve variables
        let allVars = Environment.loadEnvironment dir envName vars napFile.Vars
        Logger.debug $"Resolved {allVars.Count} variables"
        let resolved = Environment.resolveNapFile allVars napFile

        try
            let! response = executeRequest resolved.Request
            let assertionResults = evaluateAssertions resolved.Assertions response
            let passed = assertionResults |> List.filter (fun r -> r.Passed) |> List.length
            let total = assertionResults.Length
            Logger.info $"Assertions: {passed}/{total} passed"
            for a in assertionResults do
                let status = if a.Passed then "PASS" else "FAIL"
                Logger.debug $"Assertion {a.Assertion.Target}: {status}"
            let allPassed = assertionResults |> List.forall (fun r -> r.Passed)

            return {
                File = filePath
                Request = resolved.Request
                Response = Some response
                Assertions = assertionResults
                Passed = allPassed
                Error = None
                Log = []
            }
        with ex ->
            Logger.error $"Request failed: {ex.Message}"
            return {
                File = filePath
                Request = resolved.Request
                Response = None
                Assertions = []
                Passed = false
                Error = Some $"Request failed: {ex.Message}"
                Log = []
            }
}
