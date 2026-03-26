namespace Napper.Lsp

open Ionide.LanguageServerProtocol
open Ionide.LanguageServerProtocol.JsonRpc

/// Wraps the LSP client connection for sending notifications back to the IDE
type Client(notificationSender: Server.ClientNotificationSender, requestSender: Server.ClientRequestSender) =
    inherit LspClient()

    member this.LogDebug(message: string) : Async<unit> =
        this.WindowLogMessage(
            { Type = Types.MessageType.Debug
              Message = message }
        )

    member this.LogInfo(message: string) : Async<unit> =
        this.WindowLogMessage(
            { Type = Types.MessageType.Info
              Message = message }
        )

    override this.WindowLogMessage p =
        match box p with
        | null -> async { () }
        | value -> notificationSender "window/logMessage" value |> Async.Ignore

    override this.WindowShowMessage p =
        match box p with
        | null -> async { () }
        | value -> notificationSender "window/showMessage" value |> Async.Ignore

    override this.WindowShowMessageRequest p =
        match box p with
        | null -> async { return Result.Error(Error.InternalError("Parameter was null")) }
        | value -> requestSender.Send "window/showMessageRequest" value
