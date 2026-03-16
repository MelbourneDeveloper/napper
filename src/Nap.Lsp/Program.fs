/// Entry point for the napper-lsp language server.
/// LSP takes over stdio — do NOT read/write to stdin/stdout directly.
module Nap.Lsp.Program

open System
open System.Threading.Tasks
open Ionide.LanguageServerProtocol
open Ionide.LanguageServerProtocol.JsonUtils
open Nap.Lsp
open Newtonsoft.Json
open StreamJsonRpc

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
                let data: obj = if isSerializable then (jex :> obj) else Protocol.CommonErrorData(jex)
                Protocol.JsonRpcError.ErrorDetail(
                    Code = Protocol.JsonRpcErrorCode.ParseError,
                    Message = jex.Message,
                    Data = data
                )
            | _ -> base.CreateErrorDetails(request, ex) }

let private startServer () =
    let input = Console.OpenStandardInput()
    let output = Console.OpenStandardOutput()

    let requestHandlings : Map<string, Mappings.ServerRequestHandling<_>> =
        Server.defaultRequestHandlings ()

    Server.start
        requestHandlings
        input
        output
        (fun (notifier, requester) -> new Client(notifier, requester))
        (fun client -> new NapLspServer(client))
        createRpc

[<EntryPoint>]
let main _args =
    try
        let result = startServer ()
        int result
    with ex ->
        eprintfn $"napper-lsp crashed: %A{ex}"
        1
