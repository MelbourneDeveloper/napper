namespace DotHttp

/// Dialect of .http file
type HttpDialect =
    | Microsoft
    | JetBrains
    | Common

/// A single parsed HTTP request from a .http file
type HttpRequest = {
    Name       : string option
    Method     : string
    Url        : string
    HttpVersion: string option
    Headers    : (string * string) list
    Body       : string option
    PreScript  : string option
    PostScript : string option
    Comments   : string list
}

/// A fully parsed .http file
type HttpFile = {
    Requests      : HttpRequest list
    FileVariables : (string * string) list
    Dialect       : HttpDialect
}
