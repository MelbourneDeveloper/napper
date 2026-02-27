module Nap.Core.OpenApiParser

open System.Text.Json
open Nap.Core.OpenApiTypes

// --- Safe JsonElement access helpers ---

let private tryGetProp (name: string) (el: JsonElement) : JsonElement option =
    match el.TryGetProperty(name) with
    | true, v -> Some v
    | _ -> None

let private getString (el: JsonElement) : string option =
    if el.ValueKind = JsonValueKind.String then Some (el.GetString())
    else None

let private getStringProp (name: string) (el: JsonElement) : string option =
    tryGetProp name el |> Option.bind getString

let private getStringList (el: JsonElement) : string list =
    if el.ValueKind = JsonValueKind.Array then
        [ for item in el.EnumerateArray() do
            if item.ValueKind = JsonValueKind.String then
                yield item.GetString() ]
    else []

let private getStringListProp (name: string) (el: JsonElement) : string list =
    tryGetProp name el
    |> Option.map getStringList
    |> Option.defaultValue []

let private getObjectKeys (el: JsonElement) : (string * JsonElement) list =
    if el.ValueKind = JsonValueKind.Object then
        [ for prop in el.EnumerateObject() -> prop.Name, prop.Value ]
    else []

// --- Schema reading ---

let rec private readSchema (el: JsonElement) : OpenApiSchema =
    {
        Type = getStringProp "type" el
        Properties =
            tryGetProp "properties" el
            |> Option.map (fun p ->
                getObjectKeys p
                |> List.map (fun (k, v) -> k, readSchema v)
                |> Map.ofList)
            |> Option.defaultValue Map.empty
        Items =
            tryGetProp "items" el |> Option.map readSchema
        Example =
            tryGetProp "example" el
        Required = getStringListProp "required" el
    }

// --- Media type reading ---

let private readMediaType (el: JsonElement) : OpenApiMediaType =
    {
        Schema = tryGetProp "schema" el |> Option.map readSchema
        Example = tryGetProp "example" el
    }

// --- Parameter reading ---

let private readParameter (el: JsonElement) : OpenApiParameter =
    {
        Name = getStringProp "name" el |> Option.defaultValue ""
        In = getStringProp "in" el |> Option.defaultValue ""
        Schema = tryGetProp "schema" el |> Option.map readSchema
        Example = tryGetProp "example" el
    }

let private readParameters (el: JsonElement) : OpenApiParameter list =
    if el.ValueKind = JsonValueKind.Array then
        [ for item in el.EnumerateArray() -> readParameter item ]
    else []

// --- Response reading ---

let private readResponse (el: JsonElement) : OpenApiResponse =
    {
        Description = getStringProp "description" el
        Content =
            tryGetProp "content" el
            |> Option.map (fun c ->
                getObjectKeys c
                |> List.map (fun (k, v) -> k, readMediaType v)
                |> Map.ofList)
            |> Option.defaultValue Map.empty
        Schema = tryGetProp "schema" el |> Option.map readSchema
    }

let private readResponses (el: JsonElement) : Map<string, OpenApiResponse> =
    getObjectKeys el
    |> List.map (fun (k, v) -> k, readResponse v)
    |> Map.ofList

// --- Security reading ---

let private readSecurityReq (el: JsonElement) : Map<string, string list> =
    getObjectKeys el
    |> List.map (fun (k, v) -> k, getStringList v)
    |> Map.ofList

let private readSecurityList (el: JsonElement) : Map<string, string list> list =
    if el.ValueKind = JsonValueKind.Array then
        [ for item in el.EnumerateArray() -> readSecurityReq item ]
    else []

// --- Security scheme reading ---

let private readSecurityScheme (el: JsonElement) : OpenApiSecurityScheme =
    {
        Type = getStringProp "type" el |> Option.defaultValue ""
        Scheme = getStringProp "scheme" el
        In = getStringProp "in" el
        Name = getStringProp "name" el
    }

let private readSecuritySchemes (el: JsonElement) : Map<string, OpenApiSecurityScheme> =
    getObjectKeys el
    |> List.map (fun (k, v) -> k, readSecurityScheme v)
    |> Map.ofList

// --- Request body reading ---

let private readRequestBody (el: JsonElement) : OpenApiRequestBody =
    {
        Content =
            tryGetProp "content" el
            |> Option.map (fun c ->
                getObjectKeys c
                |> List.map (fun (k, v) -> k, readMediaType v)
                |> Map.ofList)
            |> Option.defaultValue Map.empty
    }

// --- Operation reading ---

let private readOperation (el: JsonElement) : OpenApiOperation =
    {
        Summary = getStringProp "summary" el
        Description = getStringProp "description" el
        OperationId = getStringProp "operationId" el
        Tags = getStringListProp "tags" el
        Parameters =
            tryGetProp "parameters" el
            |> Option.map readParameters
            |> Option.defaultValue []
        RequestBody =
            tryGetProp "requestBody" el |> Option.map readRequestBody
        Responses =
            tryGetProp "responses" el
            |> Option.map readResponses
            |> Option.defaultValue Map.empty
        Security =
            tryGetProp "security" el
            |> Option.map (fun s -> readSecurityList s)
    }

// --- Path item reading ---

let private readPathItem (el: JsonElement) : OpenApiPathItem =
    let ops =
        HttpMethods
        |> List.choose (fun m ->
            tryGetProp m el |> Option.map (fun v -> m, readOperation v))
        |> Map.ofList
    {
        Operations = ops
        Parameters =
            tryGetProp "parameters" el
            |> Option.map readParameters
            |> Option.defaultValue []
    }

// --- Top-level spec reading ---

let private readPaths (el: JsonElement) : Map<string, OpenApiPathItem> =
    getObjectKeys el
    |> List.map (fun (k, v) -> k, readPathItem v)
    |> Map.ofList

let private readServers (el: JsonElement) : string list =
    if el.ValueKind = JsonValueKind.Array then
        [ for item in el.EnumerateArray() do
            match getStringProp "url" item with
            | Some url -> yield url
            | None -> () ]
    else []

let private readSpec (root: JsonElement) : Result<OpenApiSpec, string> =
    match tryGetProp "paths" root with
    | None -> Error InvalidSpecError
    | Some pathsEl ->
        Ok {
            Info = {| Title = tryGetProp "info" root |> Option.bind (getStringProp "title") |}
            Servers =
                tryGetProp "servers" root
                |> Option.map readServers
                |> Option.defaultValue []
            Host = getStringProp "host" root
            BasePath = getStringProp "basePath" root
            Schemes = getStringListProp "schemes" root
            Paths = readPaths pathsEl
            Security =
                tryGetProp "security" root
                |> Option.map readSecurityList
            SecuritySchemes =
                let oas3 =
                    tryGetProp "components" root
                    |> Option.bind (tryGetProp "securitySchemes")
                let swagger2 = tryGetProp "securityDefinitions" root
                oas3
                |> Option.orElse swagger2
                |> Option.map readSecuritySchemes
                |> Option.defaultValue Map.empty
        }

// --- Public entry point ---

let parseSpec (jsonText: string) : Result<OpenApiSpec, string> =
    try
        let doc = JsonDocument.Parse(jsonText)
        let root = doc.RootElement
        if root.ValueKind <> JsonValueKind.Object then
            Error InvalidSpecError
        else
            readSpec root
    with
    | _ -> Error ParseError
