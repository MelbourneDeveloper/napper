module DotHttp.Parser

open FParsec
open DotHttp

// ─── Constants ─────────────────────────────────────────────────

[<Literal>]
let private Separator = "###"

[<Literal>]
let private ScriptFilePrefix = "file:"

// ─── Known methods ─────────────────────────────────────────────

let private httpMethods =
    [ "GET"; "POST"; "PUT"; "PATCH"; "DELETE"; "HEAD"; "OPTIONS"; "TRACE"; "CONNECT" ]

let private unsupportedMethods =
    [ "WEBSOCKET"; "GRPC"; "GRAPHQL" ]

// ─── Discriminated union for parsed lines ──────────────────────

type private Part =
    | PSeparator of string option
    | PComment of string
    | PMsName of string
    | PMsVar of string * string
    | PMethod of string * string * string option
    | PHeader of string * string
    | PBody of string
    | PPreScript of string
    | PPostScript of string
    | PUnsupported of string
    | PBlank

// ─── Utility parsers ───────────────────────────────────────────

let private trimmedRestOfLine : Parser<string, unit> =
    restOfLine true |>> fun s -> s.Trim()

let private lineEnd' : Parser<unit, unit> = skipNewline <|> eof

// ─── Separator: ### [optional name] ────────────────────────────

let private pSeparator : Parser<Part, unit> =
    pstring Separator >>. trimmedRestOfLine
    |>> fun s ->
        let trimmed = s.Trim()
        let name =
            if trimmed = "" then None
            else
                let stripped =
                    if trimmed.StartsWith "#" then trimmed.TrimStart('#').Trim()
                    elif trimmed.StartsWith "//" then trimmed.Substring(2).Trim()
                    else trimmed
                if stripped = "" then None else Some stripped
        PSeparator name

// ─── Comment lines: # or // ────────────────────────────────────

let private pHashComment : Parser<Part, unit> =
    pchar '#' >>. notFollowedBy (pstring "##")
    >>. restOfLine true
    |>> fun s -> PComment (s.Trim())

let private pSlashComment : Parser<Part, unit> =
    pstring "//" >>. restOfLine true
    |>> fun s -> PComment (s.Trim())

// ─── Microsoft @variable = value ───────────────────────────────

let private pMsVar : Parser<Part, unit> =
    pchar '@'
    >>. many1Satisfy (fun c -> c <> ' ' && c <> '\t' && c <> '=' && c <> '\n' && c <> '\r')
    .>> spaces .>> pchar '=' .>> spaces
    .>>. trimmedRestOfLine
    |>> PMsVar

// ─── Microsoft # @name directive ───────────────────────────────

let private pMsName : Parser<Part, unit> =
    pchar '#' >>. spaces >>. pchar '@' >>. pstring "name"
    >>. spaces1 >>. trimmedRestOfLine
    |>> PMsName

// ─── Method line: METHOD URL [HTTP/version] ────────────────────

let private pMethodLine : Parser<Part, unit> =
    let pMethod =
        httpMethods
        |> List.map (fun m -> attempt (stringCIReturn m (m.ToUpperInvariant())))
        |> choice
    pMethod .>> spaces1
    .>>. many1Satisfy (fun c -> c <> ' ' && c <> '\t' && c <> '\n' && c <> '\r')
    .>>. opt (attempt (pchar ' ' >>. spaces >>. pstring "HTTP/" >>. many1Satisfy (fun c -> c <> '\n' && c <> '\r') |>> fun v -> v.Trim()))
    .>> lineEnd'
    |>> fun ((m, url), ver) -> PMethod (m, url, ver)

// ─── Unsupported method lines (WEBSOCKET, GRPC, GRAPHQL) ──────

let private pUnsupported : Parser<Part, unit> =
    unsupportedMethods
    |> List.map (fun m -> attempt (stringCIReturn m m))
    |> choice
    .>> restOfLine true
    |>> PUnsupported

// ─── Header: Key: Value ────────────────────────────────────────

let private pHeader : Parser<Part, unit> =
    many1Satisfy (fun c -> c <> ':' && c <> '\n' && c <> '\r' && c <> ' ' && c <> '\t')
    .>> pchar ':' .>> spaces
    .>>. trimmedRestOfLine
    |>> PHeader

// ─── JetBrains inline scripts: < {% ... %} and > {% ... %} ────

