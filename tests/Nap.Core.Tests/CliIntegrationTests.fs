module CliIntegrationTests

open System
open System.Diagnostics
open System.IO
open Xunit
open Nap.Core

/// Run the CLI as a process and capture output + exit code
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
    let dir = Path.Combine(Path.GetTempPath(), $"nap-cli-test-{Guid.NewGuid():N}")
    Directory.CreateDirectory(dir) |> ignore
    dir

let private cleanupDir (dir: string) =
    if Directory.Exists(dir) then Directory.Delete(dir, true)

// ─── Help command ─────────────────────────────────────────────

[<Fact>]
let ``CLI help returns exit code 0`` () =
    let dir = createTempDir ()
    try
        let exitCode, stdout, _ = runCli "help" dir
        Assert.Equal(0, exitCode)
        Assert.Contains("Usage:", stdout)
        Assert.Contains("nap run", stdout)
        Assert.Contains("nap check", stdout)
    finally
        cleanupDir dir

[<Fact>]
let ``CLI --help returns exit code 0`` () =
    let dir = createTempDir ()
    try
        let exitCode, stdout, _ = runCli "--help" dir
        Assert.Equal(0, exitCode)
        Assert.Contains("Usage:", stdout)
    finally
        cleanupDir dir

// ─── Check command ────────────────────────────────────────────

[<Fact>]
let ``CLI check valid shorthand nap file`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://example.com")
        let exitCode, stdout, _ = runCli "check test.nap" dir
        Assert.Equal(0, exitCode)
        Assert.Contains("is valid", stdout)
    finally
        cleanupDir dir

[<Fact>]
let ``CLI check valid full format nap file`` () =
    let dir = createTempDir ()
    try
        let content = "[request]\nmethod = POST\nurl = https://example.com\n\n[assert]\nstatus = 201\n"
        File.WriteAllText(Path.Combine(dir, "test.nap"), content)
        let exitCode, stdout, _ = runCli "check test.nap" dir
        Assert.Equal(0, exitCode)
        Assert.Contains("is valid", stdout)
    finally
        cleanupDir dir

[<Fact>]
let ``CLI check valid naplist file`` () =
    let dir = createTempDir ()
    try
        let content = "[meta]\nname = \"Test\"\n\n[steps]\n./test.nap\n"
        File.WriteAllText(Path.Combine(dir, "test.naplist"), content)
        let exitCode, stdout, _ = runCli "check test.naplist" dir
        Assert.Equal(0, exitCode)
        Assert.Contains("is valid", stdout)
    finally
        cleanupDir dir

[<Fact>]
let ``CLI check invalid nap file returns non-zero exit code`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "bad.nap"), "[request]\n# no method, no url\n")
        let exitCode, _, _ = runCli "check bad.nap" dir
        Assert.NotEqual(0, exitCode)
    finally
        cleanupDir dir

[<Fact>]
let ``CLI check missing file returns exit code 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "check nonexistent.nap" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("not found", stderr)
    finally
        cleanupDir dir

[<Fact>]
let ``CLI check with no file returns exit code 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "check" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("no file", stderr)
    finally
        cleanupDir dir

// ─── Run command: single file ─────────────────────────────────

