module CliArgTests

open System
open System.Diagnostics
open System.IO
open Xunit

/// Run the CLI and capture output + exit code
let private runCli (args: string) (cwd: string) : int * string * string =
    let projectPath = Path.GetFullPath(Path.Combine(__SOURCE_DIRECTORY__, "../../src/Nap.Cli/Nap.Cli.fsproj"))
    let psi = ProcessStartInfo()
    psi.FileName <- "dotnet"
    psi.Arguments <- sprintf "run --project %s -- %s" projectPath args
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
    let dir = Path.Combine(Path.GetTempPath(), sprintf "nap-arg-test-%s" (Guid.NewGuid().ToString("N")))
    Directory.CreateDirectory(dir) |> ignore
    dir

let private cleanupDir (dir: string) =
    if Directory.Exists(dir) then Directory.Delete(dir, true)

// ─── Help variations ──────────────────────────────────────────

[<Fact>]
let ``No args shows help with exit 0`` () =
    let dir = createTempDir ()
    try
        let exitCode, stdout, _ = runCli "" dir
        Assert.Equal(0, exitCode)
        Assert.Contains("Usage:", stdout)
    finally
        cleanupDir dir

[<Fact>]
let ``help command shows all options`` () =
    let dir = createTempDir ()
    try
        let _, stdout, _ = runCli "help" dir
        Assert.Contains("nap run", stdout)
        Assert.Contains("nap check", stdout)
        Assert.Contains("--env", stdout)
        Assert.Contains("--var", stdout)
        Assert.Contains("--output", stdout)
    finally
        cleanupDir dir

[<Fact>]
let ``--help flag shows usage`` () =
    let dir = createTempDir ()
    try
        let exitCode, stdout, _ = runCli "--help" dir
        Assert.Equal(0, exitCode)
        Assert.Contains("Usage:", stdout)
    finally
        cleanupDir dir

[<Fact>]
let ``-h flag shows usage`` () =
    let dir = createTempDir ()
    try
        let exitCode, stdout, _ = runCli "-h" dir
        Assert.Equal(0, exitCode)
        Assert.Contains("Usage:", stdout)
    finally
        cleanupDir dir

// ─── Unknown command ──────────────────────────────────────────

[<Fact>]
let ``unknown command returns exit 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "bogus" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("Unknown command", stderr)
    finally
        cleanupDir dir

// ─── check edge cases ─────────────────────────────────────────

[<Fact>]
let ``check no file returns exit 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "check" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("no file", stderr)
    finally
        cleanupDir dir

[<Fact>]
let ``check missing file returns exit 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "check ghost.nap" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("not found", stderr)
    finally
        cleanupDir dir

// ─── run edge cases ───────────────────────────────────────────

[<Fact>]
let ``run no file returns exit 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "run" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("no file", stderr)
    finally
        cleanupDir dir

[<Fact>]
let ``run missing file returns exit 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli "run ghost.nap" dir
        Assert.Equal(2, exitCode)
        Assert.Contains("not found", stderr)
    finally
        cleanupDir dir

[<Fact>]
let ``run empty directory returns exit 2`` () =
    let dir = createTempDir ()
    try
        let exitCode, _, stderr = runCli (sprintf "run %s" dir) dir
        Assert.Equal(2, exitCode)
        Assert.Contains("No .nap files", stderr)
    finally
        cleanupDir dir

// ─── --var with equals in value ───────────────────────────────

[<Fact>]
let ``--var handles equals in value`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        let exitCode, _, _ = runCli "run test.nap --var token=abc==def --output json" dir
        Assert.Equal(0, exitCode)
    finally
        cleanupDir dir

// ─── Flags before file path ──────────────────────────────────

[<Fact>]
let ``flags before file path work`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        let exitCode, _, _ = runCli "run --output json test.nap" dir
        Assert.Equal(0, exitCode)
    finally
        cleanupDir dir

// ─── All output formats ──────────────────────────────────────

[<Fact>]
let ``json output is valid JSON`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        let _, stdout, _ = runCli "run test.nap --output json" dir
        let doc = System.Text.Json.JsonDocument.Parse(stdout)
        Assert.True(doc.RootElement.TryGetProperty("file") |> fst)
    finally
        cleanupDir dir

[<Fact>]
let ``junit output is valid XML`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        let _, stdout, _ = runCli "run test.nap --output junit" dir
        Assert.Contains("<?xml", stdout)
        Assert.Contains("testsuites", stdout)
    finally
        cleanupDir dir

[<Fact>]
let ``ndjson output gives one line per result`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        let _, stdout, _ = runCli "run test.nap --output ndjson" dir
        let lines = stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries)
        Assert.Equal(1, lines.Length)
        let doc = System.Text.Json.JsonDocument.Parse(lines[0])
        Assert.True(doc.RootElement.TryGetProperty("file") |> fst)
    finally
        cleanupDir dir

[<Fact>]
let ``pretty output is default`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, "test.nap"), "GET https://httpbin.org/get")
        let _, stdout, _ = runCli "run test.nap" dir
        Assert.Contains("PASS", stdout)
    finally
        cleanupDir dir
