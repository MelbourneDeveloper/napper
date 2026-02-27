module Nap.Core.OpenApiTypes

open System.Text.Json

// --- String constants (single location for all OpenAPI generation) ---

[<Literal>]
let NapExtension = ".nap"

[<Literal>]
let NaplistExtension = ".naplist"

[<Literal>]
let NapenvExtension = ".napenv"

[<Literal>]
let SectionMeta = "[meta]"

[<Literal>]
let SectionRequest = "[request]"

[<Literal>]
let SectionRequestHeaders = "[request.headers]"

[<Literal>]
let SectionRequestBody = "[request.body]"

[<Literal>]
let SectionAssert = "[assert]"

[<Literal>]
let SectionVars = "[vars]"

[<Literal>]
let SectionSteps = "[steps]"

[<Literal>]
let TripleQuote = "\"\"\""

[<Literal>]
let HeaderContentType = "Content-Type"

[<Literal>]
let HeaderAccept = "Accept"

[<Literal>]
let ContentTypeJson = "application/json"

[<Literal>]
let AssertStatusPrefix = "status = "

[<Literal>]
let AssertBodyExistsSuffix = " exists"

[<Literal>]
let AssertBodyPrefix = "body."

[<Literal>]
let KeyName = "name"

[<Literal>]
let KeyDescription = "description"

[<Literal>]
let KeyGenerated = "generated"

[<Literal>]
let ValueTrue = "true"

[<Literal>]
let BaseUrlVar = "{{baseUrl}}"

[<Literal>]
let BaseUrlKey = "baseUrl"

[<Literal>]
let VarsPlaceholder = "REPLACE_ME"

[<Literal>]
let HttpsScheme = "https"

[<Literal>]
let DefaultBaseUrl = "https://api.example.com"

[<Literal>]
let DefaultTitle = "API Tests"

[<Literal>]
let ParamInBody = "body"

[<Literal>]
let ParamInQuery = "query"

[<Literal>]
let AuthBearerPrefix = "Authorization = Bearer "

[<Literal>]
let AuthBasicPrefix = "Authorization = Basic "

[<Literal>]
let AuthHeaderName = "Authorization"

[<Literal>]
let SecurityTypeHttp = "http"

[<Literal>]
let SecuritySchemeBearer = "bearer"

[<Literal>]
let SecuritySchemeBasic = "basic"

[<Literal>]
let SecurityTypeApiKey = "apiKey"

[<Literal>]
let SecurityLocationHeader = "header"

[<Literal>]
let SchemaTypeString = "string"

[<Literal>]
let SchemaTypeNumber = "number"

[<Literal>]
let SchemaTypeInteger = "integer"

[<Literal>]
let SchemaTypeBoolean = "boolean"

[<Literal>]
let SchemaTypeArray = "array"

[<Literal>]
let SchemaTypeObject = "object"

[<Literal>]
let SchemaExampleString = "example"

[<Literal>]
let InvalidSpecError = "Invalid OpenAPI specification: missing paths"

[<Literal>]
let NoEndpointsError = "No endpoints found in specification"

[<Literal>]
let ParseError = "Failed to parse JSON"

[<Literal>]
let DefaultStatusCode = 200

[<Literal>]
let RedirectMinCode = 300

[<Literal>]
let PadDigitsDefault = 2

[<Literal>]
let PadDigitsLarge = 3

[<Literal>]
let PadLargeThreshold = 100

[<Literal>]
let JsonIndentSize = 2

let HttpMethods = [ "get"; "post"; "put"; "patch"; "delete"; "head"; "options" ]

// --- OpenAPI spec types ---

type OpenApiSchema = {
    Type: string option
    Properties: Map<string, OpenApiSchema>
    Items: OpenApiSchema option
    Example: JsonElement option
    Required: string list
}

type OpenApiMediaType = {
    Schema: OpenApiSchema option
    Example: JsonElement option
}

type OpenApiRequestBody = {
    Content: Map<string, OpenApiMediaType>
}

type OpenApiParameter = {
    Name: string
    In: string
    Schema: OpenApiSchema option
    Example: JsonElement option
}

type OpenApiResponse = {
    Description: string option
    Content: Map<string, OpenApiMediaType>
    Schema: OpenApiSchema option
}

type OpenApiSecurityScheme = {
    Type: string
    Scheme: string option
    In: string option
    Name: string option
}

type OpenApiOperation = {
    Summary: string option
    Description: string option
    OperationId: string option
    Tags: string list
    Parameters: OpenApiParameter list
    RequestBody: OpenApiRequestBody option
    Responses: Map<string, OpenApiResponse>
    Security: Map<string, string list> list option
}

type OpenApiPathItem = {
    Operations: Map<string, OpenApiOperation>
    Parameters: OpenApiParameter list
}

type OpenApiSpec = {
    Info: {| Title: string option |}
    Servers: string list
    Host: string option
    BasePath: string option
    Schemes: string list
    Paths: Map<string, OpenApiPathItem>
    Security: Map<string, string list> list option
    SecuritySchemes: Map<string, OpenApiSecurityScheme>
}

// --- Internal descriptors ---

type AuthHeader = {
    HeaderName: string
    HeaderValue: string
    VarName: string
}

type EndpointDescriptor = {
    Method: string
    UrlPath: string
    Operation: OpenApiOperation
    QueryParams: string list
    AuthHeaders: AuthHeader list
}

type TagGroup = {
    Tag: string option
    Endpoints: EndpointDescriptor list
}

// --- Output types ---

type GeneratedFile = {
    FileName: string
    Content: string
}

type GenerationResult = {
    NapFiles: GeneratedFile list
    Playlist: GeneratedFile
    Environment: GeneratedFile
}

type GenerateSummary = {
    FileCount: int
    Files: string list
    PlaylistPath: string
}
