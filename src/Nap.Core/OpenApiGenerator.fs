module Nap.Core.OpenApiGenerator

open System
open System.Text.Json
open Nap.Core.OpenApiTypes
open Nap.Core.OpenApiParser

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

let rec private generateExample (schema: OpenApiSchema) (w: Utf8JsonWriter) : unit =
    match schema.Example with
    | Some ex -> ex.WriteTo(w)
    | None -> writeByType schema w

and private writeByType (schema: OpenApiSchema) (w: Utf8JsonWriter) : unit =
    match schema.Type with
    | Some t when t = SchemaTypeString -> w.WriteStringValue(SchemaExampleString)
    | Some t when t = SchemaTypeNumber -> w.WriteNumberValue(0)
    | Some t when t = SchemaTypeInteger -> w.WriteNumberValue(0)
    | Some t when t = SchemaTypeBoolean -> w.WriteBooleanValue(true)
    | Some t when t = SchemaTypeArray ->
        w.WriteStartArray()
        schema.Items |> Option.iter (fun items -> generateExample items w)
        w.WriteEndArray()
    | Some t when t = SchemaTypeObject ->
        w.WriteStartObject()
        for kv in schema.Properties do
            w.WritePropertyName(kv.Key)
            generateExample kv.Value w
        w.WriteEndObject()
    | _ -> w.WriteNullValue()

let private schemaToJson (schema: OpenApiSchema) : string =
    use stream = new IO.MemoryStream()
    use w = new Utf8JsonWriter(stream, JsonWriterOptions(Indented = true))
    generateExample schema w
    w.Flush()
    Text.Encoding.UTF8.GetString(stream.ToArray())

let private elementToJson (el: JsonElement) : string =
    JsonSerializer.Serialize(el, JsonSerializerOptions(WriteIndented = true))

// --- Request body extraction ---

let private extractOas3Body (media: OpenApiMediaType) : string option =
    match media.Example with
    | Some ex -> Some (elementToJson ex)
    | None -> media.Schema |> Option.map schemaToJson

let private extractSwagger2Body (param: OpenApiParameter) : string option =
    match param.Schema with
    | None -> None
    | Some schema ->
        match param.Example with
        | Some ex -> Some (elementToJson ex)
        | None -> Some (schemaToJson schema)

let private extractRequestBody (op: OpenApiOperation) : string option =
    let oas3 =
        op.RequestBody
        |> Option.bind (fun rb -> Map.tryFind ContentTypeJson rb.Content)
    match oas3 with
    | Some media -> extractOas3Body media
    | None ->
        op.Parameters
        |> List.tryFind (fun p -> p.In = ParamInBody)
        |> Option.bind extractSwagger2Body

// --- Status code helpers ---

let private findSuccessStatus (responses: Map<string, OpenApiResponse>) : int =
    if Map.isEmpty responses then DefaultStatusCode
    else
        responses
        |> Map.toList
        |> List.choose (fun (k, _) ->
            match Int32.TryParse(k) with
            | true, n when n >= DefaultStatusCode && n < RedirectMinCode -> Some n
            | _ -> None)
        |> List.sort
        |> List.tryHead
        |> Option.defaultValue DefaultStatusCode

// --- Response schema extraction ---

let private extractResponseSchema (responses: Map<string, OpenApiResponse>) : OpenApiSchema option =
    if Map.isEmpty responses then None
    else
        let code = string (findSuccessStatus responses)
        Map.tryFind code responses
        |> Option.bind (fun resp ->
            let oas3 =
                Map.tryFind ContentTypeJson resp.Content
                |> Option.bind (fun m -> m.Schema)
            oas3 |> Option.orElse resp.Schema)

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
    op.Parameters
    |> List.filter (fun p -> p.In = ParamInQuery)
    |> List.map (fun p -> p.Name)

// --- Auth header resolution ---

let private resolveScheme (scheme: OpenApiSecurityScheme) : AuthHeader option =
    if scheme.Type = SecurityTypeHttp && scheme.Scheme = Some SecuritySchemeBearer then
        Some { HeaderName = AuthHeaderName; HeaderValue = sprintf "%s{{token}}" AuthBearerPrefix; VarName = "token" }
    elif scheme.Type = SecurityTypeHttp && scheme.Scheme = Some SecuritySchemeBasic then
        Some { HeaderName = AuthHeaderName; HeaderValue = sprintf "%s{{basicAuth}}" AuthBasicPrefix; VarName = "basicAuth" }
    elif scheme.Type = SecurityTypeApiKey && scheme.In = Some SecurityLocationHeader then
        scheme.Name
        |> Option.filter (fun n -> n.Length > 0)
        |> Option.map (fun n -> { HeaderName = n; HeaderValue = "{{apiKey}}"; VarName = "apiKey" })
    else None

let private resolveAuth (spec: OpenApiSpec) (op: OpenApiOperation) : AuthHeader list =
    if Map.isEmpty spec.SecuritySchemes then []
    else
        let reqs = op.Security |> Option.orElse spec.Security
        match reqs with
        | None -> []
        | Some reqList ->
            reqList |> List.collect (fun reqMap ->
                reqMap |> Map.toList |> List.choose (fun (name, _) ->
                    Map.tryFind name spec.SecuritySchemes |> Option.bind resolveScheme))

