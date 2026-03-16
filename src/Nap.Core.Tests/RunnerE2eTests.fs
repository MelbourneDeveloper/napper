module RunnerE2eTests

open System
open System.IO
open Xunit
open Nap.Core

let private createTempDir () =
    let dir = Path.Combine(Path.GetTempPath(), $"nap-runner-e2e-{Guid.NewGuid():N}")
    Directory.CreateDirectory(dir) |> ignore
    dir

let private cleanupDir (dir: string) =
    if Directory.Exists(dir) then Directory.Delete(dir, true)

let private writeNapFile (dir: string) (name: string) (content: string) : string =
    let filePath = Path.Combine(dir, name)
    File.WriteAllText(filePath, content)
    filePath

// ─── runNapFile: successful GET with assertions ──────────────

[<Fact>]
let ``runNapFile GET with assertions passes`` () =
    let dir = createTempDir ()
    try
        let nap = "GET https://httpbin.org/get"
        let filePath = writeNapFile dir "test.nap" nap
        let result = Runner.runNapFile filePath Map.empty None |> Async.RunSynchronously
        Assert.True(result.Passed, "Simple GET should pass")
        Assert.True(result.Response.IsSome, "Must have response")
        Assert.Equal(200, result.Response.Value.StatusCode)
        Assert.True(result.Error.IsNone)
    finally cleanupDir dir

[<Fact>]
let ``runNapFile full format GET with assertions`` () =
    let dir = createTempDir ()
    try
        let nap = "[request]\nmethod = GET\nurl = https://httpbin.org/get\n\n[assert]\nstatus = 200\nbody.url exists"
        let filePath = writeNapFile dir "full.nap" nap
        let result = Runner.runNapFile filePath Map.empty None |> Async.RunSynchronously
        Assert.True(result.Passed, "Full format GET should pass")
        Assert.True(result.Assertions.Length >= 2, $"Must have 2+ assertions, got {result.Assertions.Length}")
        Assert.True(result.Assertions |> List.forall (fun a -> a.Passed))
    finally cleanupDir dir

// ─── runNapFile: POST with body ──────────────────────────────

[<Fact>]
let ``runNapFile POST with body`` () =
    let dir = createTempDir ()
    try
        let nap = "[request]\nmethod = POST\nurl = https://httpbin.org/post\n\n[request.headers]\nContent-Type = application/json\n\n[request.body]\ncontent-type = application/json\n\"\"\"\n{\"key\": \"value\"}\n\"\"\"\n\n[assert]\nstatus = 200"
        let filePath = writeNapFile dir "post.nap" nap
        let result = Runner.runNapFile filePath Map.empty None |> Async.RunSynchronously
        Assert.True(result.Passed, $"POST should pass. Error: {result.Error}")
        Assert.Equal(200, result.Response.Value.StatusCode)
    finally cleanupDir dir

// ─── runNapFile: assertion failure ───────────────────────────

[<Fact>]
let ``runNapFile wrong status assertion fails`` () =
    let dir = createTempDir ()
    try
        let nap = "[request]\nmethod = GET\nurl = https://httpbin.org/get\n\n[assert]\nstatus = 404"
        let filePath = writeNapFile dir "fail.nap" nap
        let result = Runner.runNapFile filePath Map.empty None |> Async.RunSynchronously
        Assert.False(result.Passed, "Wrong status should fail")
        Assert.True(result.Assertions.Length >= 1, "Must have assertions")
        Assert.False(result.Assertions[0].Passed)
        Assert.Equal("404", result.Assertions[0].Expected)
        Assert.Equal("200", result.Assertions[0].Actual)
    finally cleanupDir dir

// ─── runNapFile: variable substitution ───────────────────────

[<Fact>]
let ``runNapFile substitutes CLI variables`` () =
    let dir = createTempDir ()
    try
        let nap = "[request]\nmethod = GET\nurl = https://httpbin.org/status/{{code}}\n\n[assert]\nstatus = {{code}}"
        let filePath = writeNapFile dir "vars.nap" nap
        let vars = Map.ofList [ "code", "200" ]
        let result = Runner.runNapFile filePath vars None |> Async.RunSynchronously
        Assert.True(result.Passed, $"Var substitution should work. Error: {result.Error}")
    finally cleanupDir dir

// ─── runNapFile: parse error ─────────────────────────────────

[<Fact>]
let ``runNapFile parse error returns error result`` () =
    let dir = createTempDir ()
    try
        let filePath = writeNapFile dir "bad.nap" "[meta]\nname = test\n"
        let result = Runner.runNapFile filePath Map.empty None |> Async.RunSynchronously
        Assert.False(result.Passed)
        Assert.True(result.Error.IsSome, "Must have error")
    finally cleanupDir dir

// ─── runNapFile: request failure ─────────────────────────────

