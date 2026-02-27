namespace Nap.Core

open System
open System.Net.Http

/// Assertion operators used in [assert] blocks
type AssertOp =
    | Equals of string
    | Exists
    | Contains of string
    | Matches of string
    | LessThan of string
    | GreaterThan of string

/// A single assertion line, e.g. status = 200, body.id exists
type Assertion = {
    Target : string   // e.g. "status", "body.id", "headers.Content-Type", "duration"
    Op     : AssertOp
}

/// HTTP method
type HttpMethod =
    | GET | POST | PUT | PATCH | DELETE | HEAD | OPTIONS
    member this.ToNetMethod() =
        match this with
        | GET     -> System.Net.Http.HttpMethod.Get
        | POST    -> System.Net.Http.HttpMethod.Post
        | PUT     -> System.Net.Http.HttpMethod.Put
        | PATCH   -> System.Net.Http.HttpMethod.Patch
        | DELETE  -> System.Net.Http.HttpMethod.Delete
        | HEAD    -> System.Net.Http.HttpMethod.Head
        | OPTIONS -> System.Net.Http.HttpMethod.Options

/// Script references (pre/post hooks)
type ScriptRef = {
    Pre  : string option
    Post : string option
}

/// Metadata block [meta]
type NapMeta = {
    Name        : string option
    Description : string option
    Tags        : string list
}

/// Request body
type RequestBody = {
    ContentType : string
    Content     : string
}

/// The request definition from a .nap file
type NapRequest = {
    Method  : HttpMethod
    Url     : string
    Headers : Map<string, string>
    Body    : RequestBody option
}

/// A fully parsed .nap file
type NapFile = {
    Meta       : NapMeta
    Vars       : Map<string, string>
    Request    : NapRequest
    Assertions : Assertion list
    Script     : ScriptRef
}

/// Result of evaluating a single assertion
type AssertionResult = {
    Assertion : Assertion
    Passed    : bool
    Expected  : string
    Actual    : string
}

/// The HTTP response captured after running a request
type NapResponse = {
    StatusCode : int
    Headers    : Map<string, string>
    Body       : string
    Duration   : TimeSpan
}

/// Overall result of running a single .nap file
type NapResult = {
    File       : string
    Request    : NapRequest
    Response   : NapResponse option
    Assertions : AssertionResult list
    Passed     : bool
    Error      : string option
    Log        : string list
}

/// A step in a .naplist playlist
type PlaylistStep =
    | NapFileStep of string       // path to a .nap file
    | PlaylistRef of string       // path to another .naplist
    | FolderRef of string         // path to a folder
    | ScriptStep of string        // path to an .fsx or .csx orchestration script

/// A parsed .naplist file
type NapPlaylist = {
    Meta  : NapMeta
    Env   : string option
    Vars  : Map<string, string>
    Steps : PlaylistStep list
}
