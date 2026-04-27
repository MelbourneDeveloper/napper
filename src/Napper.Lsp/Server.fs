// Implements [LSP-SERVER]
namespace Napper.Lsp

open System
open System.IO
open System.Threading.Tasks
open Ionide.LanguageServerProtocol
open Ionide.LanguageServerProtocol.JsonUtils
open Ionide.LanguageServerProtocol.Types
open Napper.Core
open Newtonsoft.Json
open Newtonsoft.Json.Linq
open StreamJsonRpc

/// LSP server — lifecycle, document sync, symbols, code lens, and commands.
/// All domain logic lives in Napper.Core. This file is protocol glue only.
type NapLspServer(client: Client) =
    inherit LspServer()

    let serverName = "napper-lsp"
    let serverVersion = "0.1.0"

    let commandCopyCurl = "napper.copyCurl"
    let commandListEnvs = "napper.listEnvironments"
    let commandRequestInfo = "napper.requestInfo"

    let capabilities: ServerCapabilities =
        { ServerCapabilities.Default with
            TextDocumentSync = Some(U2.C2 TextDocumentSyncKind.Full)
            DocumentSymbolProvider = Some(U2.C1 true)
            CodeLensProvider =
                Some
                    { ResolveProvider = Some false
                      WorkDoneProgress = None }
            ExecuteCommandProvider =
                Some
                    { Commands = [| commandCopyCurl; commandListEnvs; commandRequestInfo |]
                      WorkDoneProgress = None } }

    // ─── Helpers ─────────────────────────────────────────────

    let isNapFile (uri: string) : bool = uri.EndsWith ".nap"
    let isNaplistFile (uri: string) : bool = uri.EndsWith ".naplist"

    let symbolKindForSection (name: string) : SymbolKind =
        match name with
        | "meta" -> SymbolKind.Namespace
        | "request" -> SymbolKind.Function
        | "request.headers" -> SymbolKind.Struct
        | "request.body" -> SymbolKind.Struct
        | "assert" -> SymbolKind.Function
        | "script" -> SymbolKind.Function
        | "vars" -> SymbolKind.Variable
        | "steps" -> SymbolKind.Array
        | _ -> SymbolKind.Key

    let sectionToSymbol (section: SectionScanner.SectionLocation) : DocumentSymbol =
        let range =
            { Start =
                { Line = uint32 section.Line
                  Character = 0u }
              End =
                { Line = uint32 section.EndLine
                  Character = 0u } }

        { Name = $"[{section.Name}]"
          Detail = None
          Kind = symbolKindForSection section.Name
          Tags = None
          Deprecated = None
          Range = range
          SelectionRange = range
          Children = None }

    let getDocumentText (uri: string) : string option =
        Workspace.tryGetDocument uri |> Option.map _.Text

    let uriToFilePath (uri: string) : string =
        if uri.StartsWith "file://" then
            System.Uri(uri).LocalPath
        else
            uri

    let uriToDirectoryPath (uri: string) : string =
        uriToFilePath uri |> System.IO.Path.GetDirectoryName

    let parseRequestFromUri (uri: string) : NapRequest option =
        getDocumentText uri
        |> Option.bind (fun text ->
            match Parser.parseNapFile text with
            | Result.Ok napFile -> Some napFile.Request
            | Result.Error _ -> None)

    let methodString (m: HttpMethod) : string =
        match m with
        | GET -> "GET"
        | POST -> "POST"
        | PUT -> "PUT"
        | PATCH -> "PATCH"
        | DELETE -> "DELETE"
        | HEAD -> "HEAD"
        | OPTIONS -> "OPTIONS"

    // ─── Lifecycle ───────────────────────────────────────────

    override _.Initialize(_param) =
        async {
            Logger.info $"{serverName} initializing"
            do! client.LogInfo $"{serverName} v{serverVersion} initializing"

            return
                Result.Ok
                    { InitializeResult.Capabilities = capabilities
                      ServerInfo =
                        Some
                            { InitializeResultServerInfo.Name = serverName
                              Version = Some serverVersion } }
        }

    override _.Initialized(_param) =
        async {
            Logger.info $"{serverName} initialized"
            do! client.LogInfo $"{serverName} ready"
        }

    override _.Shutdown() =
        async {
            Logger.info $"{serverName} shutting down"
            return Result.Ok()
        }

    override _.Exit() =
        async { Logger.info $"{serverName} exiting" }

    // ─── Document Sync ───────────────────────────────────────

    override _.TextDocumentDidOpen(param) =
        async {
            let doc = param.TextDocument
            Workspace.openDocument doc.Uri (int doc.Version) doc.Text
            do! client.LogDebug $"Opened {doc.Uri}"
        }

    override _.TextDocumentDidChange(param) =
        async {
            let doc = param.TextDocument

            match param.ContentChanges with
            | [| U2.C2 { Text = newText } |] ->
                Workspace.changeDocument doc.Uri (int doc.Version) newText
                do! client.LogDebug $"Changed {doc.Uri}"
            | _ -> Logger.warn "Received unsupported partial/multi change"
        }

    override _.TextDocumentDidClose(param) =
        async {
            let doc = param.TextDocument
            Workspace.closeDocument doc.Uri
            do! client.LogDebug $"Closed {doc.Uri}"
        }

    // ─── Document Symbols ────────────────────────────────────
    // Replaces: extractHttpMethod, parsePlaylistStepPaths, CodeLens section detection in TS

    override _.TextDocumentDocumentSymbol(param) =
        async {
            let uri = param.TextDocument.Uri

            match getDocumentText uri with
            | None -> return Result.Ok None
            | Some text ->
                let sections =
                    if isNapFile uri then
                        SectionScanner.scanNapSections text
                    elif isNaplistFile uri then
                        SectionScanner.scanNaplistSections text
                    else
                        []

                let symbols = sections |> List.map sectionToSymbol |> Array.ofList

                Logger.debug $"documentSymbol: {uri} -> {symbols.Length} symbols"
                return Result.Ok(Some(U2.C2 symbols))
        }

    // ─── Code Lens ───────────────────────────────────────────
    // Replaces: codeLensProvider.ts section scanning + method extraction in TS

    override _.TextDocumentCodeLens(param) =
        async {
            let uri = param.TextDocument.Uri

            match getDocumentText uri with
            | None -> return Result.Ok None
            | Some text when isNapFile uri ->
                let sections = SectionScanner.scanNapSections text

                let lenses =
                    sections
                    |> List.choose (fun s ->
                        if s.Name = "request" then
                            let range =
                                { Start = { Line = uint32 s.Line; Character = 0u }
                                  End = { Line = uint32 s.Line; Character = 0u } }

                            // Extract method + URL for display
                            let detail =
                                match Parser.parseNapFile text with
                                | Result.Ok nap -> Some $"{methodString nap.Request.Method} {nap.Request.Url}"
                                | Result.Error _ -> None

                            Some
                                { Range = range
                                  Command = None
                                  Data = detail |> Option.map (fun d -> JValue(d) :> JToken) }
                        else
                            None)
                    |> Array.ofList

                Logger.debug $"codeLens: {uri} -> {lenses.Length} lenses"
                return Result.Ok(Some lenses)
            | Some text when isNaplistFile uri ->
                let sections = SectionScanner.scanNaplistSections text

                let lenses =
                    sections
                    |> List.choose (fun s ->
                        if s.Name = "meta" then
                            let range =
                                { Start = { Line = uint32 s.Line; Character = 0u }
                                  End = { Line = uint32 s.Line; Character = 0u } }

                            Some
                                { Range = range
                                  Command = None
                                  Data = None }
                        else
                            None)
                    |> Array.ofList

                return Result.Ok(Some lenses)
            | _ -> return Result.Ok None
        }

    // ─── Execute Command ─────────────────────────────────────
    // Replaces: parseMethodAndUrl, detectEnvironments, curl generation in TS

    override _.WorkspaceExecuteCommand(param) =
        let extractedArg =
            param.Arguments
            |> Option.bind Array.tryHead
            |> Option.map (fun (t: JToken) -> t.ToObject<string>())
            |> Option.defaultValue ""

        async {
            match param.Command with
            | cmd when cmd = commandRequestInfo ->
                let uri = extractedArg

                match parseRequestFromUri uri with
                | Some request ->
                    let result = JObject()
                    result["method"] <- JValue(methodString request.Method)
                    result["url"] <- JValue(request.Url)
                    let headers = JObject()
                    request.Headers |> Map.iter (fun k v -> headers[k] <- JValue(v))
                    result["headers"] <- headers
                    Logger.debug $"requestInfo: {uri} -> {methodString request.Method} {request.Url}"
                    return Result.Ok(Some(result :> JToken))
                | None -> return Result.Ok None

            | cmd when cmd = commandCopyCurl ->
                let uri = extractedArg

                match parseRequestFromUri uri with
                | Some request ->
                    let curl = CurlGenerator.toCurl request
                    Logger.debug $"copyCurl: {uri} -> {curl}"
                    return Result.Ok(Some(JValue(curl) :> JToken))
                | None -> return Result.Ok None

            | cmd when cmd = commandListEnvs ->
                let rootUri = extractedArg
                let dir = uriToFilePath rootUri
                let envNames = Environment.detectEnvironmentNames dir
                Logger.debug $"listEnvironments: {dir} -> {envNames.Length} envs"
                let arr = JArray(envNames |> List.map (fun n -> JValue(n) :> JToken))
                return Result.Ok(Some(arr :> JToken))

            | _ ->
                Logger.warn $"Unknown command: {param.Command}"
                return Result.Ok None
        }

    override _.Dispose() = ()