[<Fact>]
let ``runNapFile unreachable URL returns error`` () =
    let dir = createTempDir ()
    try
        let nap = "GET https://this-domain-does-not-exist-napper-test.invalid/api"
        let filePath = writeNapFile dir "bad-url.nap" nap
        let result = Runner.runNapFile filePath Map.empty None |> Async.RunSynchronously
        Assert.False(result.Passed)
        Assert.True(result.Error.IsSome)
        Assert.Contains("Request failed", result.Error.Value)
    finally cleanupDir dir

// ─── runNapFile: environment loading ─────────────────────────

[<Fact>]
let ``runNapFile loads vars from napenv`` () =
    let dir = createTempDir ()
    try
        File.WriteAllText(Path.Combine(dir, ".napenv"), "code = 200\n")
        let nap = "[request]\nmethod = GET\nurl = https://httpbin.org/status/{{code}}\n\n[assert]\nstatus = {{code}}"
        let filePath = writeNapFile dir "env.nap" nap
        let result = Runner.runNapFile filePath Map.empty None |> Async.RunSynchronously
        Assert.True(result.Passed, $"napenv vars should resolve. Error: {result.Error}")
    finally cleanupDir dir

// ─── runNapFile: header contains assertion ───────────────────

[<Fact>]
let ``runNapFile contains assertion on header`` () =
    let dir = createTempDir ()
    try
        let nap = "[request]\nmethod = GET\nurl = https://httpbin.org/get\n\n[assert]\nstatus = 200\nheaders.Content-Type contains json"
        let filePath = writeNapFile dir "hdr.nap" nap
        let result = Runner.runNapFile filePath Map.empty None |> Async.RunSynchronously
        Assert.True(result.Passed, $"Header contains should pass. Error: {result.Error}")
    finally cleanupDir dir

// ─── runNapFile: duration assertion ──────────────────────────

[<Fact>]
let ``runNapFile duration less than assertion`` () =
    let dir = createTempDir ()
    try
        let nap = "[request]\nmethod = GET\nurl = https://httpbin.org/get\n\n[assert]\nstatus = 200\nduration < 30000ms"
        let filePath = writeNapFile dir "dur.nap" nap
        let result = Runner.runNapFile filePath Map.empty None |> Async.RunSynchronously
        Assert.True(result.Passed, $"Duration should pass. Error: {result.Error}")
    finally cleanupDir dir

// ─── evaluateAssertions: all operators ───────────────────────

[<Fact>]
let ``evaluateAssertions covers all assertion operators`` () =
    let response : NapResponse = {
        StatusCode = 200
        Headers = Map.ofList [ "Content-Type", "application/json" ]
        Body = "{\"id\": 42, \"name\": \"test\", \"active\": true, \"score\": null}"
        Duration = TimeSpan.FromMilliseconds(100.0)
    }
    let assertions = [
        { Target = "status"; Op = Equals "200" }
        { Target = "body.id"; Op = Exists }
        { Target = "body.name"; Op = Equals "test" }
        { Target = "body.active"; Op = Equals "true" }
        { Target = "body.score"; Op = Exists }
        { Target = "headers.Content-Type"; Op = Contains "json" }
        { Target = "duration"; Op = LessThan "5000ms" }
        { Target = "duration"; Op = GreaterThan "1ms" }
        { Target = "body.name"; Op = Matches "t*t" }
        { Target = "body"; Op = Exists }
        { Target = "body"; Op = Contains "id" }
    ]
    let results = Runner.evaluateAssertions assertions response
    Assert.Equal(11, results.Length)
    for r in results do
        Assert.True(r.Passed, $"Assertion on {r.Assertion.Target} should pass: expected={r.Expected} actual={r.Actual}")

[<Fact>]
let ``evaluateAssertions missing targets all fail`` () =
    let response : NapResponse = {
        StatusCode = 200; Headers = Map.empty
        Body = "{}"; Duration = TimeSpan.FromMilliseconds(50.0)
    }
    let assertions = [
        { Target = "body.nonexistent"; Op = Exists }
        { Target = "body.missing"; Op = Equals "value" }
        { Target = "headers.X-Missing"; Op = Contains "x" }
        { Target = "body.nope"; Op = Matches "abc" }
        { Target = "unknown_target"; Op = Exists }
    ]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results |> List.forall (fun r -> not r.Passed))

[<Fact>]
let ``evaluateAssertions numeric comparison edge cases`` () =
    let response : NapResponse = {
        StatusCode = 200; Headers = Map.empty
        Body = "{}"; Duration = TimeSpan.FromMilliseconds(50.0)
    }
    let assertions = [
        { Target = "duration"; Op = LessThan "not-a-number" }
        { Target = "duration"; Op = GreaterThan "999999ms" }
    ]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed, "LessThan with non-numeric should fail")
    Assert.False(results[1].Passed, "GreaterThan with huge value should fail")
