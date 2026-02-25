module Nap.Core.Parser

open FParsec
open Nap.Core

// ─── Utility parsers ───────────────────────────────────────────

let private ws : Parser<unit, unit> = spaces
let private ws1 : Parser<unit, unit> = spaces1
let private lineEnd : Parser<unit, unit> = skipNewline <|> eof
let private commentLine : Parser<unit, unit> = pchar '#' >>. skipRestOfLine true
let private blankOrComment : Parser<unit, unit> = ws >>. optional commentLine >>. ws
let private skipCommentsAndBlanks : Parser<unit, unit> =
    skipMany (attempt (ws >>. commentLine)) >>. ws
let private quotedString =
    between (pchar '"') (pchar '"') (manySatisfy (fun c -> c <> '"'))
let private unquotedValue =
    many1Satisfy (fun c -> c <> '\n' && c <> '\r' && c <> '#')
    |>> fun s -> s.Trim()
let private value = quotedString <|> unquotedValue

// ─── Section header ────────────────────────────────────────────

let private sectionHeader name =
    ws >>. pchar '[' >>. pstring name >>. pchar ']' >>. skipRestOfLine true >>. ws

// ─── Key-value pair ────────────────────────────────────────────

let private keyValue =
    notFollowedBy (pstring "\"\"\"")
    >>. ws >>. many1Satisfy (fun c -> c <> '=' && c <> '\n' && c <> '\r' && c <> '[' && c <> '#')
    |>> fun s -> s.Trim()
    .>>. (pchar '=' >>. ws >>. value .>> skipRestOfLine true)

// ─── Shorthand parser (GET https://...) ────────────────────────

let private httpMethodStr =
    choice [
        stringCIReturn "GET" GET
        stringCIReturn "POST" POST
        stringCIReturn "PUT" PUT
        stringCIReturn "PATCH" PATCH
        stringCIReturn "DELETE" DELETE
        stringCIReturn "HEAD" HEAD
        stringCIReturn "OPTIONS" OPTIONS
    ]

let private shorthandParser : Parser<NapFile, unit> =
    ws >>. httpMethodStr .>> ws1 .>>. restOfLine true
    |>> fun (method, url) ->
        {
            Meta = { Name = None; Description = None; Tags = [] }
            Vars = Map.empty
            Request = {
                Method = method
                Url = url.Trim()
                Headers = Map.empty
                Body = None
            }
            Assertions = []
            Script = { Pre = None; Post = None }
        }

// ─── Meta block ────────────────────────────────────────────────

let private metaBlock =
    sectionHeader "meta" >>. many (keyValue .>> ws)
    |>> fun kvs ->
        let m = Map.ofList kvs
        {
            Name = Map.tryFind "name" m
            Description = Map.tryFind "description" m
            Tags =
                match Map.tryFind "tags" m with
                | Some t ->
                    t.Trim('[', ']').Split(',')
                    |> Array.map (fun s -> s.Trim().Trim('"'))
                    |> Array.filter (fun s -> s <> "")
                    |> Array.toList
                | None -> []
        }

// ─── Vars block ────────────────────────────────────────────────

let private varsBlock =
    sectionHeader "vars" >>. many (keyValue .>> ws)
    |>> Map.ofList

// ─── Request block ─────────────────────────────────────────────

let private requestBlock =
    sectionHeader "request" >>. many (keyValue .>> ws)
    |>> fun kvs ->
        let m = Map.ofList kvs
        let method =
            match Map.tryFind "method" m with
            | Some "GET" -> GET
            | Some "POST" -> POST
            | Some "PUT" -> PUT
            | Some "PATCH" -> PATCH
            | Some "DELETE" -> DELETE
            | Some "HEAD" -> HEAD
            | Some "OPTIONS" -> OPTIONS
            | Some other -> failwithf "Unknown HTTP method: %s" other
            | None -> GET
        let url =
            match Map.tryFind "url" m with
            | Some u -> u
            | None -> failwith "Missing 'url' in [request] block"
        method, url

// ─── Request headers block ─────────────────────────────────────

let private requestHeadersBlock =
    sectionHeader "request.headers" >>. many (keyValue .>> ws)
    |>> Map.ofList

// ─── Request body block ────────────────────────────────────────

let private tripleQuoted =
    pstring "\"\"\"" >>. manyCharsTill anyChar (pstring "\"\"\"")

let private requestBodyBlock =
    sectionHeader "request.body" >>. many (keyValue .>> ws)
    .>>. opt (ws >>. tripleQuoted .>> ws)
    |>> fun (kvs, body) ->
        let m = Map.ofList kvs
        let contentType = Map.tryFind "content-type" m |> Option.defaultValue "application/json"
        match body with
        | Some content -> Some { ContentType = contentType; Content = content.Trim() }
        | None ->
            match Map.tryFind "content" m with
            | Some content -> Some { ContentType = contentType; Content = content }
            | None -> None