[<Fact>]
let ``CLI run shorthand GET against httpbin`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        let exitCode, stdout, _ = runCli "run test.nap --output json" dir
        Assert.Equal(0, exitCode)
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.True(doc.RootElement.GetProperty("passed").GetBoolean())
        Assert.Equal(200, doc.RootElement.GetProperty("statusCode").GetInt32())
    finally
        cleanupDir dir

[<Fact>]
let ``CLI run with assertions that pass`` () =
    let dir = createTempDir ()
    try
        let content = "[request]\nmethod = GET\nurl = https://httpbin.org/get\n\n[assert]\nstatus = 200\n"
        File.WriteAllText(Path.Combine(dir, "test.nap"), content)
        let exitCode, stdout, _ = runCli "run test.nap --output json" dir
        Assert.Equal(0, exitCode)
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.True(doc.RootElement.GetProperty("passed").GetBoolean())
    finally
        cleanupDir dir

[<Fact>]
let ``CLI run with failing assertion returns exit code 1`` () =
    let dir = createTempDir ()
    try
        let content = "[request]\nmethod = GET\nurl = https://httpbin.org/get\n\n[assert]\nstatus = 404\n"
        File.WriteAllText(Path.Combine(dir, "test.nap"), content)
        let exitCode, stdout, _ = runCli "run test.nap --output json" dir
        Assert.Equal(1, exitCode)
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.False(doc.RootElement.GetProperty("passed").GetBoolean())
    finally
        cleanupDir dir

[<Fact>]
let ``CLI run with missing file returns exit code 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "run missing.nap" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("not found", stderr)
    finally
        cleanupDir dir

[<Fact>]
let ``CLI run with no file returns exit code 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "run" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("no file", stderr)
    finally
        cleanupDir dir

// ─── Run command: output formats ──────────────────────────────

[<Fact>]
let ``CLI run with json output is valid JSON`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        let _, stdout, _ = runCli "run test.nap --output json" dir
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.True(doc.RootElement.TryGetProperty("file") |> fst)
    finally
        cleanupDir dir

[<Fact>]
let ``CLI run with junit output is valid XML`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        let _, stdout, _ = runCli "run test.nap --output junit" dir
        Assert.Contains("<?xml", stdout)
        Assert.Contains("testsuites", stdout)
    finally
        cleanupDir dir

[<Fact>]
let ``CLI run with pretty output shows status`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        let _, stdout, _ = runCli "run test.nap" dir
        Assert.Contains("PASS", stdout)
    finally
        cleanupDir dir

// ─── Run command: directory ───────────────────────────────────

[<Fact>]
let ``CLI run directory executes all nap files`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "a.nap"), "GET https://httpbin.org/get")
        File.WriteAllText(Path.Combine(dir, "b.nap"), "GET https://httpbin.org/get")
        let exitCode, stdout, _ = runCli $"run {dir} --output json" dir
        Assert.Equal(0, exitCode)
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.Equal(2, doc.RootElement.GetArrayLength())
    finally
        cleanupDir dir

[<Fact>]
let ``CLI run empty directory returns exit code 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli $"run {dir}" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("No .nap files", stderr)
    finally
        cleanupDir dir

// ─── Run command: --var flag ──────────────────────────────────

[<Fact>]
let ``CLI run with --var substitutes variable`` () =
    let dir = createTempDir ()
    try
        let content = "[request]\nmethod = GET\nurl = https://httpbin.org/status/{{code}}\n\n[assert]\nstatus = {{code}}\n"
        File.WriteAllText(Path.Combine(dir, "test.nap"), content)
        let exitCode, stdout, _ = runCli "run test.nap --var code=200 --output json" dir
        Assert.Equal(0, exitCode)
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.True(doc.RootElement.GetProperty("passed").GetBoolean())
    finally
        cleanupDir dir

// ─── Run command: --env flag ──────────────────────────────────

[<Fact>]
let ``CLI run with --env loads named environment`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, ".napenv.staging"), "statusCode = \"200\"")
        let content = "[request]\nmethod = GET\nurl = https://httpbin.org/status/{{statusCode}}\n\n[assert]\nstatus = {{statusCode}}\n"
        File.WriteAllText(Path.Combine(dir, "test.nap"), content)
        let exitCode, stdout, _ = runCli "run test.nap --env staging --output json" dir
        Assert.Equal(0, exitCode)
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.True(doc.RootElement.GetProperty("passed").GetBoolean())
    finally
        cleanupDir dir

// ─── Run command: playlist ────────────────────────────────────

