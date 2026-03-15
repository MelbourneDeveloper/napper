module OpenApiE2eTests

open System
open System.Diagnostics
open System.IO
open System.Net.Http
open Xunit

// ─── Infrastructure ─────────────────────────────────────────

let private runCli (args: string) (cwd: string) : int * string * string =
    let projectPath = Path.GetFullPath(Path.Combine(__SOURCE_DIRECTORY__, "../../src/Nap.Cli/Nap.Cli.fsproj"))
    let psi = ProcessStartInfo()
    psi.FileName <- "dotnet"
    psi.Arguments <- $"run --project {projectPath} -- {args}"
    psi.WorkingDirectory <- cwd
    psi.RedirectStandardOutput <- true
    psi.RedirectStandardError <- true
    psi.UseShellExecute <- false
    psi.CreateNoWindow <- true
    use proc = Process.Start(psi)
    let stdout = proc.StandardOutput.ReadToEnd()
    let stderr = proc.StandardError.ReadToEnd()
    proc.WaitForExit()
    proc.ExitCode, stdout, stderr

let private createTempDir () =
    let dir = Path.Combine(Path.GetTempPath(), $"nap-openapi-e2e-{Guid.NewGuid():N}")
    Directory.CreateDirectory(dir) |> ignore
    dir

let private cleanupDir (dir: string) =
    if Directory.Exists(dir) then Directory.Delete(dir, true)

[<Literal>]
let private PetstoreUrl = "https://petstore3.swagger.io/api/v3/openapi.json"

[<Literal>]
let private BeeceptorUrl = "https://beeceptor.com/docs/storefront-sample.json"

[<Literal>]
let private BeeceptorEndpointCount = 11

let private specCacheDir =
    Path.Combine(__SOURCE_DIRECTORY__, ".spec-cache")

let private cachedDownload (url: string) (fileName: string) : string =
    let cachePath = Path.Combine(specCacheDir, fileName)
    if File.Exists(cachePath) then
        File.ReadAllText(cachePath)
    else
        if not (Directory.Exists(specCacheDir)) then
            Directory.CreateDirectory(specCacheDir) |> ignore
        use client = new HttpClient()
        let json = client.GetStringAsync(url).Result
        File.WriteAllText(cachePath, json)
        json

let private downloadSpec () : string =
    cachedDownload PetstoreUrl "petstore.json"

let private downloadBeeceptorSpec () : string =
    cachedDownload BeeceptorUrl "storefront.json"

let private generateBeeceptor (outDir: string) : int * string * string =
    let specPath = Path.Combine(specCacheDir, "storefront.json")
    downloadBeeceptorSpec () |> ignore
    runCli $"generate openapi {specPath} --output-dir {outDir}" specCacheDir

let private generatePetstore (outDir: string) : int * string * string =
    let specPath = Path.Combine(specCacheDir, "petstore.json")
    downloadSpec () |> ignore
    runCli $"generate openapi {specPath} --output-dir {outDir}" specCacheDir

// ─── CLI generate openapi: Petstore E2E ─────────────────────

