module Tests

open System
open Xunit
open Nap.Core

// ─── Parser: Shorthand ─────────────────────────────────────────

[<Fact>]
let ``Parse shorthand GET request`` () =
    let result = Parser.parseNapFile "GET https://example.com/api"
    match result with
    | Result.Ok nap ->
        Assert.Equal(GET, nap.Request.Method)
        Assert.Equal("https://example.com/api", nap.Request.Url)
        Assert.Empty(nap.Assertions)
    | Result.Error e -> failwith e

[<Fact>]
let ``Parse shorthand POST request`` () =
    let result = Parser.parseNapFile "POST https://example.com/api"
    match result with
    | Result.Ok nap -> Assert.Equal(POST, nap.Request.Method)
    | Result.Error e -> failwith e

// ─── Parser: Full format ───────────────────────────────────────

[<Fact>]
let ``Parse full format with meta and request`` () =
    let input = """
[meta]
name = "Test request"
tags = ["smoke", "users"]

[request]
method = GET
url = https://example.com/users
"""
    let result = Parser.parseNapFile input
    match result with
    | Result.Ok nap ->
        Assert.Equal(Some "Test request", nap.Meta.Name)
        Assert.Equal<string list>(["smoke"; "users"], nap.Meta.Tags)
        Assert.Equal(GET, nap.Request.Method)
        Assert.Equal("https://example.com/users", nap.Request.Url)
    | Result.Error e -> failwith e

[<Fact>]
let ``Parse full format with comments`` () =
    let input = """
# This is a comment
[meta]
name = "Commented request"

# Another comment
[request]
method = POST
url = https://example.com/create
"""
    let result = Parser.parseNapFile input
    match result with
    | Result.Ok nap ->
        Assert.Equal(Some "Commented request", nap.Meta.Name)
        Assert.Equal(POST, nap.Request.Method)
    | Result.Error e -> failwith e

[<Fact>]
let ``Parse full format with headers`` () =
    let input = """
[request]
method = GET
url = https://example.com

[request.headers]
Authorization = Bearer mytoken
Accept = application/json
"""
    let result = Parser.parseNapFile input
    match result with
    | Result.Ok nap ->
        Assert.Equal("Bearer mytoken", nap.Request.Headers["Authorization"])
        Assert.Equal("application/json", nap.Request.Headers["Accept"])
    | Result.Error e -> failwith e

[<Fact>]
let ``Parse full format with assertions`` () =
    let input = """
[request]
method = GET
url = https://example.com

[assert]
status = 200
body.id exists
headers.Content-Type contains "json"
duration < 500ms
"""
    let result = Parser.parseNapFile input
    match result with
    | Result.Ok nap ->
        Assert.Equal(4, nap.Assertions.Length)
        Assert.Equal({ Target = "status"; Op = Equals "200" }, nap.Assertions[0])
        Assert.Equal({ Target = "body.id"; Op = Exists }, nap.Assertions[1])
        Assert.Equal({ Target = "headers.Content-Type"; Op = Contains "json" }, nap.Assertions[2])
        Assert.Equal({ Target = "duration"; Op = LessThan "500ms" }, nap.Assertions[3])
    | Result.Error e -> failwith e

[<Fact>]
let ``Parse full format with vars`` () =
    let input = """
[vars]
userId = "42"
baseUrl = "https://example.com"

[request]
method = GET
url = {{baseUrl}}/users/{{userId}}
"""
    let result = Parser.parseNapFile input
    match result with
    | Result.Ok nap ->
        Assert.Equal("42", nap.Vars["userId"])
        Assert.Equal("https://example.com", nap.Vars["baseUrl"])
        Assert.Equal("{{baseUrl}}/users/{{userId}}", nap.Request.Url)
    | Result.Error e -> failwith e

[<Fact>]
let ``Parse full format with script block`` () =
    let input = """
[request]
method = GET
url = https://example.com

[script]
pre = ./scripts/auth.fsx
post = ./scripts/validate.fsx
"""
    let result = Parser.parseNapFile input
    match result with
    | Result.Ok nap ->
        Assert.Equal(Some "./scripts/auth.fsx", nap.Script.Pre)
        Assert.Equal(Some "./scripts/validate.fsx", nap.Script.Post)
    | Result.Error e -> failwith e

