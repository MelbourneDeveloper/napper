module Nap.Core.OpenApiTypes

// --- String constants for .nap file generation (single location) ---

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
let DefaultBaseUrl = "https://api.example.com"

[<Literal>]
let DefaultTitle = "API Tests"

[<Literal>]
let AuthBearerPrefix = "Bearer "

[<Literal>]
let AuthBasicPrefix = "Basic "

[<Literal>]
let AuthHeaderName = "Authorization"

[<Literal>]
let SchemaExampleString = "example"

[<Literal>]
let InvalidSpecError = "Invalid OpenAPI specification: missing paths"

[<Literal>]
let NoEndpointsError = "No endpoints found in specification"

[<Literal>]
let ParseError = "Failed to parse specification"

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
let BearerScheme = "bearer"

[<Literal>]
let BasicScheme = "basic"

// --- Auth descriptor ---

type AuthHeader = {
    HeaderName: string
    HeaderValue: string
    VarName: string
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