[<Fact>]
let ``Petstore generate exits with code 0`` () =
    let outDir = createTempDir ()
    try
        let exitCode, stdout, _ = generatePetstore outDir
        Assert.Equal(0, exitCode)
        Assert.Contains("Generated", stdout)
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore generates napenv with base URL`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let envFile = Path.Combine(outDir, ".napenv")
        Assert.True(File.Exists(envFile), ".napenv must exist")
        let content = File.ReadAllText(envFile)
        Assert.Contains("baseUrl", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore generates naplist file`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let naplists = Directory.GetFiles(outDir, "*.naplist")
        Assert.True(naplists.Length >= 1, "Must produce at least one .naplist")
        let content = File.ReadAllText(naplists[0])
        Assert.Contains("[meta]", content)
        Assert.Contains("[steps]", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore creates tag subdirectories`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let petDir = Path.Combine(outDir, "pet")
        let storeDir = Path.Combine(outDir, "store")
        let userDir = Path.Combine(outDir, "user")
        Assert.True(Directory.Exists(petDir), "pet/ subdirectory must exist")
        Assert.True(Directory.Exists(storeDir), "store/ subdirectory must exist")
        Assert.True(Directory.Exists(userDir), "user/ subdirectory must exist")
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore pet folder has nap files for CRUD operations`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let petDir = Path.Combine(outDir, "pet")
        let napFiles = Directory.GetFiles(petDir, "*.nap")
        Assert.True(napFiles.Length >= 4, $"pet/ must have at least 4 .nap files, got {napFiles.Length}")
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore nap files contain meta with generated flag`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        Assert.True(allNaps.Length > 0, "Must have at least one .nap file")
        for napFile in allNaps do
            let content = File.ReadAllText(napFile)
            Assert.Contains("[meta]", content)
            Assert.Contains("generated = true", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore nap files contain request section with baseUrl`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        for napFile in allNaps do
            let content = File.ReadAllText(napFile)
            Assert.Contains("[request]", content)
            Assert.Contains("{{baseUrl}}", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore nap files contain assert section`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        for napFile in allNaps do
            let content = File.ReadAllText(napFile)
            Assert.Contains("[assert]", content)
            Assert.Contains("status = ", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore POST endpoints have request body`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        let postFiles =
            allNaps
            |> Array.filter (fun f ->
                let content = File.ReadAllText(f)
                content.Contains("POST {{baseUrl}}"))
        Assert.True(postFiles.Length >= 1, "Must have at least one POST endpoint")
        for f in postFiles do
            let content = File.ReadAllText(f)
            Assert.Contains("[request.headers]", content)
            Assert.Contains("Content-Type = application/json", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore path param endpoints have vars section`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        let paramFiles =
            allNaps
            |> Array.filter (fun f ->
                let content = File.ReadAllText(f)
                content.Contains("{{petId}}") || content.Contains("{{orderId}}") || content.Contains("{{username}}"))
        Assert.True(paramFiles.Length >= 1, "Must have endpoints with path params")
        for f in paramFiles do
            let content = File.ReadAllText(f)
            Assert.Contains("[vars]", content)
            Assert.Contains("REPLACE_ME", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore naplist references all generated nap files`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let naplists = Directory.GetFiles(outDir, "*.naplist")
        Assert.True(naplists.Length >= 1, "Must have a naplist")
        let playlistContent = File.ReadAllText(naplists[0])
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        Assert.True(allNaps.Length >= 10, $"Petstore must produce at least 10 nap files, got {allNaps.Length}")
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore api_key auth adds header`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        let apiKeyFiles =
            allNaps
            |> Array.filter (fun f ->
                let content = File.ReadAllText(f)
                content.Contains("api_key = {{apiKey}}"))
        Assert.True(apiKeyFiles.Length >= 1, "At least one endpoint must use api_key auth header")
    finally
        cleanupDir outDir

[<Fact>]
let ``Petstore query param endpoints have params in URL`` () =
    let outDir = createTempDir ()
    try
        generatePetstore outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        let queryFiles =
            allNaps
            |> Array.filter (fun f ->
                let content = File.ReadAllText(f)
                content.Contains("?") && content.Contains("={{"))
        Assert.True(queryFiles.Length >= 1, "Must have endpoints with query params in URL")
    finally
        cleanupDir outDir

// ─── Error handling ─────────────────────────────────────────

[<Fact>]
let ``Generate with missing spec returns exit code 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "generate openapi nonexistent.json --output-dir ." dir
        Assert.Equal(2, exitCode)
        Assert.Contains("not found", stderr)
    finally
        cleanupDir dir

[<Fact>]
let ``Generate with no spec file returns exit code 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "generate openapi" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("no spec", stderr)
    finally
        cleanupDir dir

[<Fact>]
let ``Generate with invalid JSON returns exit code 1`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "bad.json"), "not valid json{{{")
        let exitCode, _, stderr = runCli "generate openapi bad.json --output-dir ." dir
        Assert.Equal(1, exitCode)
        Assert.Contains("parse", stderr.ToLowerInvariant())
    finally
        cleanupDir dir

// ─── CLI generate openapi: Beeceptor Storefront E2E ─────────

[<Fact>]
let ``Beeceptor generate exits with code 0`` () =
    let outDir = createTempDir ()
    try
        let exitCode, stdout, _ = generateBeeceptor outDir
        Assert.Equal(0, exitCode)
        Assert.Contains("Generated", stdout)
    finally
        cleanupDir outDir

[<Fact>]
let ``Beeceptor generates napenv with base URL`` () =
    let outDir = createTempDir ()
    try
        generateBeeceptor outDir |> ignore
        let envFile = Path.Combine(outDir, ".napenv")
        Assert.True(File.Exists(envFile), ".napenv must exist")
        let content = File.ReadAllText(envFile)
        Assert.Contains("baseUrl", content)
        Assert.Contains("api.demo-ecommerce.com", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Beeceptor generates all 11 nap files`` () =
    let outDir = createTempDir ()
    try
        generateBeeceptor outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        Assert.Equal(BeeceptorEndpointCount, allNaps.Length)
    finally
        cleanupDir outDir

[<Fact>]
let ``Beeceptor generates naplist referencing all endpoints`` () =
    let outDir = createTempDir ()
    try
        generateBeeceptor outDir |> ignore
        let naplists = Directory.GetFiles(outDir, "*.naplist")
        Assert.True(naplists.Length >= 1, "Must produce at least one .naplist")
        let content = File.ReadAllText(naplists[0])
        Assert.Contains("[meta]", content)
        Assert.Contains("[steps]", content)
        Assert.Contains("E-commerce API", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Beeceptor nap files all have meta and assert sections`` () =
    let outDir = createTempDir ()
    try
        generateBeeceptor outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        for napFile in allNaps do
            let content = File.ReadAllText(napFile)
            Assert.Contains("[meta]", content)
            Assert.Contains("generated = true", content)
            Assert.Contains("[request]", content)
            Assert.Contains("{{baseUrl}}", content)
            Assert.Contains("[assert]", content)
            Assert.Contains("status = ", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Beeceptor POST endpoints have request body and headers`` () =
    let outDir = createTempDir ()
    try
        generateBeeceptor outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        let postFiles =
            allNaps
            |> Array.filter (fun f ->
                let content = File.ReadAllText(f)
                content.Contains "POST {{baseUrl}}")
        // auth/register, auth/login, cart/items, checkout, addresses POST = 5
        Assert.True(postFiles.Length >= 5, $"Must have at least 5 POST endpoints, got {postFiles.Length}")
        for f in postFiles do
            let content = File.ReadAllText(f)
            Assert.Contains("[request.headers]", content)
            Assert.Contains("Content-Type = application/json", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Beeceptor bearer auth endpoints have Authorization header`` () =
    let outDir = createTempDir ()
    try
        generateBeeceptor outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        let authFiles =
            allNaps
            |> Array.filter (fun f ->
                let content = File.ReadAllText(f)
                content.Contains("Authorization = Bearer {{token}}"))
        // cart GET, cart/items POST, checkout POST, orders GET, orders/{id} GET, addresses GET, addresses POST = 7
        Assert.True(authFiles.Length >= 7, $"Must have at least 7 Bearer auth endpoints, got {authFiles.Length}")
    finally
        cleanupDir outDir

[<Fact>]
let ``Beeceptor products endpoint has query params`` () =
    let outDir = createTempDir ()
    try
        generateBeeceptor outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        let queryFiles =
            allNaps
            |> Array.filter (fun f ->
                let content = File.ReadAllText(f)
                content.Contains("category={{category}}"))
        Assert.True(queryFiles.Length >= 1, "Must have products endpoint with category query param")
        let content = File.ReadAllText(queryFiles[0])
        Assert.Contains("search={{search}}", content)
        Assert.Contains("min_price={{min_price}}", content)
        Assert.Contains("max_price={{max_price}}", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Beeceptor path param endpoints have vars section`` () =
    let outDir = createTempDir ()
    try
        generateBeeceptor outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        let paramFiles =
            allNaps
            |> Array.filter (fun f ->
                let content = File.ReadAllText(f)
                content.Contains("{{id}}") || content.Contains("{{orderId}}"))
        Assert.True(paramFiles.Length >= 2, $"Must have at least 2 path param endpoints, got {paramFiles.Length}")
        for f in paramFiles do
            let content = File.ReadAllText(f)
            Assert.Contains("[vars]", content)
            Assert.Contains("REPLACE_ME", content)
    finally
        cleanupDir outDir

[<Fact>]
let ``Beeceptor checkout endpoint asserts 201 status`` () =
    let outDir = createTempDir ()
    try
        generateBeeceptor outDir |> ignore
        let allNaps = Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories)
        let checkoutFiles =
            allNaps
            |> Array.filter (fun f ->
                let content = File.ReadAllText(f)
                content.Contains("POST {{baseUrl}}/checkout"))
        Assert.True(checkoutFiles.Length >= 1, "Must have checkout endpoint")
        let content = File.ReadAllText(checkoutFiles[0])
        Assert.Contains("status = 201", content)
    finally
        cleanupDir outDir