[<Fact>]
let ``Parse full format with request body`` () =
    let tq = "\"\"\""
    let input =
        "[request]\n" +
        "method = POST\n" +
        "url = https://example.com/api\n" +
        "\n" +
        "[request.body]\n" +
        "content-type = application/json\n" +
        tq + "\n" +
        "{ \"name\": \"test\" }\n" +
        tq + "\n" +
        "\n" +
        "[assert]\n" +
        "status = 201\n"
    let result = Parser.parseNapFile input
    match result with
    | Result.Ok nap ->
        Assert.Equal(POST, nap.Request.Method)
        Assert.True(nap.Request.Body.IsSome)
        Assert.Equal("application/json", nap.Request.Body.Value.ContentType)
        Assert.Contains("test", nap.Request.Body.Value.Content)
        Assert.Equal(1, nap.Assertions.Length)
        Assert.Equal({ Target = "status"; Op = Equals "201" }, nap.Assertions[0])
    | Result.Error e -> failwith e

[<Fact>]
let ``Parse full format with headers and body`` () =
    let tq = "\"\"\""
    let input =
        "[request]\n" +
        "method = POST\n" +
        "url = https://example.com/api\n" +
        "\n" +
        "[request.headers]\n" +
        "Accept = application/json\n" +
        "\n" +
        "[request.body]\n" +
        "content-type = application/json\n" +
        tq + "\n" +
        "{ \"key\": \"value\" }\n" +
        tq + "\n"
    let result = Parser.parseNapFile input
    match result with
    | Result.Ok nap ->
        Assert.Equal("application/json", nap.Request.Headers["Accept"])
        Assert.True(nap.Request.Body.IsSome)
    | Result.Error e -> failwith e

// ─── Parser: .naplist ──────────────────────────────────────────

[<Fact>]
let ``Parse naplist with steps`` () =
    let input = """
[meta]
name = "Smoke Suite"
env = staging

[vars]
timeout = "5000"

[steps]
./auth/01_login.nap
./users/01_get-user.nap
./regression.naplist
./scripts/setup.fsx
"""
    let result = Parser.parseNapList input
    match result with
    | Result.Ok playlist ->
        Assert.Equal(Some "Smoke Suite", playlist.Meta.Name)
        Assert.Equal(Some "staging", playlist.Env)
        Assert.Equal("5000", playlist.Vars["timeout"])
        Assert.Equal(4, playlist.Steps.Length)
        Assert.Equal(NapFileStep "./auth/01_login.nap", playlist.Steps[0])
        Assert.Equal(NapFileStep "./users/01_get-user.nap", playlist.Steps[1])
        Assert.Equal(PlaylistRef "./regression.naplist", playlist.Steps[2])
        Assert.Equal(ScriptStep "./scripts/setup.fsx", playlist.Steps[3])
    | Result.Error e -> failwith e

// ─── Environment ───────────────────────────────────────────────

[<Fact>]
let ``Parse env file`` () =
    let content = """
baseUrl = "https://example.com"
token = "abc123"
# comment
empty =
"""
    let vars = Environment.parseEnvFile content
    Assert.Equal("https://example.com", vars["baseUrl"])
    Assert.Equal("abc123", vars["token"])

[<Fact>]
let ``Resolve variables in string`` () =
    let vars = Map.ofList [("baseUrl", "https://example.com"); ("id", "42")]
    Assert.Equal("https://example.com/users/42", Environment.resolveVars vars "{{baseUrl}}/users/{{id}}")

[<Fact>]
let ``Unresolved variables remain`` () =
    let vars = Map.ofList [("baseUrl", "https://example.com")]
    Assert.Equal("https://example.com/{{unknown}}", Environment.resolveVars vars "{{baseUrl}}/{{unknown}}")

[<Fact>]
let ``CLI vars override file vars`` () =
    let dir = System.IO.Path.GetTempPath()
    let fileVars = Map.ofList [("key", "file-value")]
    let cliVars = Map.ofList [("key", "cli-value")]
    let result = Environment.loadEnvironment dir None cliVars fileVars
    Assert.Equal("cli-value", result["key"])

// ─── Assertions ────────────────────────────────────────────────