let private pInlinePreScript : Parser<Part, unit> =
    pstring "< {%" >>. manyCharsTill anyChar (pstring "%}")
    .>> optional skipNewline
    |>> fun s -> PPreScript (s.Trim())

let private pInlinePostScript : Parser<Part, unit> =
    pstring "> {%" >>. manyCharsTill anyChar (pstring "%}")
    .>> optional skipNewline
    |>> fun s -> PPostScript (s.Trim())

// ─── JetBrains file references: < file.js and > file.js ───────

let private pFilePreScript : Parser<Part, unit> =
    pstring "< " >>. notFollowedBy (pstring "{%")
    >>. trimmedRestOfLine
    |>> fun s -> PPreScript (sprintf "%s%s" ScriptFilePrefix s)

let private pFilePostScript : Parser<Part, unit> =
    pstring "> " >>. notFollowedBy (pstring "{%")
    >>. trimmedRestOfLine
    |>> fun s -> PPostScript (sprintf "%s%s" ScriptFilePrefix s)

// ─── Body line (fallback) ──────────────────────────────────────

let private pBody : Parser<Part, unit> =
    notFollowedBy (pstring Separator)
    >>. notFollowedBy (attempt pMethodLine)
    >>. many1Satisfy (fun c -> c <> '\n' && c <> '\r')
    .>> optional skipNewline
    |>> PBody

// ─── Blank line ────────────────────────────────────────────────

/// Matches any whitespace-only content (at least one whitespace char consumed)
let private pBlank : Parser<Part, unit> =
    skipNewline |>> fun _ -> PBlank

// ─── Combined part parser (order matters) ──────────────────────

let private pPart : Parser<Part, unit> =
    choice [
        attempt pSeparator
        attempt pMsName
        attempt pMsVar
        attempt pInlinePreScript
        attempt pInlinePostScript
        attempt pFilePreScript
        attempt pFilePostScript
        attempt pUnsupported
        attempt pMethodLine
        attempt pHeader
        attempt pHashComment
        attempt pSlashComment
        attempt pBlank
        attempt pBody
    ]

// ─── Build HttpRequest from accumulated parts ──────────────────

let private buildRequest (parts: Part list) : HttpRequest option =
    let mutable name = None
    let mutable method' = None
    let mutable url = None
    let mutable httpVer = None
    let mutable headers = []
    let mutable bodyLines = []
    let mutable preScript = None
    let mutable postScript = None
    let mutable comments = []

    for p in parts do
        match p with
        | PSeparator n -> match n with Some s -> name <- Some s | None -> ()
        | PComment c -> comments <- comments @ [ c ]
        | PMsName n -> name <- Some n
        | PMsVar _ -> ()
        | PMethod (m, u, v) ->
            method' <- Some m
            url <- Some u
            httpVer <- v
        | PHeader (k, v) -> headers <- headers @ [ (k, v) ]
        | PBody l -> bodyLines <- bodyLines @ [ l ]
        | PPreScript s -> preScript <- Some s
        | PPostScript s -> postScript <- Some s
        | PUnsupported _ -> ()
        | PBlank -> ()

    match method', url with
    | Some m, Some u ->
        let body =
            let joined = bodyLines |> String.concat "\n" |> fun s -> s.Trim()
            if joined = "" then None else Some joined
        Some {
            Name = name
            Method = m
            Url = u
            HttpVersion = httpVer
            Headers = headers
            Body = body
            PreScript = preScript
            PostScript = postScript
            Comments = comments
        }
    | _ -> None

// ─── Split parts into per-request groups at separators ─────────

let private splitAtSeparators (parts: Part list) : Part list list =
    let mutable groups : Part list list = []
    let mutable current : Part list = []

    for p in parts do
        match p with
        | PSeparator _ ->
            if not (List.isEmpty current) then
                groups <- groups @ [ current ]
            current <- [ p ]
        | _ ->
            current <- current @ [ p ]

    if not (List.isEmpty current) then
        groups <- groups @ [ current ]
    groups

// ─── Dialect detection ─────────────────────────────────────────

let private detectDialect (parts: Part list) : HttpDialect =
    let hasMsFeatures =
        parts |> List.exists (fun p ->
            match p with PMsVar _ | PMsName _ -> true | _ -> false)
    let hasJbFeatures =
        parts |> List.exists (fun p ->
            match p with
            | PPreScript _ | PPostScript _ -> true
            | _ -> false)
    if hasJbFeatures then JetBrains
    elif hasMsFeatures then Microsoft
    else Common

