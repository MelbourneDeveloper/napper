module Nap.Core.OpenApiGenerator

open System
open System.Net.Http
open System.Text.Json
open Microsoft.OpenApi
open Nap.Core.OpenApiTypes

// Type aliases so tests/callers can use: open Nap.Core.OpenApiGenerator
type GeneratedFile = OpenApiTypes.GeneratedFile
type GenerationResult = OpenApiTypes.GenerationResult

// --- Internal types ---

type private EndpointInfo = {
    Method: string
    UrlPath: string
    Operation: OpenApiOperation
    QueryParams: string list
    AuthHeaders: AuthHeader list
}

type private TagGroup = {
    Tag: string option
    Endpoints: EndpointInfo list
}

// --- Null-safe helpers ---

let private safeList (items: Collections.Generic.IList<'T>) : 'T list =
    match box items with
    | null -> []
    | _ -> Seq.toList items

let private safeSeq (items: Collections.Generic.IEnumerable<'T>) : 'T list =
    match box items with
    | null -> []
    | _ -> Seq.toList items

let private safeDict (dict: Collections.Generic.IDictionary<'K, 'V>) : ('K * 'V) list =
    match box dict with
    | null -> []
    | _ -> [ for kv in dict -> kv.Key, kv.Value ]

// --- HTTP method order ---

let private methodOrder = [
    HttpMethod.Get; HttpMethod.Post; HttpMethod.Put
    HttpMethod.Patch; HttpMethod.Delete; HttpMethod.Head; HttpMethod.Options
]

// --- Pure text helpers ---

let private convertPathParams (urlPath: string) : string =
    let sb = Text.StringBuilder()
    for c in urlPath do
        if c = '{' then sb.Append("{{") |> ignore
        elif c = '}' then sb.Append("}}") |> ignore
        else sb.Append(c) |> ignore
    sb.ToString()

let private splitOnDelimiters (text: string) : string list =
    let parts = Collections.Generic.List<string>()
    let current = Text.StringBuilder()
    for c in text do
        if c = '/' || c = '{' || c = '}' || c = ' ' then
            if current.Length > 0 then
                parts.Add(current.ToString().ToLowerInvariant())
                current.Clear() |> ignore
        else
            current.Append(c) |> ignore
    if current.Length > 0 then
        parts.Add(current.ToString().ToLowerInvariant())
    Seq.toList parts

let private pathToSlug (method: string) (urlPath: string) : string =
    match splitOnDelimiters urlPath with
    | [] -> method.ToLowerInvariant()
    | parts -> sprintf "%s-%s" (method.ToLowerInvariant()) (String.Join("-", parts))

let private titleToSlug (title: string) : string =
    match splitOnDelimiters title with
    | [] -> "api-tests"
    | parts -> String.Join("-", parts)

// --- Example value generation ---

let rec private generateExample (schema: IOpenApiSchema) (w: Utf8JsonWriter) : unit =
    match box schema.Example with
    | null -> writeByType schema w
    | _ -> schema.Example.WriteTo(w)

and private writeByType (schema: IOpenApiSchema) (w: Utf8JsonWriter) : unit =
    let t = schema.Type
    if not t.HasValue then w.WriteNullValue()
    else
        let v = t.Value
        if v.HasFlag(JsonSchemaType.String) then w.WriteStringValue(SchemaExampleString)
        elif v.HasFlag(JsonSchemaType.Number) then w.WriteNumberValue(0)
        elif v.HasFlag(JsonSchemaType.Integer) then w.WriteNumberValue(0)
        elif v.HasFlag(JsonSchemaType.Boolean) then w.WriteBooleanValue(true)
        elif v.HasFlag(JsonSchemaType.Array) then
            w.WriteStartArray()
            match box schema.Items with
            | null -> ()
            | _ -> generateExample schema.Items w
            w.WriteEndArray()
        elif v.HasFlag(JsonSchemaType.Object) then
            w.WriteStartObject()
            for k, propSchema in safeDict schema.Properties do
                w.WritePropertyName(k)
                generateExample propSchema w
            w.WriteEndObject()
        else w.WriteNullValue()

let private schemaToJson (schema: IOpenApiSchema) : string =
    use stream = new IO.MemoryStream()
    use w = new Utf8JsonWriter(stream, JsonWriterOptions(Indented = true))
    generateExample schema w
    w.Flush()
    Text.Encoding.UTF8.GetString(stream.ToArray())

// --- Request body extraction ---

let private extractRequestBody (op: OpenApiOperation) : string option =
    match box op.RequestBody with
    | null -> None
    | _ ->
        match box op.RequestBody.Content with
        | null -> None
        | _ ->
            match op.RequestBody.Content.TryGetValue(ContentTypeJson) with
            | true, media ->
                match box media.Example with
                | null ->
                    match box media.Schema with
                    | null -> None
                    | _ -> Some (schemaToJson media.Schema)
                | _ ->
                    let opts = JsonSerializerOptions(WriteIndented = true)
                    Some (media.Example.ToJsonString(opts))
            | _ -> None

// --- Status code helpers ---

let private findSuccessStatus (responses: OpenApiResponses) : int =
    match box responses with
    | null -> DefaultStatusCode
    | _ when responses.Count = 0 -> DefaultStatusCode
    | _ ->
        responses.Keys
        |> Seq.choose (fun k ->
            match Int32.TryParse(k) with
            | true, n when n >= DefaultStatusCode && n < RedirectMinCode -> Some n
            | _ -> None)
        |> Seq.sort
        |> Seq.tryHead
        |> Option.defaultValue DefaultStatusCode

// --- Response schema extraction ---

let private extractResponseSchema (responses: OpenApiResponses) : IOpenApiSchema option =
    match box responses with
    | null -> None
    | _ when responses.Count = 0 -> None
    | _ ->
        let code = string (findSuccessStatus responses)
        match responses.TryGetValue(code) with
        | true, resp ->
            match box resp.Content with
            | null -> None
            | _ ->
                match resp.Content.TryGetValue(ContentTypeJson) with
                | true, media ->
                    match box media.Schema with
                    | null -> None
                    | _ -> Some media.Schema
                | _ -> None
        | _ -> None

// --- Path/query param extraction ---

let private extractPathParams (urlPath: string) : string list =
    let result = Collections.Generic.List<string>()
    let current = Text.StringBuilder()
    let mutable inside = false
    for c in urlPath do
        if c = '{' then
            inside <- true
            current.Clear() |> ignore
        elif c = '}' && inside then
            inside <- false
            if current.Length > 0 then result.Add(current.ToString())
        elif inside then
            current.Append(c) |> ignore
    Seq.toList result

let private extractQueryParams (op: OpenApiOperation) : string list =
    safeList op.Parameters
    |> List.filter (fun p -> p.In.HasValue && p.In.Value = ParameterLocation.Query)
    |> List.map (fun p -> p.Name)

// --- Auth header resolution ---

let private resolveScheme (scheme: OpenApiSecuritySchemeReference) : AuthHeader option =
    match box scheme with
    | null -> None
    | _ ->
        if not scheme.Type.HasValue then None
        else
            match scheme.Type.Value with
            | SecuritySchemeType.Http ->
                if scheme.Scheme = BearerScheme then
                    Some { HeaderName = AuthHeaderName; HeaderValue = sprintf "%s{{token}}" AuthBearerPrefix; VarName = "token" }
                elif scheme.Scheme = BasicScheme then
                    Some { HeaderName = AuthHeaderName; HeaderValue = sprintf "%s{{basicAuth}}" AuthBasicPrefix; VarName = "basicAuth" }
                else None
            | SecuritySchemeType.ApiKey when scheme.In.HasValue && scheme.In.Value = ParameterLocation.Header ->
                if not (String.IsNullOrEmpty(scheme.Name)) then
                    Some { HeaderName = scheme.Name; HeaderValue = "{{apiKey}}"; VarName = "apiKey" }
                else None
            | _ -> None

let private resolveAuth (doc: OpenApiDocument) (op: OpenApiOperation) : AuthHeader list =
    let schemes =
        match box doc.Components with
        | null -> null
        | _ -> doc.Components.SecuritySchemes
    match box schemes with
    | null -> []
    | _ when schemes.Count = 0 -> []
    | _ ->
        let opSec = safeList op.Security
        let globalSec = safeList doc.Security
        let reqs = if not (List.isEmpty opSec) then opSec else globalSec
        reqs |> List.collect (fun req ->
            req |> Seq.choose (fun kv -> resolveScheme kv.Key) |> Seq.toList)

// --- Base URL extraction ---

let private extractBaseUrl (doc: OpenApiDocument) : string =
    match safeList doc.Servers with
    | first :: _ when not (String.IsNullOrEmpty(first.Url)) -> first.Url
    | _ -> DefaultBaseUrl

let private methodHasBody (m: string) : bool =
    m = "post" || m = "put" || m = "patch"

let private padIndex (idx: int) (total: int) : string =
    let digits = if total >= PadLargeThreshold then PadDigitsLarge else PadDigitsDefault
    (idx + 1).ToString().PadLeft(digits, '0')

// --- .nap content builders ---

let private buildMeta (ep: EndpointInfo) : string list =
    let name =
        if not (String.IsNullOrEmpty(ep.Operation.Summary)) then ep.Operation.Summary
        elif not (String.IsNullOrEmpty(ep.Operation.OperationId)) then ep.Operation.OperationId
        else pathToSlug ep.Method ep.UrlPath
    let lines = [ SectionMeta; sprintf "%s = %s" KeyName name; sprintf "%s = %s" KeyGenerated ValueTrue ]
    if not (String.IsNullOrEmpty(ep.Operation.Description)) then
        lines @ [ sprintf "%s = %s" KeyDescription ep.Operation.Description; "" ]
    else lines @ [ "" ]

let private buildVars (ep: EndpointInfo) : string list =
    let pathP = extractPathParams ep.UrlPath
    let authV = ep.AuthHeaders |> List.map (fun a -> a.VarName)
    let all = pathP @ ep.QueryParams @ authV
    if List.isEmpty all then []
    else
        let seen = Collections.Generic.HashSet<string>()
        let unique = all |> List.filter (fun v -> seen.Add(v))
        [ SectionVars ] @ (unique |> List.map (fun v -> sprintf "%s = \"%s\"" v VarsPlaceholder)) @ [ "" ]

let private buildQuery (qp: string list) : string =
    if List.isEmpty qp then ""
    else sprintf "?%s" (qp |> List.map (fun p -> sprintf "%s={{%s}}" p p) |> String.concat "&")

let private buildRequest (ep: EndpointInfo) : string list =
    let url = sprintf "%s%s%s" BaseUrlVar (convertPathParams ep.UrlPath) (buildQuery ep.QueryParams)
    [ SectionRequest; sprintf "%s %s" (ep.Method.ToUpperInvariant()) url; "" ]

let private buildHeaders (ep: EndpointInfo) : string list =
    let hasBody = methodHasBody ep.Method
    let hasAuth = not (List.isEmpty ep.AuthHeaders)
    if not hasBody && not hasAuth then []
    else
        let body =
            if hasBody then [ sprintf "%s = %s" HeaderContentType ContentTypeJson; sprintf "%s = %s" HeaderAccept ContentTypeJson ]
            else []
        let auth = ep.AuthHeaders |> List.map (fun a -> sprintf "%s = %s" a.HeaderName a.HeaderValue)
        [ SectionRequestHeaders ] @ body @ auth @ [ "" ]

let private buildBody (ep: EndpointInfo) : string list =
    if not (methodHasBody ep.Method) then []
    else
        match extractRequestBody ep.Operation with
        | None -> []
        | Some body -> [ SectionRequestBody; TripleQuote; body; TripleQuote; "" ]

let private buildAssertions (op: OpenApiOperation) : string list =
    let status = sprintf "%s%d" AssertStatusPrefix (findSuccessStatus op.Responses)
    let bodyAsserts =
        match extractResponseSchema op.Responses with
        | None -> []
        | Some schema ->
            safeDict schema.Properties
            |> List.map (fun (k, _) -> sprintf "%s%s%s" AssertBodyPrefix k AssertBodyExistsSuffix)
    [ SectionAssert; status ] @ bodyAsserts @ [ "" ]

let private buildNapContent (ep: EndpointInfo) : string =
    (buildMeta ep @ buildVars ep @ buildRequest ep @ buildHeaders ep @ buildBody ep @ buildAssertions ep.Operation)
    |> String.concat "\n"

// --- Collectors ---

let private collectEndpoints (doc: OpenApiDocument) : EndpointInfo list =
    match box doc.Paths with
    | null -> []
    | _ ->
        doc.Paths
        |> Seq.collect (fun pathKv ->
            let pathItem = pathKv.Value
            match box pathItem.Operations with
            | null -> Seq.empty
            | _ ->
                methodOrder |> Seq.choose (fun httpMethod ->
                    match pathItem.Operations.TryGetValue(httpMethod) with
                    | true, op ->
                        let method = httpMethod.Method.ToLowerInvariant()
                        Some {
                            Method = method; UrlPath = pathKv.Key; Operation = op
                            QueryParams = extractQueryParams op; AuthHeaders = resolveAuth doc op
                        }
                    | _ -> None))
        |> Seq.toList

let private groupByTag (eps: EndpointInfo list) : TagGroup list =
    let groups = Collections.Generic.Dictionary<string, EndpointInfo list>()
    for ep in eps do
        let tag =
            match safeSeq ep.Operation.Tags with
            | first :: _ when not (String.IsNullOrEmpty(first.Name)) -> first.Name
            | _ -> ""
        match groups.TryGetValue(tag) with
        | true, existing -> groups.[tag] <- existing @ [ ep ]
        | _ -> groups.[tag] <- [ ep ]
    [ for kv in groups -> { Tag = (if kv.Key = "" then None else Some kv.Key); Endpoints = kv.Value } ]

let private genGroupFiles (group: TagGroup) (idx: int ref) (total: int) : GeneratedFile list =
    group.Endpoints |> List.map (fun ep ->
        let slug =
            if not (String.IsNullOrEmpty(ep.Operation.OperationId)) then ep.Operation.OperationId
            else pathToSlug ep.Method ep.UrlPath
        let prefix = padIndex idx.Value total
        idx.Value <- idx.Value + 1
        let baseName = sprintf "%s_%s%s" prefix slug NapExtension
        let fileName = match group.Tag with Some t -> sprintf "%s/%s" (titleToSlug t) baseName | None -> baseName
        { FileName = fileName; Content = buildNapContent ep })

let private buildPlaylist (title: string) (files: string list) : string =
    ([ SectionMeta; sprintf "%s = %s" KeyName title; ""; SectionSteps ] @ (files |> List.map (sprintf "./%s")) @ [ "" ])
    |> String.concat "\n"

let private buildEnv (baseUrl: string) : string =
    sprintf "%s = %s\n" BaseUrlKey baseUrl

// --- Main entry point ---

let generate (jsonText: string) : Result<GenerationResult, string> =
    try
        let result = OpenApiDocument.Parse(jsonText)
        match box result.Document with
        | null -> Error ParseError
        | _ ->
            let doc = result.Document
            match box doc.Paths with
            | null -> Error InvalidSpecError
            | _ ->
                let endpoints = collectEndpoints doc
                if List.isEmpty endpoints then Error NoEndpointsError
                else
                    let baseUrl = extractBaseUrl doc
                    let title =
                        match box doc.Info with
                        | null -> DefaultTitle
                        | _ when String.IsNullOrEmpty(doc.Info.Title) -> DefaultTitle
                        | _ -> doc.Info.Title
                    let idx = ref 0
                    let napFiles =
                        groupByTag endpoints
                        |> List.collect (fun g -> genGroupFiles g idx endpoints.Length)
                    let playlist =
                        { FileName = sprintf "%s%s" (titleToSlug title) NaplistExtension
                          Content = buildPlaylist title (napFiles |> List.map (fun f -> f.FileName)) }
                    let environment =
                        { FileName = NapenvExtension
                          Content = buildEnv baseUrl }
                    Ok { NapFiles = napFiles; Playlist = playlist; Environment = environment }
    with _ -> Error ParseError
