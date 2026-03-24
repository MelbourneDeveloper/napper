module OpenApiCliTests
// Specs: openapi-generate, openapi-oas3, openapi-tag-dirs, openapi-auth,
//        openapi-baseurl, openapi-napenv-gen, openapi-naplist-gen, openapi-params,
//        openapi-body-gen, openapi-nap-gen

open System
open System.Net.Http
open Xunit
open Napper.Core.OpenApiTypes

/// Direct F# API tests against the live Petstore OpenAPI spec.
/// CLI-based e2e tests are in OpenApiE2eTests.fs — these test
/// the OpenApiGenerator.generate function without a CLI process.

// --- Constants ---

[<Literal>]
let private PetstoreSpecUrl = "https://petstore3.swagger.io/api/v3/openapi.json"

[<Literal>]
let private BeeceptorSpecUrl = "https://beeceptor.com/docs/storefront-sample.json"

[<Literal>]
let private MinExpectedNapFiles = 10

[<Literal>]
let private BeeceptorExpectedNapFiles = 11

[<Literal>]
let private BeeceptorBaseUrlDomain = "api.demo-ecommerce.com"

[<Literal>]
let private BeeceptorAuthRegisterPath = "/auth/register"

[<Literal>]
let private BeeceptorAuthLoginPath = "/auth/login"

[<Literal>]
let private BeeceptorProductsPath = "/products"

[<Literal>]
let private BeeceptorCartPath = "/cart"

[<Literal>]
let private BeeceptorCheckoutPath = "/checkout"

[<Literal>]
let private BeeceptorOrdersPath = "/orders"

[<Literal>]
let private BeeceptorAddressesPath = "/addresses"

[<Literal>]
let private PetTagFolder = "pet"

[<Literal>]
let private StoreTagFolder = "store"

[<Literal>]
let private UserTagFolder = "user"

// --- Helpers ---

let private httpClient = new HttpClient()

let private downloadSpec () : string =
    httpClient.GetStringAsync(PetstoreSpecUrl)
    |> Async.AwaitTask
    |> Async.RunSynchronously

let private downloadBeeceptorSpec () : string =
    httpClient.GetStringAsync(BeeceptorSpecUrl)
    |> Async.AwaitTask
    |> Async.RunSynchronously

let private generateFromUrl (url: string) : Napper.Core.OpenApiGenerator.GenerationResult =
    let spec =
        httpClient.GetStringAsync(url) |> Async.AwaitTask |> Async.RunSynchronously

    match Napper.Core.OpenApiGenerator.generate spec with
    | Ok result -> result
    | Error msg -> failwith $"Expected Ok but got Error: {msg}"

// --- E2E: F# API directly (no CLI process) --- Spec: openapi-generate, openapi-oas3

[<Fact>]
let ``OpenApiGenerator.generate succeeds with live Petstore spec`` () =
    let specContent = downloadSpec ()

    match Napper.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        Assert.True(result.NapFiles.Length >= MinExpectedNapFiles)
        Assert.False(String.IsNullOrEmpty(result.Playlist.Content))
        Assert.False(String.IsNullOrEmpty(result.Environment.Content))
    | Error msg -> Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate produces correct tag folders for Petstore`` () =
    let specContent = downloadSpec ()

    match Napper.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        let hasPet =
            result.NapFiles
            |> List.exists (fun f -> f.FileName.StartsWith($"{PetTagFolder}/"))

        let hasStore =
            result.NapFiles
            |> List.exists (fun f -> f.FileName.StartsWith($"{StoreTagFolder}/"))

        let hasUser =
            result.NapFiles
            |> List.exists (fun f -> f.FileName.StartsWith($"{UserTagFolder}/"))

        Assert.True(hasPet, "Should have pet/ files")
        Assert.True(hasStore, "Should have store/ files")
        Assert.True(hasUser, "Should have user/ files")
    | Error msg -> Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate includes api_key auth for Petstore`` () =
    let specContent = downloadSpec ()

    match Napper.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        let hasApiKey =
            result.NapFiles
            |> List.exists (fun f -> f.Content.Contains(SectionRequestHeaders) && f.Content.Contains("api_key"))

        Assert.True(hasApiKey, "At least one endpoint should have api_key auth header")
    | Error msg -> Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate produces baseUrl in environment`` () =
    let specContent = downloadSpec ()

    match Napper.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        Assert.Contains(BaseUrlKey, result.Environment.Content)
        Assert.Contains("/api/v3", result.Environment.Content)
    | Error msg -> Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate produces playlist referencing all files`` () =
    let specContent = downloadSpec ()

    match Napper.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        Assert.Contains(SectionSteps, result.Playlist.Content)

        for napFile in result.NapFiles do
            Assert.Contains(napFile.FileName, result.Playlist.Content)
    | Error msg -> Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate produces vars for all path param endpoints`` () =
    let specContent = downloadSpec ()

    match Napper.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        let paramFiles =
            result.NapFiles
            |> List.filter (fun f ->
                f.Content.Contains("{{petId}}")
                || f.Content.Contains("{{orderId}}")
                || f.Content.Contains("{{username}}"))

        Assert.True(paramFiles.Length >= 3, $"Must have at least 3 path param endpoints, got {paramFiles.Length}")

        for f in paramFiles do
            Assert.Contains(SectionVars, f.Content)
            Assert.Contains(VarsPlaceholder, f.Content)
    | Error msg -> Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate produces request bodies for POST endpoints with JSON schema`` () =
    let specContent = downloadSpec ()

    match Napper.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        let postFilesWithBody =
            result.NapFiles
            |> List.filter (fun f -> f.Content.Contains("POST") && f.Content.Contains(SectionRequestBody))

        Assert.True(postFilesWithBody.Length >= 1, "At least one POST endpoint must have [request.body]")

        for f in postFilesWithBody do
            Assert.Contains("Content-Type = application/json", f.Content)
            Assert.Contains("\"\"\"", f.Content)

        let allPostFiles =
            result.NapFiles |> List.filter (fun f -> f.Content.Contains("POST"))

        for f in allPostFiles do
            Assert.Contains(SectionRequestHeaders, f.Content)
    | Error msg -> Assert.Fail($"Expected Ok but got Error: {msg}")