// ─── Assert block ──────────────────────────────────────────────

let private assertionLine =
    ws >>. many1Satisfy (fun c -> c <> '\n' && c <> '\r' && c <> '#' && c <> '[')
    |>> fun line ->
        let line = line.Trim()
        if line = "" then None
        else
            let parts = line.Split([|' '|], 3, System.StringSplitOptions.RemoveEmptyEntries)
            match parts with
            | [| target; "exists" |] ->
                Some { Target = target; Op = Exists }
            | [| target; "="; value |] ->
                Some { Target = target; Op = Equals value }
            | [| target; "contains"; value |] ->
                Some { Target = target; Op = Contains (value.Trim('"')) }
            | [| target; "matches"; value |] ->
                Some { Target = target; Op = Matches (value.Trim('"')) }
            | [| target; "<"; value |] ->
                Some { Target = target; Op = LessThan value }
            | [| target; ">"; value |] ->
                Some { Target = target; Op = GreaterThan value }
            | _ -> None

let private assertBlock =
    sectionHeader "assert" >>. many (assertionLine .>> ws)
    |>> List.choose id

// ─── Script block ──────────────────────────────────────────────

let private scriptBlock =
    sectionHeader "script" >>. many (keyValue .>> ws)
    |>> fun kvs ->
        let m = Map.ofList kvs
        { Pre = Map.tryFind "pre" m; Post = Map.tryFind "post" m }

// ─── Full .nap parser ──────────────────────────────────────────

let private skip : Parser<unit, unit> = skipCommentsAndBlanks

let private fullParser : Parser<NapFile, unit> =
    skip
    >>. opt (attempt metaBlock) .>> skip
    .>>. opt (attempt varsBlock) .>> skip
    .>>. requestBlock .>> skip
    .>>. opt (attempt requestHeadersBlock) .>> skip
    .>>. opt (attempt requestBodyBlock) .>> skip
    .>>. opt (attempt assertBlock) .>> skip
    .>>. opt (attempt scriptBlock) .>> skip
    .>> eof
    |>> fun ((((((meta, vars), (method, url)), headers), body), asserts), script) ->
        {
            Meta = meta |> Option.defaultValue { Name = None; Description = None; Tags = [] }
            Vars = vars |> Option.defaultValue Map.empty
            Request = {
                Method = method
                Url = url
                Headers = headers |> Option.defaultValue Map.empty
                Body = body |> Option.defaultWith (fun () -> None)
            }
            Assertions = asserts |> Option.defaultValue []
            Script = script |> Option.defaultValue { Pre = None; Post = None }
        }

// ─── Public API ────────────────────────────────────────────────

let parseNapFile (input: string) : Result<NapFile, string> =
    // Try shorthand first (just "GET https://...")
    let shortResult = run shorthandParser input
    match shortResult with
    | Success(result, _, _) -> Result.Ok result
    | Failure _ ->
        // Try full format
        let fullResult = run fullParser input
        match fullResult with
        | Success(result, _, _) -> Result.Ok result
        | Failure(msg, _, _) -> Result.Error msg

/// Parse a .naplist file
let parseNapList (input: string) : Result<NapPlaylist, string> =
    let lines =
        input.Split([|'\n'; '\r'|], System.StringSplitOptions.RemoveEmptyEntries)
        |> Array.map (fun s -> s.Trim())
        |> Array.filter (fun s -> s <> "" && not (s.StartsWith "#"))
        |> Array.toList

    let mutable meta = { Name = None; Description = None; Tags = [] }
    let mutable env = None
    let mutable vars = Map.empty
    let mutable steps = []
    let mutable currentSection = ""

    for line in lines do
        if line.StartsWith "[" then
            currentSection <- line.Trim('[', ']').ToLowerInvariant()
        elif currentSection = "meta" && line.Contains "=" then
            let parts = line.Split([|'='|], 2)
            let key = parts[0].Trim()
            let value = parts[1].Trim().Trim('"')
            match key with
            | "name" -> meta <- { meta with Name = Some value }
            | "description" -> meta <- { meta with Description = Some value }
            | "env" -> env <- Some value
            | _ -> ()
        elif currentSection = "vars" && line.Contains "=" then
            let parts = line.Split([|'='|], 2)
            vars <- vars |> Map.add (parts[0].Trim()) (parts[1].Trim().Trim('"'))
        elif currentSection = "steps" then
            let step =
                if line.EndsWith ".nap" then NapFileStep line
                elif line.EndsWith ".naplist" then PlaylistRef line
                elif line.EndsWith ".fsx" then ScriptStep line
                elif not (line.Contains ".") then FolderRef line
                else NapFileStep line  // default to nap file
            steps <- steps @ [step]

    Result.Ok {
        Meta = meta
        Env = env
        Vars = vars
        Steps = steps
    }
