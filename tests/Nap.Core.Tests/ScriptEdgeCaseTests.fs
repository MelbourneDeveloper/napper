module ScriptEdgeCaseTests

open System
open System.IO
open Xunit
open Nap.Core

let private createTempScript (content: string) : string =
    let dir = Path.GetTempPath()
    let path = Path.Combine(dir, sprintf "nap-test-%s.fsx" (Guid.NewGuid().ToString("N")))
    File.WriteAllText(path, content)
    path

let private cleanupScript (path: string) =
    if File.Exists(path) then File.Delete(path)

// ─── Passing scripts ──────────────────────────────────────────

[<Fact>]
let ``Script with single output line`` () =
    let path = createTempScript "printfn \"hello\""
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed)
        Assert.Contains("hello", result.Log)
    finally
        cleanupScript path

[<Fact>]
let ``Script with multiple output lines`` () =
    let path = createTempScript "printfn \"line1\"\nprintfn \"line2\"\nprintfn \"line3\""
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed)
        Assert.True(result.Log.Length >= 3, $"Expected at least 3 log lines, got {result.Log.Length}")
    finally
        cleanupScript path

[<Fact>]
let ``Script with no output`` () =
    let path = createTempScript "let x = 1 + 1\n()"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed)
        Assert.Empty(result.Log)
    finally
        cleanupScript path

[<Fact>]
let ``Script result has no HTTP response`` () =
    let path = createTempScript "printfn \"ok\""
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Response.IsNone)
    finally
        cleanupScript path

[<Fact>]
let ``Script result has no assertions`` () =
    let path = createTempScript "printfn \"ok\""
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.Empty(result.Assertions)
    finally
        cleanupScript path

[<Fact>]
let ``Script result has correct file path`` () =
    let path = createTempScript "printfn \"ok\""
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.Equal(path, result.File)
    finally
        cleanupScript path

// ─── Failing scripts ──────────────────────────────────────────

[<Fact>]
let ``Script with type error fails`` () =
    let path = createTempScript "let x: int = \"string\""
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.False(result.Passed)
        Assert.True(result.Error.IsSome, "Should have an error message")
    finally
        cleanupScript path

[<Fact>]
let ``Script with explicit exit code 1 fails`` () =
    let path = createTempScript "printfn \"about to fail\"\nexit 1"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.False(result.Passed)
        Assert.True(result.Error.IsSome)
    finally
        cleanupScript path

[<Fact>]
let ``Failed script still captures stdout before failure`` () =
    let path = createTempScript "printfn \"before error\"\nexit 1"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.False(result.Passed)
        Assert.Contains("before error", result.Log)
    finally
        cleanupScript path

[<Fact>]
let ``Script with runtime exception fails`` () =
    let path = createTempScript "failwith \"boom\""
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.False(result.Passed)
        Assert.True(result.Error.IsSome)
    finally
        cleanupScript path

// ─── Script doing actual work ─────────────────────────────────

[<Fact>]
let ``Script can do computation and print result`` () =
    let path = createTempScript "let result = [1..10] |> List.sum\nprintfn \"Sum: %d\" result"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed)
        Assert.Contains("Sum: 55", result.Log)
    finally
        cleanupScript path

[<Fact>]
let ``Script can read environment variables`` () =
    let path = createTempScript "printfn \"PATH exists: %b\" (System.Environment.GetEnvironmentVariable(\"PATH\") <> null)"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed)
        Assert.Contains("PATH exists: true", result.Log)
    finally
        cleanupScript path

[<Fact>]
let ``Script can write and read temp file`` () =
    let tempFile = Path.Combine(Path.GetTempPath(), sprintf "nap-script-io-%s.txt" (Guid.NewGuid().ToString("N")))
    let escapedPath = tempFile.Replace("\\", "\\\\")
    let script =
        sprintf "let path = \"%s\"\nSystem.IO.File.WriteAllText(path, \"hello from script\")\nlet content = System.IO.File.ReadAllText(path)\nprintfn \"Read: %%s\" content\nSystem.IO.File.Delete(path)" escapedPath
    let path = createTempScript script
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed)
        Assert.Contains("Read: hello from script", result.Log)
    finally
        cleanupScript path
        if File.Exists(tempFile) then File.Delete(tempFile)

// ─── Non-existent script ──────────────────────────────────────

[<Fact>]
let ``Non-existent script path fails`` () =
    let path = Path.Combine(Path.GetTempPath(), "definitely-does-not-exist.fsx")
    let result = Runner.runScript path |> Async.RunSynchronously
    Assert.False(result.Passed)
    Assert.True(result.Error.IsSome)

// ─── Script with HTTP call ────────────────────────────────────

[<Fact>]
let ``Script can make HTTP request`` () =
    let script = """
open System.Net.Http
let client = new HttpClient()
let response = client.GetAsync("https://httpbin.org/get") |> Async.AwaitTask |> Async.RunSynchronously
printfn "Status: %d" (int response.StatusCode)
"""
    let path = createTempScript script
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed, $"Script should pass. Error: {result.Error}")
        Assert.True(result.Log |> List.exists (fun l -> l.Contains("Status: 200")),
            $"Should contain status 200. Log: {result.Log}")
    finally
        cleanupScript path

// ─── Script with async computation ────────────────────────────

[<Fact>]
let ``Script with async workflow`` () =
    let script = """
let work = async {
    do! Async.Sleep(100)
    return 42
}
let result = work |> Async.RunSynchronously
printfn "Async result: %d" result
"""
    let path = createTempScript script
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed)
        Assert.Contains("Async result: 42", result.Log)
    finally
        cleanupScript path