// --- E2E: Beeceptor URL proves URL content drives output --- Spec: openapi-nap-gen, openapi-baseurl, openapi-auth, openapi-naplist-gen

[<Fact>]
let ``Beeceptor URL generates exactly 11 nap files`` () =
    let result = generateFromUrl BeeceptorSpecUrl
    Assert.Equal(BeeceptorExpectedNapFiles, result.NapFiles.Length)

[<Fact>]
let ``Beeceptor URL generates base URL with demo-ecommerce domain`` () =
    let result = generateFromUrl BeeceptorSpecUrl
    Assert.Contains(BeeceptorBaseUrlDomain, result.Environment.Content)

[<Fact>]
let ``Beeceptor URL generates auth register endpoint`` () =
    let result = generateFromUrl BeeceptorSpecUrl

    let hasRegister =
        result.NapFiles
        |> List.exists (fun f -> f.Content.Contains BeeceptorAuthRegisterPath)

    Assert.True(hasRegister, "Must have auth/register endpoint from beeceptor spec")

[<Fact>]
let ``Beeceptor URL generates auth login endpoint`` () =
    let result = generateFromUrl BeeceptorSpecUrl

    let hasLogin =
        result.NapFiles
        |> List.exists (fun f -> f.Content.Contains BeeceptorAuthLoginPath)

    Assert.True(hasLogin, "Must have auth/login endpoint from beeceptor spec")

[<Fact>]
let ``Beeceptor URL generates products endpoint`` () =
    let result = generateFromUrl BeeceptorSpecUrl

    let hasProducts =
        result.NapFiles
        |> List.exists (fun f -> f.Content.Contains BeeceptorProductsPath)

    Assert.True(hasProducts, "Must have products endpoint from beeceptor spec")

[<Fact>]
let ``Beeceptor URL generates cart endpoint`` () =
    let result = generateFromUrl BeeceptorSpecUrl

    let hasCart =
        result.NapFiles |> List.exists (fun f -> f.Content.Contains BeeceptorCartPath)

    Assert.True(hasCart, "Must have cart endpoint from beeceptor spec")

[<Fact>]
let ``Beeceptor URL generates checkout endpoint`` () =
    let result = generateFromUrl BeeceptorSpecUrl

    let hasCheckout =
        result.NapFiles
        |> List.exists (fun f -> f.Content.Contains BeeceptorCheckoutPath)

    Assert.True(hasCheckout, "Must have checkout endpoint from beeceptor spec")

[<Fact>]
let ``Beeceptor URL generates orders endpoint`` () =
    let result = generateFromUrl BeeceptorSpecUrl

    let hasOrders =
        result.NapFiles |> List.exists (fun f -> f.Content.Contains BeeceptorOrdersPath)

    Assert.True(hasOrders, "Must have orders endpoint from beeceptor spec")

[<Fact>]
let ``Beeceptor URL generates addresses endpoint`` () =
    let result = generateFromUrl BeeceptorSpecUrl

    let hasAddresses =
        result.NapFiles
        |> List.exists (fun f -> f.Content.Contains BeeceptorAddressesPath)

    Assert.True(hasAddresses, "Must have addresses endpoint from beeceptor spec")

[<Fact>]
let ``Beeceptor URL generates bearer auth on secured endpoints`` () =
    let result = generateFromUrl BeeceptorSpecUrl

    let bearerFiles =
        result.NapFiles
        |> List.filter (fun f -> f.Content.Contains "Authorization = Bearer {{token}}")

    Assert.True(bearerFiles.Length >= 7, $"Must have at least 7 bearer auth endpoints, got {bearerFiles.Length}")

[<Fact>]
let ``Beeceptor URL output is different from Petstore URL output`` () =
    let beeceptor = generateFromUrl BeeceptorSpecUrl
    let petstore = generateFromUrl PetstoreSpecUrl
    Assert.Contains(BeeceptorBaseUrlDomain, beeceptor.Environment.Content)
    Assert.DoesNotContain(BeeceptorBaseUrlDomain, petstore.Environment.Content)
    Assert.Contains("/api/v3", petstore.Environment.Content)
    Assert.DoesNotContain("/api/v3", beeceptor.Environment.Content)
    Assert.NotEqual(beeceptor.NapFiles.Length, petstore.NapFiles.Length)

[<Fact>]
let ``Beeceptor URL playlist contains E-commerce API title`` () =
    let result = generateFromUrl BeeceptorSpecUrl
    Assert.Contains("E-commerce API", result.Playlist.Content)
    Assert.Contains(SectionSteps, result.Playlist.Content)

    for napFile in result.NapFiles do
        Assert.Contains(napFile.FileName, result.Playlist.Content)
