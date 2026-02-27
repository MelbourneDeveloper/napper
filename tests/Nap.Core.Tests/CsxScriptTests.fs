module CsxScriptTests

open System
open System.IO
open Xunit
open Nap.Core

let private createTempCsx (content: string) : string =
    let dir = Path.GetTempPath()
    let path = Path.Combine(dir, sprintf "nap-test-%s.csx" (Guid.NewGuid().ToString("N")))
    File.WriteAllText(path, content)
    path

let private cleanupScript (path: string) =
    if File.Exists(path) then File.Delete(path)

// ─── Passing C# scripts ─────────────────────────────────────

[<Fact>]
let ``CSX script with single output line`` () =
    let path = createTempCsx "Console.WriteLine(\"hello from csharp\");"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed, $"Script should pass. Error: {result.Error}")
        Assert.Contains("hello from csharp", result.Log)
    finally
        cleanupScript path

[<Fact>]
let ``CSX script with multiple output lines`` () =
    let script = "Console.WriteLine(\"line1\");\nConsole.WriteLine(\"line2\");\nConsole.WriteLine(\"line3\");"
    let path = createTempCsx script
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed, $"Script should pass. Error: {result.Error}")
        Assert.True(result.Log.Length >= 3, $"Expected at least 3 log lines, got {result.Log.Length}")
    finally
        cleanupScript path

[<Fact>]
let ``CSX script with no output`` () =
    let path = createTempCsx "var x = 1 + 1;"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed, $"Script should pass. Error: {result.Error}")
        Assert.Empty(result.Log)
    finally
        cleanupScript path

[<Fact>]
let ``CSX result has no HTTP response`` () =
    let path = createTempCsx "Console.WriteLine(\"ok\");"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Response.IsNone)
    finally
        cleanupScript path

[<Fact>]
let ``CSX result has no assertions`` () =
    let path = createTempCsx "Console.WriteLine(\"ok\");"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.Empty(result.Assertions)
    finally
        cleanupScript path

[<Fact>]
let ``CSX result has correct file path`` () =
    let path = createTempCsx "Console.WriteLine(\"ok\");"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.Equal(path, result.File)
    finally
        cleanupScript path

// ─── Failing C# scripts ─────────────────────────────────────

[<Fact>]
let ``CSX script with compilation error fails`` () =
    let path = createTempCsx "int x = \"not an int\";"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.False(result.Passed)
        Assert.True(result.Error.IsSome, "Should have an error message")
    finally
        cleanupScript path

[<Fact>]
let ``CSX script with explicit exit code 1 fails`` () =
    let path = createTempCsx "Console.WriteLine(\"about to fail\");\nEnvironment.Exit(1);"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.False(result.Passed)
        Assert.True(result.Error.IsSome)
    finally
        cleanupScript path

[<Fact>]
let ``CSX failed script still captures stdout before failure`` () =
    let path = createTempCsx "Console.WriteLine(\"before error\");\nEnvironment.Exit(1);"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.False(result.Passed)
        Assert.Contains("before error", result.Log)
    finally
        cleanupScript path

[<Fact>]
let ``CSX script with runtime exception fails`` () =
    let path = createTempCsx "throw new Exception(\"boom\");"
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.False(result.Passed)
        Assert.True(result.Error.IsSome)
    finally
        cleanupScript path

// ─── C# scripts doing actual work ───────────────────────────

[<Fact>]
let ``CSX script can do computation and print result`` () =
    let script = "var sum = Enumerable.Range(1, 10).Sum();\nConsole.WriteLine($\"Sum: {sum}\");"
    let path = createTempCsx script
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed, $"Script should pass. Error: {result.Error}")
        Assert.Contains("Sum: 55", result.Log)
    finally
        cleanupScript path

[<Fact>]
let ``CSX script can read environment variables`` () =
    let script = "Console.WriteLine($\"PATH exists: {Environment.GetEnvironmentVariable(\"PATH\") != null}\");"
    let path = createTempCsx script
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed, $"Script should pass. Error: {result.Error}")
        Assert.Contains("PATH exists: True", result.Log)
    finally
        cleanupScript path

[<Fact>]
let ``CSX script can write and read temp file`` () =
    let tempFile = Path.Combine(Path.GetTempPath(), sprintf "nap-csx-io-%s.txt" (Guid.NewGuid().ToString("N")))
    let script =
        sprintf "var path = @\"%s\";\nSystem.IO.File.WriteAllText(path, \"hello from csx\");\nvar content = System.IO.File.ReadAllText(path);\nConsole.WriteLine($\"Read: {content}\");\nSystem.IO.File.Delete(path);" tempFile
    let path = createTempCsx script
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed, $"Script should pass. Error: {result.Error}")
        Assert.Contains("Read: hello from csx", result.Log)
    finally
        cleanupScript path
        if File.Exists(tempFile) then File.Delete(tempFile)

// ─── Non-existent C# script ─────────────────────────────────

[<Fact>]
let ``Non-existent CSX script path fails`` () =
    let path = Path.Combine(Path.GetTempPath(), "definitely-does-not-exist.csx")
    let result = Runner.runScript path |> Async.RunSynchronously
    Assert.False(result.Passed)
    Assert.True(result.Error.IsSome)

// ─── C# script with HTTP call ────────────────────────────────

[<Fact>]
let ``CSX script can make HTTP request`` () =
    let script = """
using System.Net.Http;
var client = new HttpClient();
var response = await client.GetAsync("https://jsonplaceholder.typicode.com/posts/1");
Console.WriteLine($"Status: {(int)response.StatusCode}");
"""
    let path = createTempCsx script
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed, $"Script should pass. Error: {result.Error}")
        Assert.True(result.Log |> List.exists (fun l -> l.Contains("Status: 200")),
            $"Should contain status 200. Log: {result.Log}")
    finally
        cleanupScript path

// ─── C# script with async/await ──────────────────────────────

[<Fact>]
let ``CSX script with async await`` () =
    let script = """
var result = await Task.Run(() => 42);
Console.WriteLine($"Async result: {result}");
"""
    let path = createTempCsx script
    try
        let result = Runner.runScript path |> Async.RunSynchronously
        Assert.True(result.Passed, $"Script should pass. Error: {result.Error}")
        Assert.Contains("Async result: 42", result.Log)
    finally
        cleanupScript path