[<Fact>]
let ``CLI run naplist executes all steps`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "a.nap"), "GET https://httpbin.org/get")
        File.WriteAllText(Path.Combine(dir, "b.nap"), "GET https://httpbin.org/get")
        File.WriteAllText(Path.Combine(dir, "suite.naplist"), "[steps]\na.nap\nb.nap\n")
        let exitCode, stdout, _ = runCli "run suite.naplist --output json" dir
        Assert.Equal(0, exitCode)
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.Equal(2, doc.RootElement.GetArrayLength())
    finally
        cleanupDir dir

[<Fact>]
let ``CLI run naplist with ndjson streams results`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "a.nap"), "GET https://httpbin.org/get")
        File.WriteAllText(Path.Combine(dir, "b.nap"), "GET https://httpbin.org/get")
        File.WriteAllText(Path.Combine(dir, "suite.naplist"), "[steps]\na.nap\nb.nap\n")
        let exitCode, stdout, _ = runCli "run suite.naplist --output ndjson" dir
        let lines = stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries)
        Assert.Equal(0, exitCode)
        Assert.Equal(2, lines.Length)
        for line in lines do
            let doc = System.Text.Json.JsonDocument.Parse(line)
            Assert.True(doc.RootElement.TryGetProperty("file") |> fst)
    finally
        cleanupDir dir

// ─── Run command: script step ─────────────────────────────────

[<Fact>]
let ``CLI run naplist with script step`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "setup.fsx"), "printfn \"[setup] ready\"")
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        File.WriteAllText(Path.Combine(dir, "suite.naplist"), "[steps]\nsetup.fsx\ntest.nap\n")
        let exitCode, stdout, _ = runCli "run suite.naplist --output json" dir
        Assert.Equal(0, exitCode)
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.Equal(2, doc.RootElement.GetArrayLength())
        // First result is the script
        let scriptResult = doc.RootElement[0]
        Assert.True(scriptResult.GetProperty("passed").GetBoolean())
        let logArray = scriptResult.GetProperty("log")
        Assert.True(logArray.GetArrayLength() >= 1)
    finally
        cleanupDir dir

[<Fact>]
let ``CLI run naplist with failing script returns exit code 1`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "bad.fsx"), "failwith \"boom\"")
        File.WriteAllText(Path.Combine(dir, "suite.naplist"), "[steps]\nbad.fsx\n")
        let exitCode, _, _ = runCli "run suite.naplist --output json" dir
        Assert.Equal(1, exitCode)
    finally
        cleanupDir dir

// ─── Unknown command ──────────────────────────────────────────

[<Fact>]
let ``CLI unknown command returns exit code 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "bogus" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("Unknown command", stderr)
    finally
        cleanupDir dir

// ─── Run command: POST with body ──────────────────────────────

[<Fact>]
let ``CLI run POST with JSON body`` () =
    let dir = createTempDir ()
    let tq = "\"\"\""
    try
        let content =
            "[request]\n" +
            "method = POST\n" +
            "url = https://httpbin.org/post\n\n" +
            "[request.headers]\n" +
            "Content-Type = application/json\n\n" +
            "[request.body]\n" +
            "content-type = application/json\n" +
            tq + "\n" +
            "{\"name\": \"test\"}\n" +
            tq + "\n\n" +
            "[assert]\n" +
            "status = 200\n"
        File.WriteAllText(Path.Combine(dir, "post.nap"), content)
        let exitCode, stdout, _ = runCli "run post.nap --output json" dir
        Assert.Equal(0, exitCode)
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.True(doc.RootElement.GetProperty("passed").GetBoolean())
        Assert.Equal(200, doc.RootElement.GetProperty("statusCode").GetInt32())
    finally
        cleanupDir dir

// ─── Run command: nested playlists ────────────────────────────

[<Fact>]
let ``CLI run nested naplist`` () =
    let dir = createTempDir ()
    let subdir = Path.Combine(dir, "sub")
    Directory.CreateDirectory(subdir) |> ignore
    try
        File.WriteAllText(Path.Combine(subdir, "inner.nap"), "GET https://httpbin.org/get")
        File.WriteAllText(Path.Combine(subdir, "inner.naplist"), "[steps]\ninner.nap\n")
        File.WriteAllText(Path.Combine(dir, "outer.naplist"), "[steps]\nsub/inner.naplist\n")
        let exitCode, stdout, _ = runCli "run outer.naplist --output json" dir
        Assert.Equal(0, exitCode)
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.Equal(1, doc.RootElement.GetArrayLength())
    finally
        cleanupDir dir
