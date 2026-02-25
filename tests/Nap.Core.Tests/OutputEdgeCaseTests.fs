module OutputEdgeCaseTests

open System
open Xunit
open Nap.Core

let private makeResult file passed statusCode body assertions error log : NapResult =
    {
        File = file
        Request = { Method = GET; Url = "https://example.com"; Headers = Map.empty; Body = None }
        Response =
            if statusCode > 0 then
                Some {
                    StatusCode = statusCode
                    Headers = Map.ofList [("Content-Type", "application/json")]
                    Body = body
                    Duration = TimeSpan.FromMilliseconds(50.0)
                }
            else None
        Assertions = assertions
        Passed = passed
        Error = error
        Log = log
    }

let private passedAssertion target expected : AssertionResult =
    { Assertion = { Target = target; Op = Equals expected }; Passed = true; Expected = expected; Actual = expected }

let private failedAssertion target expected actual : AssertionResult =
    { Assertion = { Target = target; Op = Equals expected }; Passed = false; Expected = expected; Actual = actual }

// ─── JSON output ──────────────────────────────────────────────

[<Fact>]
let ``JSON output has correct file field`` () =
    let result = makeResult "my-test.nap" true 200 "" [] None []
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    Assert.Equal("my-test.nap", doc.RootElement.GetProperty("file").GetString())

[<Fact>]
let ``JSON output with error field`` () =
    let result = makeResult "bad.nap" false 0 "" [] (Some "Connection refused") []
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    Assert.True(doc.RootElement.TryGetProperty("error") |> fst)
    Assert.Equal("Connection refused", doc.RootElement.GetProperty("error").GetString())

[<Fact>]
let ``JSON output without response has no statusCode`` () =
    let result = makeResult "no-response.nap" false 0 "" [] (Some "Timeout") []
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    Assert.False(doc.RootElement.TryGetProperty("statusCode") |> fst)

[<Fact>]
let ``JSON output with headers`` () =
    let result = makeResult "headers.nap" true 200 "" [] None []
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    let headers = doc.RootElement.GetProperty("headers")
    Assert.True(headers.TryGetProperty("Content-Type") |> fst)

[<Fact>]
let ``JSON output with assertions`` () =
    let assertions = [
        passedAssertion "status" "200"
        failedAssertion "body.id" "42" "99"
    ]
    let result = makeResult "test.nap" false 200 "" assertions None []
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    let arr = doc.RootElement.GetProperty("assertions")
    Assert.Equal(2, arr.GetArrayLength())
    Assert.True(arr[0].GetProperty("passed").GetBoolean())
    Assert.False(arr[1].GetProperty("passed").GetBoolean())
    Assert.Equal("42", arr[1].GetProperty("expected").GetString())
    Assert.Equal("99", arr[1].GetProperty("actual").GetString())

[<Fact>]
let ``JSON output body content preserved`` () =
    let body = """{"id": 1, "name": "Alice"}"""
    let result = makeResult "test.nap" true 200 body [] None []
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    Assert.Equal(body, doc.RootElement.GetProperty("body").GetString())

[<Fact>]
let ``JSON output duration in milliseconds`` () =
    let result = makeResult "test.nap" true 200 "" [] None []
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    Assert.True(doc.RootElement.TryGetProperty("duration") |> fst)
    Assert.True(doc.RootElement.GetProperty("duration").GetDouble() >= 0.0)

[<Fact>]
let ``JSON output bodyLength field`` () =
    let body = "hello world"
    let result = makeResult "test.nap" true 200 body [] None []
    let json = Output.formatJson result
    let doc = System.Text.Json.JsonDocument.Parse(json)
    Assert.Equal(body.Length, doc.RootElement.GetProperty("bodyLength").GetInt32())

// ─── JSON array output ────────────────────────────────────────

[<Fact>]
let ``JSON array with multiple results`` () =
    let r1 = makeResult "a.nap" true 200 "" [] None []
    let r2 = makeResult "b.nap" false 404 "" [] None []
    let json = Output.formatJsonArray [r1; r2]
    let doc = System.Text.Json.JsonDocument.Parse(json)
    Assert.Equal(System.Text.Json.JsonValueKind.Array, doc.RootElement.ValueKind)
    Assert.Equal(2, doc.RootElement.GetArrayLength())
    Assert.Equal("a.nap", doc.RootElement[0].GetProperty("file").GetString())
    Assert.Equal("b.nap", doc.RootElement[1].GetProperty("file").GetString())

[<Fact>]
let ``JSON array with single result`` () =
    let r = makeResult "only.nap" true 200 "" [] None []
    let json = Output.formatJsonArray [r]
    let doc = System.Text.Json.JsonDocument.Parse(json)
    Assert.Equal(1, doc.RootElement.GetArrayLength())

