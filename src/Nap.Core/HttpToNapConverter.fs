module Nap.Core.HttpToNapConverter

open System
open System.Text.Json
open DotHttp
open Nap.Core.OpenApiTypes

type ConvertWarning = {
    RequestName: string option
    Message: string
}

type ConvertResult = {
    GeneratedFiles: (string * string) list
    Warnings: ConvertWarning list
}

[<Literal>]
let private ScriptWarningPrefix = "Script block not converted: "

[<Literal>]
let private EnvParseError = "Failed to parse environment JSON"

let private slugify (text: string) : string =
    text.ToLowerInvariant()
    |> Seq.map (fun c -> if Char.IsLetterOrDigit c then c else '-')
    |> String.Concat
    |> fun s -> s.Trim('-')

let private requestSlug (req: HttpRequest) : string =
    match req.Name with
    | Some name -> slugify name
    | None ->
        let urlPart =
            let uri = req.Url.TrimStart('/')
            let noQuery = uri.Split([| '?' |], 2).[0]
            slugify noQuery
        sprintf "%s-%s" (req.Method.ToLowerInvariant()) urlPart

let private padIndex (idx: int) (total: int) : string =
    let digits = if total >= PadLargeThreshold then PadDigitsLarge else PadDigitsDefault
    (string (idx + 1)).PadLeft(digits, '0')

let private buildMeta (req: HttpRequest) : string list =
    match req.Name with
    | Some name -> [ SectionMeta; sprintf "%s = %s" KeyName name; "" ]
    | None -> []

let private buildVars (fileVars: (string * string) list) : string list =
    if List.isEmpty fileVars then []
    else
        let lines = fileVars |> List.map (fun (k, v) -> sprintf "%s = \"%s\"" k v)
        [ SectionVars ] @ lines @ [ "" ]

let private buildRequest (req: HttpRequest) : string list =
    [ SectionRequest; sprintf "%s %s" (req.Method.ToUpperInvariant()) req.Url; "" ]

let private buildHeaders (req: HttpRequest) : string list =
    if List.isEmpty req.Headers then []
    else
        let lines = req.Headers |> List.map (fun (k, v) -> sprintf "%s = %s" k v)
        [ SectionRequestHeaders ] @ lines @ [ "" ]

let private buildBody (req: HttpRequest) : string list =
    match req.Body with
    | None -> []
    | Some body ->
        let contentType =
            req.Headers
            |> List.tryFind (fun (k, _) -> String.Equals(k, HeaderContentType, StringComparison.OrdinalIgnoreCase))
            |> Option.map snd
            |> Option.defaultValue ContentTypeJson
        [ SectionRequestBody
          sprintf "content-type = %s" contentType
          TripleQuote; body; TripleQuote; "" ]

let private buildComments (req: HttpRequest) : string list =
    if List.isEmpty req.Comments then []
    else req.Comments |> List.map (sprintf "# %s")

let private buildNapContent (req: HttpRequest) (fileVars: (string * string) list) : string =
    (buildComments req @ buildMeta req @ buildVars fileVars @ buildRequest req @ buildHeaders req @ buildBody req)
    |> String.concat "\n"

let private checkWarnings (req: HttpRequest) : ConvertWarning list =
    let warnings = ResizeArray<ConvertWarning>()
    match req.PreScript with
    | Some s ->
        warnings.Add { RequestName = req.Name; Message = sprintf "%s%s" ScriptWarningPrefix (s.Substring(0, min 50 s.Length)) }
    | None -> ()
    match req.PostScript with
    | Some s ->
        warnings.Add { RequestName = req.Name; Message = sprintf "%s%s" ScriptWarningPrefix (s.Substring(0, min 50 s.Length)) }
    | None -> ()
    Seq.toList warnings

let convert (httpFile: HttpFile) : ConvertResult =
    let total = httpFile.Requests.Length
    let files =
        httpFile.Requests
        |> List.mapi (fun i req ->
            let prefix = padIndex i total
            let slug = requestSlug req
            let fileName = sprintf "%s_%s%s" prefix slug NapExtension
            let content = buildNapContent req httpFile.FileVariables
            (fileName, content))
    let warnings =
        httpFile.Requests |> List.collect checkWarnings
    { GeneratedFiles = files; Warnings = warnings }

let convertEnvJson (json: string) (isPrivate: bool) : Result<(string * string) list, string> =
    try
        let doc = JsonDocument.Parse(json)
        let files =
            [ for prop in doc.RootElement.EnumerateObject() do
                let envName = prop.Name
                let vars =
                    [ for v in prop.Value.EnumerateObject() do
                        sprintf "%s = \"%s\"" v.Name (v.Value.GetString()) ]
                let content = String.Join("\n", vars) + "\n"
                let fileName =
                    if isPrivate then sprintf "%s.local" NapenvExtension
                    else sprintf "%s.%s" NapenvExtension envName
                (fileName, content) ]
        Ok files
    with ex ->
        Error (sprintf "%s: %s" EnvParseError ex.Message)
