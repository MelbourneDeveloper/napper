/// Test client that launches napper-lsp and communicates via JSON-RPC over stdio.
/// This is the exact same protocol VSCode and Zed use.
module Nap.Lsp.Tests.LspClient

open System
open System.Diagnostics
open System.IO
open System.Text
open System.Text.Json.Nodes
open System.Threading
open System.Threading.Tasks
open Xunit

let private lspBinaryPath =
    let baseDir = AppContext.BaseDirectory
    let repoRoot =
        DirectoryInfo(baseDir).Parent.Parent.Parent.Parent.Parent.FullName
    Path.Combine(repoRoot, "src", "Nap.Lsp", "bin", "Debug", "net10.0", "napper-lsp")

/// Encode a JSON-RPC message with Content-Length header (LSP wire format)
let private encodeMessage (json: string) : byte[] =
    let body = Encoding.UTF8.GetBytes(json)
    let header = $"Content-Length: {body.Length}\r\n\r\n"
    Array.append (Encoding.UTF8.GetBytes(header)) body

/// Read a single LSP response from the stream (Content-Length header + body)
let private readMessage (reader: StreamReader) (ct: CancellationToken) : Task<JsonNode option> =
    task {
        let mutable contentLength = 0
        let mutable headerLine = ""

        let! firstLine = reader.ReadLineAsync(ct)
        headerLine <- firstLine

        while not (String.IsNullOrEmpty(headerLine)) do
            if headerLine.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase) then
                contentLength <- headerLine.Substring(15).Trim() |> int
            let! nextLine = reader.ReadLineAsync(ct)
            headerLine <- nextLine

        if contentLength = 0 then
            return None
        else
            let buffer = Array.zeroCreate<char> contentLength
            let! _read = reader.ReadBlockAsync(buffer, 0, contentLength)
            let json = String(buffer)
            return Some(JsonNode.Parse(json))
    }

/// Helper: create a JsonValue from a string
let str (s: string) : JsonNode = JsonValue.Create(s)

/// Helper: create a JsonValue from an int
let num (n: int) : JsonNode = JsonValue.Create(n)

/// A running LSP server process for integration testing
type LspServerProcess() =
    let proc = new Process()
    let mutable started = false

    member this.Start() : unit =
        Assert.True(File.Exists(lspBinaryPath), $"LSP binary not found at {lspBinaryPath}")
        proc.StartInfo.FileName <- lspBinaryPath
        proc.StartInfo.UseShellExecute <- false
        proc.StartInfo.RedirectStandardInput <- true
        proc.StartInfo.RedirectStandardOutput <- true
        proc.StartInfo.RedirectStandardError <- true
        proc.StartInfo.CreateNoWindow <- true
        let ok = proc.Start()
        Assert.True(ok, "Failed to start napper-lsp process")
        started <- true

    member this.SendRequest(method: string, id: int, ?paramObj: JsonNode) : Task<JsonNode> =
        task {
            let request = JsonObject()
            request["jsonrpc"] <- str "2.0"
            request["id"] <- num id
            request["method"] <- str method
            match paramObj with
            | Some p -> request["params"] <- p
            | None -> ()

            let json = request.ToJsonString()
            let bytes = encodeMessage json
            do! proc.StandardInput.BaseStream.WriteAsync(bytes, 0, bytes.Length)
            do! proc.StandardInput.BaseStream.FlushAsync()

            use cts = new CancellationTokenSource(TimeSpan.FromSeconds(10.0))
            let reader = proc.StandardOutput
            let mutable result : JsonNode option = None

            while result.IsNone do
                let! msg = readMessage reader cts.Token
                match msg with
                | Some node when node["id"] <> null && node["id"].GetValue<int>() = id ->
                    result <- Some node
                | Some _ -> ()
                | None -> failwith "Stream ended before response received"

            return result.Value
        }

    member this.SendNotification(method: string, ?paramObj: JsonNode) : Task =
        task {
            let notification = JsonObject()
            notification["jsonrpc"] <- str "2.0"
            notification["method"] <- str method
            match paramObj with
            | Some p -> notification["params"] <- p
            | None -> ()

            let json = notification.ToJsonString()
            let bytes = encodeMessage json
            do! proc.StandardInput.BaseStream.WriteAsync(bytes, 0, bytes.Length)
            do! proc.StandardInput.BaseStream.FlushAsync()
        }

    member this.SendRaw(data: byte[]) : Task =
        task {
            do! proc.StandardInput.BaseStream.WriteAsync(data, 0, data.Length)
            do! proc.StandardInput.BaseStream.FlushAsync()
        }

    member _.IsRunning : bool =
        started && not proc.HasExited

    member _.ReadStdErr() : string =
        if proc.HasExited then proc.StandardError.ReadToEnd() else ""

    member this.Kill() : unit =
        if started && not proc.HasExited then
            proc.Kill()
            proc.WaitForExit(3000) |> ignore

    interface IDisposable with
        member this.Dispose() =
            this.Kill()
            proc.Dispose()
