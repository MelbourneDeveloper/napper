module HttpConvertE2eTests
// Specs: http-convert, http-convert-outdir, http-convert-dryrun, http-convert-envfile,
//        http-convert-mapping, http-convert-naming, http-convert-output,
//        http-convert-env, cli-exit-codes

open System.IO
open Xunit

let private createTempDir () = TestHelpers.createTempDir "nap-http-convert-e2e"
let private cleanupDir dir = TestHelpers.cleanupDir dir
let private runCli args cwd = TestHelpers.runCli args cwd

let private writeFile (dir: string) (name: string) (content: string) : string =
    let filePath = Path.Combine(dir, name)
    File.WriteAllText(filePath, content)
    filePath

let private convertFile (httpPath: string) (outDir: string) (cwd: string) =
    runCli (sprintf "convert http %s --output-dir %s" httpPath outDir) cwd

let private convertWithFlags (httpPath: string) (outDir: string) (flags: string) (cwd: string) =
    runCli (sprintf "convert http %s --output-dir %s %s" httpPath outDir flags) cwd

[<Fact>]
let ``Spec http-convert: single file exits 0`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        let exitCode, stdout, _ = convertFile (writeFile dir "t.http" "GET https://api.example.com/users\n") outDir dir
        Assert.Equal(0, exitCode)
        Assert.Contains("Converted", stdout)
    finally cleanupDir dir; cleanupDir outDir

[<Fact>]
let ``Spec http-convert-output: generates .nap on disk`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        convertFile (writeFile dir "t.http" "GET https://api.example.com/users\n") outDir dir |> ignore
        let naps = Directory.GetFiles(outDir, "*.nap")
        Assert.True(naps.Length >= 1)
        Assert.Contains("GET https://api.example.com/users", File.ReadAllText(naps[0]))
    finally cleanupDir dir; cleanupDir outDir

[<Fact>]
let ``Spec http-convert-output: multi-request generates one nap each`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        let e, _, _ = convertFile (writeFile dir "m.http" "GET https://a.com\n\n###\nPOST https://b.com\n\n###\nDELETE https://c.com\n") outDir dir
        Assert.Equal(0, e)
        Assert.Equal(3, Directory.GetFiles(outDir, "*.nap").Length)
    finally cleanupDir dir; cleanupDir outDir

[<Fact>]
let ``Spec http-convert-naming: numeric prefix and nap ext`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        convertFile (writeFile dir "n.http" "### First\nGET https://a.com\n\n### Second\nPOST https://b.com\n") outDir dir |> ignore
        let naps = Directory.GetFiles(outDir, "*.nap") |> Array.sort
        Assert.True(Path.GetFileName(naps[0]).StartsWith("01_"))
        Assert.True(Path.GetFileName(naps[1]).StartsWith("02_"))
    finally cleanupDir dir; cleanupDir outDir

[<Fact>]
let ``Spec http-convert-mapping: generated nap has correct sections`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        convertFile (writeFile dir "p.http" "### Create User\nPOST https://api.com/users\nContent-Type: application/json\nAuthorization: Bearer token\n\n{\"name\":\"Alice\"}\n") outDir dir |> ignore
        let c = File.ReadAllText(Directory.GetFiles(outDir, "*.nap")[0])
        Assert.Contains("name = Create User", c)
        Assert.Contains("POST https://api.com/users", c)
        Assert.Contains("Authorization = Bearer token", c)
        Assert.Contains("[request.body]", c)
    finally cleanupDir dir; cleanupDir outDir

[<Fact>]
let ``Spec http-convert-dryrun: no files written`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        let e, stdout, _ = convertWithFlags (writeFile dir "t.http" "GET https://api.com/users\n") outDir "--dry-run" dir
        Assert.Equal(0, e)
        Assert.Contains("Would write", stdout)
        Assert.Equal(0, Directory.GetFiles(outDir, "*.nap").Length)
    finally cleanupDir dir; cleanupDir outDir

[<Fact>]
let ``Spec http-convert-envfile: converts env JSON to napenv`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        writeFile dir "t.http" "GET https://{{host}}/users\n" |> ignore
        let envPath = writeFile dir "env.json" """{"dev":{"host":"localhost:8080"},"prod":{"host":"api.example.com"}}"""
        let e, _, _ = convertWithFlags (Path.Combine(dir, "t.http")) outDir (sprintf "--env-file %s" envPath) dir
        Assert.Equal(0, e)
        Assert.True(File.Exists(Path.Combine(outDir, ".napenv.dev")))
        Assert.True(File.Exists(Path.Combine(outDir, ".napenv.prod")))
    finally cleanupDir dir; cleanupDir outDir

[<Fact>]
let ``Spec http-convert-env: auto-detects http-client.env.json`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        let httpPath = writeFile dir "t.http" "GET https://{{host}}/users\n"
        writeFile dir "http-client.env.json" """{"staging":{"host":"staging.api.com"}}""" |> ignore
        convertFile httpPath outDir dir |> ignore
        Assert.True(File.Exists(Path.Combine(outDir, ".napenv.staging")))
        Assert.Contains("host = \"staging.api.com\"", File.ReadAllText(Path.Combine(outDir, ".napenv.staging")))
    finally cleanupDir dir; cleanupDir outDir

[<Fact>]
let ``Spec http-convert: json output reports counts`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        let _, stdout, _ = convertWithFlags (writeFile dir "t.http" "GET https://a.com\n\n###\nPOST https://b.com\n") outDir "--output json" dir
        Assert.Contains("\"files\":", stdout)
        Assert.Contains("\"warnings\":", stdout)
    finally cleanupDir dir; cleanupDir outDir

[<Fact>]
let ``Spec cli-exit-codes: convert missing file returns 2`` () =
    let dir = createTempDir ()
    try
        let e, _, stderr = runCli "convert http nonexistent.http --output-dir ." dir
        Assert.Equal(2, e)
        Assert.Contains("not found", stderr)
    finally cleanupDir dir

[<Fact>]
let ``Spec cli-exit-codes: convert no file returns 2`` () =
    let dir = createTempDir ()
    try
        let e, _, stderr = runCli "convert http" dir
        Assert.Equal(2, e)
        Assert.Contains("no file", stderr.ToLowerInvariant())
    finally cleanupDir dir

[<Fact>]
let ``Spec http-convert-output: directory converts all http files`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        writeFile dir "a.http" "### Login\nPOST https://api.com/login\n" |> ignore
        writeFile dir "u.http" "### List\nGET https://api.com/users\n\n### Get\nGET https://api.com/users/1\n" |> ignore
        let e, _, _ = convertFile dir outDir dir
        Assert.Equal(0, e)
        Assert.Equal(3, Directory.GetFiles(outDir, "*.nap", SearchOption.AllDirectories).Length)
    finally cleanupDir dir; cleanupDir outDir

[<Fact>]
let ``Spec http-convert-mapping: MS vars in generated nap`` () =
    let dir = createTempDir ()
    let outDir = createTempDir ()
    try
        convertFile (writeFile dir "ms.http" "@baseUrl = https://api.example.com\n@apiKey = abc123\n\nGET {{baseUrl}}/data\n") outDir dir |> ignore
        let c = File.ReadAllText(Directory.GetFiles(outDir, "*.nap")[0])
        Assert.Contains("[vars]", c)
        Assert.Contains("baseUrl = \"https://api.example.com\"", c)
    finally cleanupDir dir; cleanupDir outDir