[<Fact>]
let ``Assert status equals`` () =
    let response: NapResponse = {
        StatusCode = 200
        Headers = Map.ofList [("Content-Type", "application/json")]
        Body = """{"id": 42, "name": "Alice"}"""
        Duration = TimeSpan.FromMilliseconds(100.0)
    }
    let assertions = [
        { Target = "status"; Op = Equals "200" }
        { Target = "body.id"; Op = Exists }
        { Target = "body.name"; Op = Equals "Alice" }
        { Target = "headers.Content-Type"; Op = Contains "json" }
        { Target = "duration"; Op = LessThan "500ms" }
    ]
    let results = Runner.evaluateAssertions assertions response
    Assert.All(results, fun r -> Assert.True(r.Passed, $"{r.Assertion.Target}: expected {r.Expected}, got {r.Actual}"))

[<Fact>]
let ``Assert status fails on mismatch`` () =
    let response: NapResponse = {
        StatusCode = 404
        Headers = Map.empty
        Body = ""
        Duration = TimeSpan.FromMilliseconds(50.0)
    }
    let assertions = [{ Target = "status"; Op = Equals "200" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)
    Assert.Equal("404", results[0].Actual)

[<Fact>]
let ``Assert body path missing`` () =
    let response: NapResponse = {
        StatusCode = 200
        Headers = Map.empty
        Body = """{"name": "test"}"""
        Duration = TimeSpan.FromMilliseconds(50.0)
    }
    let assertions = [{ Target = "body.missing"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)

[<Fact>]
let ``Assert duration greater than`` () =
    let response: NapResponse = {
        StatusCode = 200
        Headers = Map.empty
        Body = ""
        Duration = TimeSpan.FromMilliseconds(600.0)
    }
    let assertions = [{ Target = "duration"; Op = LessThan "500ms" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)

// ─── Script execution ──────────────────────────────────────────

[<Fact>]
let ``runScript executes fsx and captures stdout`` () =
    let dir = System.IO.Path.GetTempPath()
    let scriptPath = System.IO.Path.Combine(dir, "nap-test-script.fsx")
    System.IO.File.WriteAllText(scriptPath, "printfn \"[test] hello from script\"\nprintfn \"[test] done\"")
    try
        let result = Runner.runScript scriptPath |> Async.RunSynchronously
        Assert.True(result.Passed, $"Script should pass, but got error: {result.Error}")
        Assert.True(result.Error.IsNone, "Passed script should have no error")
        Assert.Equal(2, result.Log.Length)
        Assert.Equal("[test] hello from script", result.Log[0])
        Assert.Equal("[test] done", result.Log[1])
        Assert.True(result.Response.IsNone, "Script result should have no HTTP response")
        Assert.Empty(result.Assertions)
        Assert.Contains("nap-test-script.fsx", result.File)
        Assert.Equal(GET, result.Request.Method)
        Assert.Equal("", result.Request.Url)
        Assert.Empty(result.Request.Headers)
        Assert.True(result.Request.Body.IsNone, "Script should have no request body")
    finally
        System.IO.File.Delete(scriptPath)

[<Fact>]
let ``runScript reports failure for invalid script`` () =
    let dir = System.IO.Path.GetTempPath()
    let scriptPath = System.IO.Path.Combine(dir, "nap-test-bad-script.fsx")
    System.IO.File.WriteAllText(scriptPath, "let x: int = \"not an int\"")
    try
        let result = Runner.runScript scriptPath |> Async.RunSynchronously
        Assert.False(result.Passed, "Invalid script should fail")
        Assert.True(result.Error.IsSome, "Should have error message")
        Assert.True(result.Error.Value.Length > 0, "Error message should not be empty")
        Assert.True(result.Response.IsNone, "Failed script should have no HTTP response")
        Assert.Empty(result.Assertions)
        Assert.Contains("nap-test-bad-script.fsx", result.File)
        Assert.Equal(GET, result.Request.Method)
        Assert.Equal("", result.Request.Url)
        Assert.True(result.Request.Body.IsNone, "Failed script should have no request body")
    finally
        System.IO.File.Delete(scriptPath)

[<Fact>]
let ``JSON output includes log field for script results`` () =
    let result: NapResult = {
        File = "setup.fsx"
        Request = { Method = GET; Url = ""; Headers = Map.empty; Body = None }
        Response = None
        Assertions = []
        Passed = true
        Error = None
        Log = ["[setup] Seeded data"; "[setup] Done"]
    }
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    let root = doc.RootElement
    Assert.Equal("setup.fsx", root.GetProperty("file").GetString())
    Assert.True(root.GetProperty("passed").GetBoolean(), "JSON passed should be true")
    Assert.False(root.TryGetProperty("error") |> fst, "JSON should NOT have 'error' when None")
    Assert.False(root.TryGetProperty("statusCode") |> fst, "Script result should have no statusCode")
    Assert.False(root.TryGetProperty("duration") |> fst, "Script result should have no duration")
    Assert.False(root.TryGetProperty("body") |> fst, "Script result should have no body")
    Assert.False(root.TryGetProperty("headers") |> fst, "Script result should have no headers")
    Assert.Equal(0, root.GetProperty("assertions").GetArrayLength())
    Assert.True(root.TryGetProperty("log") |> fst, "JSON should have 'log' property")
    let logArray = root.GetProperty("log")
    Assert.Equal(2, logArray.GetArrayLength())
    Assert.Equal("[setup] Seeded data", logArray[0].GetString())
    Assert.Equal("[setup] Done", logArray[1].GetString())

[<Fact>]
let ``JSON output omits log field when empty`` () =
    let result: NapResult = {
        File = "test.nap"
        Request = { Method = GET; Url = "https://example.com"; Headers = Map.empty; Body = None }
        Response = Some { StatusCode = 200; Headers = Map.empty; Body = ""; Duration = TimeSpan.FromMilliseconds(50.0) }
        Assertions = []
        Passed = true
        Error = None
        Log = []
    }
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    let root = doc.RootElement
    Assert.False(root.TryGetProperty("log") |> fst, "JSON should NOT have 'log' when empty")
    Assert.Equal("test.nap", root.GetProperty("file").GetString())
    Assert.True(root.GetProperty("passed").GetBoolean())
    Assert.Equal(200, root.GetProperty("statusCode").GetInt32())
    Assert.True(root.TryGetProperty("duration") |> fst, "Should have duration for HTTP result")
    Assert.True(root.TryGetProperty("body") |> fst, "Should have body for HTTP result")
    Assert.True(root.TryGetProperty("headers") |> fst, "Should have headers for HTTP result")
    Assert.Equal(0, root.GetProperty("assertions").GetArrayLength())

// ─── Output ────────────────────────────────────────────────────

[<Fact>]
let ``JUnit output is valid XML`` () =
    let result: NapResult = {
        File = "test.nap"
        Request = { Method = GET; Url = "https://example.com"; Headers = Map.empty; Body = None }
        Response = Some { StatusCode = 200; Headers = Map.empty; Body = ""; Duration = TimeSpan.FromMilliseconds(50.0) }
        Assertions = [{ Assertion = { Target = "status"; Op = Equals "200" }; Passed = true; Expected = "200"; Actual = "200" }]
        Passed = true
        Error = None
        Log = []
    }
    let xml = Output.formatJUnit [result]
    Assert.Contains("<?xml", xml)
    Assert.Contains("testsuites", xml)
    Assert.Contains("testcase", xml)
    Assert.Contains("tests=\"1\"", xml)
    Assert.Contains("failures=\"0\"", xml)
    Assert.Contains("name=\"test\"", xml)
    Assert.Contains("time=", xml)

[<Fact>]
let ``JSON output is parseable`` () =
    let result: NapResult = {
        File = "test.nap"
        Request = { Method = GET; Url = "https://example.com"; Headers = Map.empty; Body = None }
        Response = Some { StatusCode = 200; Headers = Map.empty; Body = """{"ok":true}"""; Duration = TimeSpan.FromMilliseconds(50.0) }
        Assertions = []
        Passed = true
        Error = None
        Log = []
    }
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    let root = doc.RootElement
    Assert.Equal("test.nap", root.GetProperty("file").GetString())
    Assert.True(root.GetProperty("passed").GetBoolean())
    Assert.Equal(200, root.GetProperty("statusCode").GetInt32())
    Assert.Equal(50.0, root.GetProperty("duration").GetDouble())
    Assert.Equal(11, root.GetProperty("bodyLength").GetInt32())
    Assert.Equal("{\"ok\":true}", root.GetProperty("body").GetString())
    Assert.True(root.TryGetProperty("headers") |> fst, "Should have headers object")
    Assert.Equal(0, root.GetProperty("assertions").GetArrayLength())
    Assert.False(root.TryGetProperty("log") |> fst, "Should not have log when empty")
    Assert.False(root.TryGetProperty("error") |> fst, "Should not have error when None")
