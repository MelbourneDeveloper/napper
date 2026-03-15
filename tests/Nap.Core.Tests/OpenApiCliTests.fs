module OpenApiCliTests

open System
open System.Net.Http
open Xunit
open Nap.Core.OpenApiTypes

/// Direct F# API tests against the live Petstore OpenAPI spec.
/// CLI-based e2e tests are in OpenApiE2eTests.fs — these test
/// the OpenApiGenerator.generate function without a CLI process.

// --- Constants ---

[<Literal>]
let private PetstoreSpecUrl = "https://petstore3.swagger.io/api/v3/openapi.json"

[<Literal>]
let private MinExpectedNapFiles = 10

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

// --- E2E: F# API directly (no CLI process) ---

[<Fact>]
let ``OpenApiGenerator.generate succeeds with live Petstore spec`` () =
    let specContent = downloadSpec ()
    match Nap.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        Assert.True(result.NapFiles.Length >= MinExpectedNapFiles)
        Assert.False(String.IsNullOrEmpty(result.Playlist.Content))
        Assert.False(String.IsNullOrEmpty(result.Environment.Content))
    | Error msg ->
        Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate produces correct tag folders for Petstore`` () =
    let specContent = downloadSpec ()
    match Nap.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        let hasPet = result.NapFiles |> List.exists (fun f -> f.FileName.StartsWith($"{PetTagFolder}/"))
        let hasStore = result.NapFiles |> List.exists (fun f -> f.FileName.StartsWith($"{StoreTagFolder}/"))
        let hasUser = result.NapFiles |> List.exists (fun f -> f.FileName.StartsWith($"{UserTagFolder}/"))
        Assert.True(hasPet, "Should have pet/ files")
        Assert.True(hasStore, "Should have store/ files")
        Assert.True(hasUser, "Should have user/ files")
    | Error msg ->
        Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate includes api_key auth for Petstore`` () =
    let specContent = downloadSpec ()
    match Nap.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        let hasApiKey =
            result.NapFiles |> List.exists (fun f ->
                f.Content.Contains(SectionRequestHeaders) && f.Content.Contains("api_key"))
        Assert.True(hasApiKey, "At least one endpoint should have api_key auth header")
    | Error msg ->
        Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate produces baseUrl in environment`` () =
    let specContent = downloadSpec ()
    match Nap.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        Assert.Contains(BaseUrlKey, result.Environment.Content)
        Assert.Contains("/api/v3", result.Environment.Content)
    | Error msg ->
        Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate produces playlist referencing all files`` () =
    let specContent = downloadSpec ()
    match Nap.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        Assert.Contains(SectionSteps, result.Playlist.Content)
        for napFile in result.NapFiles do
            Assert.Contains(napFile.FileName, result.Playlist.Content)
    | Error msg ->
        Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate produces vars for path params`` () =
    let specContent = downloadSpec ()
    match Nap.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        let hasVars =
            result.NapFiles |> List.exists (fun f ->
                f.Content.Contains(SectionVars) && f.Content.Contains(VarsPlaceholder))
        Assert.True(hasVars, "At least one endpoint should have [vars] with REPLACE_ME")
    | Error msg ->
        Assert.Fail($"Expected Ok but got Error: {msg}")

[<Fact>]
let ``OpenApiGenerator.generate produces request bodies for POST endpoints`` () =
    let specContent = downloadSpec ()
    match Nap.Core.OpenApiGenerator.generate specContent with
    | Ok result ->
        let hasBody =
            result.NapFiles |> List.exists (fun f ->
                f.Content.Contains("POST") && f.Content.Contains(SectionRequestBody))
        Assert.True(hasBody, "At least one POST endpoint should have [request.body]")
    | Error msg ->
        Assert.Fail($"Expected Ok but got Error: {msg}")