[<Fact>]
let ``JSON array empty`` () =
    let json = Output.formatJsonArray []
    let doc = System.Text.Json.JsonDocument.Parse(json)
    Assert.Equal(0, doc.RootElement.GetArrayLength())

// ─── JUnit output ─────────────────────────────────────────────

[<Fact>]
let ``JUnit contains XML declaration`` () =
    let result = makeResult "test.nap" true 200 "" [] None []
    let xml = Output.formatJUnit [result]
    Assert.Contains("<?xml", xml)

[<Fact>]
let ``JUnit with passing test has no failure element`` () =
    let result = makeResult "pass.nap" true 200 "" [passedAssertion "status" "200"] None []
    let xml = Output.formatJUnit [result]
    Assert.Contains("testcase name=\"pass\"", xml)
    Assert.DoesNotContain("<failure", xml)

[<Fact>]
let ``JUnit with failing test has failure element`` () =
    let result = makeResult "fail.nap" false 404 "" [failedAssertion "status" "200" "404"] None []
    let xml = Output.formatJUnit [result]
    Assert.Contains("<failure", xml)
    Assert.Contains("status", xml)

[<Fact>]
let ``JUnit with error result shows error message`` () =
    let result = makeResult "error.nap" false 0 "" [] (Some "Connection refused") []
    let xml = Output.formatJUnit [result]
    Assert.Contains("<failure", xml)
    Assert.Contains("Connection refused", xml)

[<Fact>]
let ``JUnit with mixed results counts failures`` () =
    let r1 = makeResult "a.nap" true 200 "" [] None []
    let r2 = makeResult "b.nap" false 500 "" [] None []
    let r3 = makeResult "c.nap" true 201 "" [] None []
    let xml = Output.formatJUnit [r1; r2; r3]
    Assert.Contains("tests=\"3\"", xml)
    Assert.Contains("failures=\"1\"", xml)

[<Fact>]
let ``JUnit time attribute is in seconds`` () =
    let result = makeResult "test.nap" true 200 "" [] None []
    let xml = Output.formatJUnit [result]
    Assert.Contains("time=\"0.050\"", xml)

// ─── Pretty output ────────────────────────────────────────────

[<Fact>]
let ``Pretty output contains PASS for passing result`` () =
    let result = makeResult "test.nap" true 200 "" [] None []
    let pretty = Output.formatPretty result
    Assert.Contains("[PASS]", pretty)

[<Fact>]
let ``Pretty output contains FAIL for failing result`` () =
    let result = makeResult "test.nap" false 404 "" [] None []
    let pretty = Output.formatPretty result
    Assert.Contains("[FAIL]", pretty)

[<Fact>]
let ``Pretty output shows error message`` () =
    let result = makeResult "test.nap" false 0 "" [] (Some "Network error") []
    let pretty = Output.formatPretty result
    Assert.Contains("Network error", pretty)

[<Fact>]
let ``Pretty output shows log lines`` () =
    let result = makeResult "script.fsx" true 0 "" [] None ["[setup] line 1"; "[setup] line 2"]
    let pretty = Output.formatPretty result
    Assert.Contains("[setup] line 1", pretty)
    Assert.Contains("[setup] line 2", pretty)

[<Fact>]
let ``Pretty output shows failed assertion with expected/actual`` () =
    let assertions = [failedAssertion "status" "200" "404"]
    let result = makeResult "test.nap" false 404 "" assertions None []
    let pretty = Output.formatPretty result
    Assert.Contains("expected: 200", pretty)
    Assert.Contains("actual:   404", pretty)

[<Fact>]
let ``Pretty output shows status code and method`` () =
    let result = makeResult "test.nap" true 200 "" [] None []
    let pretty = Output.formatPretty result
    Assert.Contains("200", pretty)
    Assert.Contains("GET", pretty)

// ─── Summary output ───────────────────────────────────────────

[<Fact>]
let ``Summary all passed`` () =
    let results = [
        makeResult "a.nap" true 200 "" [] None []
        makeResult "b.nap" true 201 "" [] None []
    ]
    let summary = Output.formatSummary results
    Assert.Contains("2/2 passed", summary)
    Assert.Contains("0 failed", summary)

[<Fact>]
let ``Summary with failures`` () =
    let results = [
        makeResult "a.nap" true 200 "" [] None []
        makeResult "b.nap" false 404 "" [] None []
        makeResult "c.nap" false 500 "" [] None []
    ]
    let summary = Output.formatSummary results
    Assert.Contains("1/3 passed", summary)
    Assert.Contains("2 failed", summary)

[<Fact>]
let ``Summary with all failures`` () =
    let results = [
        makeResult "a.nap" false 500 "" [] None []
    ]
    let summary = Output.formatSummary results
    Assert.Contains("0/1 passed", summary)
    Assert.Contains("1 failed", summary)