// ─── File-level variable extraction ────────────────────────────

let private extractFileVars (parts: Part list) : (string * string) list =
    parts |> List.choose (fun p ->
        match p with PMsVar (k, v) -> Some (k, v) | _ -> None)

// ─── Public API ────────────────────────────────────────────────

/// Parse state for line-by-line processing
type private ParseState =
    | BeforeMethod   // before any method line in current request
    | InHeaders      // after method line, parsing headers
    | InBody         // after blank line following headers
    | InScript of prefix: string  // accumulating multiline script block

[<Literal>]
let private ScriptOpen = "{%"

[<Literal>]
let private ScriptClose = "%}"

/// Parse line by line with state tracking (handles multiline scripts)
let private parseAll (input: string) : Part list =
    let lines = input.Split [| '\n' |] |> Array.toList
    let acc = ResizeArray<Part>()
    let mutable state = BeforeMethod
    let mutable scriptLines = ResizeArray<string>()

    for line in lines do
        let lineInput = line + "\n"
        let trimmed = line.Trim()

        match state with
        | InScript prefix ->
            // Accumulating multiline script until closing %}
            let closeIdx = line.IndexOf ScriptClose
            if closeIdx >= 0 then
                let fragment = line.Substring(0, closeIdx).Trim()
                if fragment <> "" then scriptLines.Add fragment
                let content = scriptLines |> String.concat "\n" |> fun s -> s.Trim()
                let part =
                    if prefix = "<" then PPreScript content
                    else PPostScript content
                acc.Add part
                scriptLines <- ResizeArray<string>()
                state <- BeforeMethod
            else
                scriptLines.Add line
        | _ ->
            if trimmed = "" then
                match state with
                | InBody ->
                    acc.Add (PBody "")
                | InHeaders ->
                    acc.Add PBlank
                    state <- InBody
                | BeforeMethod ->
                    acc.Add PBlank
                | InScript _ -> ()
            else
                // Check for multiline script block start
                let isPreScriptStart = trimmed.StartsWith "< {%" && not (trimmed.Contains ScriptClose)
                let isPostScriptStart = trimmed.StartsWith "> {%" && not (trimmed.Contains ScriptClose)
                if isPreScriptStart then
                    let after = trimmed.Substring(4).Trim()
                    scriptLines <- ResizeArray<string>()
                    if after <> "" then scriptLines.Add after
                    state <- InScript "<"
                elif isPostScriptStart then
                    let after = trimmed.Substring(4).Trim()
                    scriptLines <- ResizeArray<string>()
                    if after <> "" then scriptLines.Add after
                    state <- InScript ">"
                else
                    match state with
                    | InBody ->
                        match run (attempt pSeparator) lineInput with
                        | Success (part, _, _) ->
                            acc.Add part
                            state <- BeforeMethod
                        | Failure _ ->
                            match run (attempt pMethodLine) lineInput with
                            | Success (part, _, _) ->
                                acc.Add part
                                state <- InHeaders
                            | Failure _ ->
                                // Check for script file references in body state
                                match run (attempt pFilePostScript) lineInput with
                                | Success (part, _, _) -> acc.Add part
                                | Failure _ ->
                                    match run (attempt pFilePreScript) lineInput with
                                    | Success (part, _, _) -> acc.Add part
                                    | Failure _ -> acc.Add (PBody trimmed)
                    | InScript _ -> ()
                    | _ ->
                        match run pPart lineInput with
                        | Success (part, _, _) ->
                            acc.Add part
                            match part with
                            | PMethod _ -> state <- InHeaders
                            | PSeparator _ -> state <- BeforeMethod
                            | _ -> ()
                        | Failure _ ->
                            acc.Add (PBody trimmed)
    acc |> Seq.toList

/// Parse a .http/.rest file into an HttpFile structure
let parse (input: string) : Result<HttpFile, string> =
    let parts = parseAll input
    let groups = splitAtSeparators parts
    let requests = groups |> List.choose buildRequest
    if List.isEmpty requests then
        Result.Error "No HTTP requests found in file"
    else
        Result.Ok {
            Requests = requests
            FileVariables = extractFileVars parts
            Dialect = detectDialect parts
        }