// --- Base URL extraction ---

let private extractBaseUrl (spec: OpenApiSpec) : string =
    match spec.Servers with
    | first :: _ -> first
    | [] ->
        match spec.Host with
        | Some host when host.Length > 0 ->
            let scheme = spec.Schemes |> List.tryHead |> Option.defaultValue HttpsScheme
            sprintf "%s://%s%s" scheme host (spec.BasePath |> Option.defaultValue "")
        | _ -> DefaultBaseUrl

let private methodHasBody (m: string) : bool =
    m = "post" || m = "put" || m = "patch"

let private padIndex (idx: int) (total: int) : string =
    let digits = if total >= PadLargeThreshold then PadDigitsLarge else PadDigitsDefault
    (idx + 1).ToString().PadLeft(digits, '0')

// --- .nap content builders ---

let private buildMeta (ep: EndpointDescriptor) : string list =
    let name =
        ep.Operation.Summary
        |> Option.orElse ep.Operation.OperationId
        |> Option.defaultValue (pathToSlug ep.Method ep.UrlPath)
    let lines = [ SectionMeta; sprintf "%s = %s" KeyName name; sprintf "%s = %s" KeyGenerated ValueTrue ]
    match ep.Operation.Description with
    | Some desc -> lines @ [ sprintf "%s = %s" KeyDescription desc; "" ]
    | None -> lines @ [ "" ]

let private buildVars (ep: EndpointDescriptor) : string list =
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

let private buildRequest (ep: EndpointDescriptor) : string list =
    let url = sprintf "%s%s%s" BaseUrlVar (convertPathParams ep.UrlPath) (buildQuery ep.QueryParams)
    [ SectionRequest; sprintf "%s %s" (ep.Method.ToUpperInvariant()) url; "" ]

let private buildHeaders (ep: EndpointDescriptor) : string list =
    let hasBody = methodHasBody ep.Method
    let hasAuth = not (List.isEmpty ep.AuthHeaders)
    if not hasBody && not hasAuth then []
    else
        let body =
            if hasBody then [ sprintf "%s = %s" HeaderContentType ContentTypeJson; sprintf "%s = %s" HeaderAccept ContentTypeJson ]
            else []
        let auth = ep.AuthHeaders |> List.map (fun a -> sprintf "%s = %s" a.HeaderName a.HeaderValue)
        [ SectionRequestHeaders ] @ body @ auth @ [ "" ]

let private buildBody (ep: EndpointDescriptor) : string list =
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
            schema.Properties |> Map.toList |> List.map (fun (k, _) -> sprintf "%s%s%s" AssertBodyPrefix k AssertBodyExistsSuffix)
    [ SectionAssert; status ] @ bodyAsserts @ [ "" ]

let private buildNapContent (ep: EndpointDescriptor) : string =
    (buildMeta ep @ buildVars ep @ buildRequest ep @ buildHeaders ep @ buildBody ep @ buildAssertions ep.Operation)
    |> String.concat "\n"

// --- Collectors ---

let private collectEndpoints (spec: OpenApiSpec) : EndpointDescriptor list =
    spec.Paths |> Map.toList |> List.collect (fun (urlPath, pathItem) ->
        HttpMethods |> List.choose (fun m ->
            Map.tryFind m pathItem.Operations |> Option.map (fun op ->
                { Method = m; UrlPath = urlPath; Operation = op
                  QueryParams = extractQueryParams op; AuthHeaders = resolveAuth spec op })))

let private groupByTag (eps: EndpointDescriptor list) : TagGroup list =
    let groups = Collections.Generic.Dictionary<string option, EndpointDescriptor list>()
    for ep in eps do
        let tag = ep.Operation.Tags |> List.tryHead
        match groups.TryGetValue(tag) with
        | true, existing -> groups.[tag] <- existing @ [ ep ]
        | _ -> groups.[tag] <- [ ep ]
    [ for kv in groups -> { Tag = kv.Key; Endpoints = kv.Value } ]

let private genGroupFiles (group: TagGroup) (idx: int ref) (total: int) : GeneratedFile list =
    group.Endpoints |> List.map (fun ep ->
        let slug = ep.Operation.OperationId |> Option.defaultValue (pathToSlug ep.Method ep.UrlPath)
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

let generateFromOpenApi (jsonText: string) : Result<GenerationResult, string> =
    match parseSpec jsonText with
    | Error e -> Error e
    | Ok spec ->
        let endpoints = collectEndpoints spec
        if List.isEmpty endpoints then Error NoEndpointsError
        else
            let baseUrl = extractBaseUrl spec
            let title = spec.Info.Title |> Option.defaultValue DefaultTitle
            let idx = ref 0
            let napFiles = groupByTag endpoints |> List.collect (fun g -> genGroupFiles g idx endpoints.Length)
            let playlist = { FileName = sprintf "%s%s" (titleToSlug title) NaplistExtension; Content = buildPlaylist title (napFiles |> List.map (fun f -> f.FileName)) }
            let environment = { FileName = NapenvExtension; Content = buildEnv baseUrl }
            Ok { NapFiles = napFiles; Playlist = playlist; Environment = environment }