/// Public entry point used by Napper.Cli and tests.
module LspRunner =

    let private defaultJsonRpcFormatter () =
        let fmt = new JsonMessageFormatter()
        fmt.JsonSerializer.NullValueHandling <- NullValueHandling.Ignore
        fmt.JsonSerializer.ConstructorHandling <- ConstructorHandling.AllowNonPublicDefaultConstructor
        fmt.JsonSerializer.MissingMemberHandling <- MissingMemberHandling.Ignore
        fmt.JsonSerializer.Converters.Add(StrictNumberConverter())
        fmt.JsonSerializer.Converters.Add(StrictStringConverter())
        fmt.JsonSerializer.Converters.Add(StrictBoolConverter())
        fmt.JsonSerializer.Converters.Add(SingleCaseUnionConverter())
        fmt.JsonSerializer.Converters.Add(OptionConverter())
        fmt.JsonSerializer.Converters.Add(ErasedUnionConverter())
        fmt.JsonSerializer.ContractResolver <- OptionAndCamelCasePropertyNamesContractResolver()
        fmt

    let private createRpc (handler: IJsonRpcMessageHandler) : JsonRpc =
        let rec (|HandleableException|_|) (e: exn) =
            match e with
            | :? LocalRpcException -> Some()
            | :? TaskCanceledException -> Some()
            | :? OperationCanceledException -> Some()
            | :? JsonSerializationException -> Some()
            | :? AggregateException as aex ->
                aex.InnerExceptions |> Seq.tryHead |> Option.bind (|HandleableException|_|)
            | _ -> None

        let strategy = ActivityTracingStrategy()

        { new JsonRpc(handler, ActivityTracingStrategy = strategy) with
            member _.IsFatalException(ex: Exception) =
                match ex with
                | HandleableException -> false
                | _ -> true

            member this.CreateErrorDetails(request: Protocol.JsonRpcRequest, ex: Exception) =
                match ex with
                | :? JsonSerializationException as jex ->
                    let isSerializable = this.ExceptionStrategy = ExceptionProcessing.ISerializable

                    let data: obj =
                        if isSerializable then (jex :> obj)
                        else Protocol.CommonErrorData(jex)

                    Protocol.JsonRpcError.ErrorDetail(
                        Code = Protocol.JsonRpcErrorCode.ParseError,
                        Message = jex.Message,
                        Data = data)
                | _ -> base.CreateErrorDetails(request, ex) }

    /// Start the LSP server over the given streams. Returns the exit code.
    /// Called by Napper.Cli for 'napper lsp' and by tests via in-process pipes.
    let run (input: Stream) (output: Stream) : int =
        try
            let requestHandlings: Map<string, Mappings.ServerRequestHandling<_>> =
                Server.defaultRequestHandlings ()

            let result =
                Server.start
                    requestHandlings
                    input
                    output
                    (fun (notifier, requester) -> new Client(notifier, requester))
                    (fun client -> new NapLspServer(client))
                    createRpc

            int result
        with ex ->
            eprintfn $"napper lsp crashed: %A{ex}"
            1
