module Nap.Core.Output

open System
open System.Text
open System.Xml
open Nap.Core

/// Pretty-print a NapResult to the console
let formatPretty (result: NapResult) : string =
    let sb = StringBuilder()
    let appendLine (s: string) = sb.AppendLine(s) |> ignore
    let append (s: string) = sb.Append(s) |> ignore

    // File name
    let fileName = System.IO.Path.GetFileName(result.File)
    let status = if result.Passed then "PASS" else "FAIL"
    let statusColor = if result.Passed then "32" else "31" // green / red ANSI
    appendLine $"\x1b[{statusColor}m[{status}]\x1b[0m {fileName}"

    match result.Error with
    | Some err ->
        appendLine $"  Error: {err}"
    | None -> ()

    match result.Response with
    | Some resp ->
        let statusColor =
            if resp.StatusCode >= 200 && resp.StatusCode < 300 then "32"
            elif resp.StatusCode >= 400 then "31"
            else "33"
        appendLine $"  \x1b[{statusColor}m{resp.StatusCode}\x1b[0m {result.Request.Method} {result.Request.Url}  ({resp.Duration.TotalMilliseconds:F0}ms)"

        // Assertions
        for a in result.Assertions do
            let icon = if a.Passed then "\x1b[32m✓\x1b[0m" else "\x1b[31m✗\x1b[0m"
            let target = a.Assertion.Target
            let opStr =
                match a.Assertion.Op with
                | Equals v -> $"= {v}"
                | Exists -> "exists"
                | Contains v -> $"contains \"{v}\""
                | Matches v -> $"matches \"{v}\""
                | LessThan v -> $"< {v}"
                | GreaterThan v -> $"> {v}"
            if a.Passed then
                appendLine $"  {icon} {target} {opStr}"
            else
                appendLine $"  {icon} {target} {opStr}"
                appendLine $"      expected: {a.Expected}"
                appendLine $"      actual:   {a.Actual}"
    | None -> ()

    for line in result.Log do
        appendLine $"  {line}"

    sb.ToString()

/// Format multiple results as a summary line
let formatSummary (results: NapResult list) : string =
    let passed = results |> List.filter (fun r -> r.Passed) |> List.length
    let failed = results |> List.filter (fun r -> not r.Passed) |> List.length
    let total = results.Length

    let color = if failed > 0 then "31" else "32"
    $"\n\x1b[{color}m{passed}/{total} passed\x1b[0m ({failed} failed)"

/// Format results as JUnit XML
let formatJUnit (results: NapResult list) : string =
    let sb = StringBuilder()
    sb.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>") |> ignore

    let totalTests = results.Length
    let failures = results |> List.filter (fun r -> not r.Passed) |> List.length
    let totalTime =
        results
        |> List.choose (fun r -> r.Response |> Option.map (fun resp -> resp.Duration.TotalSeconds))
        |> List.sum

    sb.AppendLine($"<testsuites tests=\"{totalTests}\" failures=\"{failures}\" time=\"{totalTime:F3}\">") |> ignore
    sb.AppendLine($"  <testsuite name=\"nap\" tests=\"{totalTests}\" failures=\"{failures}\" time=\"{totalTime:F3}\">") |> ignore

    for result in results do
        let name =
            result.File
            |> System.IO.Path.GetFileNameWithoutExtension
            |> System.Security.SecurityElement.Escape
        let time =
            result.Response
            |> Option.map (fun r -> r.Duration.TotalSeconds)
            |> Option.defaultValue 0.0

        if result.Passed then
            sb.AppendLine($"    <testcase name=\"{name}\" time=\"{time:F3}\" />") |> ignore
        else
            sb.AppendLine($"    <testcase name=\"{name}\" time=\"{time:F3}\">") |> ignore
            let failureMsg =
                match result.Error with
                | Some err -> err
                | None ->
                    result.Assertions
                    |> List.filter (fun a -> not a.Passed)
                    |> List.map (fun a ->
                        $"{a.Assertion.Target}: expected {a.Expected}, got {a.Actual}")
                    |> String.concat "; "
                |> System.Security.SecurityElement.Escape
            sb.AppendLine($"      <failure message=\"{failureMsg}\" />") |> ignore
            sb.AppendLine("    </testcase>") |> ignore

    sb.AppendLine("  </testsuite>") |> ignore
    sb.AppendLine("</testsuites>") |> ignore
    sb.ToString()

/// Format a single result as JSON (for VSIX consumption)
let formatJson (result: NapResult) : string =
    use stream = new System.IO.MemoryStream()
    use writer = new System.Text.Json.Utf8JsonWriter(stream)
    writer.WriteStartObject()
    writer.WriteString("file", result.File)
    writer.WriteBoolean("passed", result.Passed)

    match result.Error with
    | Some err -> writer.WriteString("error", err)
    | None -> ()

    match result.Response with
    | Some resp ->
        writer.WriteNumber("statusCode", resp.StatusCode)
        writer.WriteNumber("duration", resp.Duration.TotalMilliseconds)
        writer.WriteNumber("bodyLength", resp.Body.Length)
        writer.WriteString("body", resp.Body)
        writer.WriteStartObject("headers")
        for kv in resp.Headers do
            writer.WriteString(kv.Key, kv.Value)
        writer.WriteEndObject()
    | None -> ()

    writer.WriteStartArray("assertions")
    for a in result.Assertions do
        writer.WriteStartObject()
        writer.WriteString("target", a.Assertion.Target)
        writer.WriteBoolean("passed", a.Passed)
        writer.WriteString("expected", a.Expected)
        writer.WriteString("actual", a.Actual)
        writer.WriteEndObject()
    writer.WriteEndArray()

    if result.Log.Length > 0 then
        writer.WriteStartArray("log")
        for line in result.Log do
            writer.WriteStringValue(line)
        writer.WriteEndArray()

    writer.WriteEndObject()
    writer.Flush()
    Encoding.UTF8.GetString(stream.ToArray())

/// Format multiple results as JSON array
let formatJsonArray (results: NapResult list) : string =
    use stream = new System.IO.MemoryStream()
    use writer = new System.Text.Json.Utf8JsonWriter(stream)
    writer.WriteStartArray()
    for result in results do
        let json = formatJson result
        writer.WriteRawValue(json)
    writer.WriteEndArray()
    writer.Flush()
    Encoding.UTF8.GetString(stream.ToArray())
