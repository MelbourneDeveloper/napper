module AssertionEdgeCaseTests

open System
open Xunit
open Nap.Core

let private makeResponse status headers body durationMs : NapResponse =
    {
        StatusCode = status
        Headers = headers |> Map.ofList
        Body = body
        Duration = TimeSpan.FromMilliseconds(float durationMs)
    }

let private ok200 body =
    makeResponse 200 [("Content-Type", "application/json")] body 100

// ─── Status assertions ────────────────────────────────────────

[<Fact>]
let ``Status equals various codes`` () =
    for code in [200; 201; 204; 301; 400; 401; 403; 404; 500; 502; 503] do
        let response = makeResponse code [] "" 50
        let assertions = [{ Target = "status"; Op = Equals (string code) }]
        let results = Runner.evaluateAssertions assertions response
        Assert.True(results[0].Passed, $"Expected status {code} to match")

[<Fact>]
let ``Status mismatch reports actual code`` () =
    let response = makeResponse 500 [] "" 50
    let assertions = [{ Target = "status"; Op = Equals "200" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)
    Assert.Equal("500", results[0].Actual)
    Assert.Equal("200", results[0].Expected)

// ─── Body assertions ──────────────────────────────────────────

[<Fact>]
let ``Whole body equals`` () =
    let response = ok200 "hello world"
    let assertions = [{ Target = "body"; Op = Equals "hello world" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``Whole body contains`` () =
    let response = ok200 "The quick brown fox"
    let assertions = [{ Target = "body"; Op = Contains "QUICK" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed, "Contains should be case-insensitive")

[<Fact>]
let ``Whole body exists`` () =
    let response = ok200 "anything"
    let assertions = [{ Target = "body"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

// ─── JSON path extraction ─────────────────────────────────────

[<Fact>]
let ``Deeply nested JSON path (3 levels)`` () =
    let body = """{"user": {"address": {"city": "Portland"}}}"""
    let response = ok200 body
    let assertions = [{ Target = "body.user.address.city"; Op = Equals "Portland" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``JSON numeric field`` () =
    let body = """{"count": 42}"""
    let response = ok200 body
    let assertions = [{ Target = "body.count"; Op = Equals "42" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``JSON boolean true field`` () =
    let body = """{"active": true}"""
    let response = ok200 body
    let assertions = [{ Target = "body.active"; Op = Equals "true" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``JSON boolean false field`` () =
    let body = """{"active": false}"""
    let response = ok200 body
    let assertions = [{ Target = "body.active"; Op = Equals "false" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``JSON null field`` () =
    let body = """{"deleted_at": null}"""
    let response = ok200 body
    let assertions = [{ Target = "body.deleted_at"; Op = Equals "null" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``JSON null field exists`` () =
    let body = """{"deleted_at": null}"""
    let response = ok200 body
    let assertions = [{ Target = "body.deleted_at"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``JSON array field returns raw JSON`` () =
    let body = """{"tags": ["a", "b", "c"]}"""
    let response = ok200 body
    let assertions = [{ Target = "body.tags"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``JSON nested object field returns raw JSON`` () =
    let body = """{"user": {"name": "Alice", "age": 30}}"""
    let response = ok200 body
    let assertions = [{ Target = "body.user"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``Missing JSON path fails exists`` () =
    let body = """{"name": "test"}"""
    let response = ok200 body
    let assertions = [{ Target = "body.nonexistent"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)
    Assert.Equal("<missing>", results[0].Actual)

[<Fact>]
let ``Missing JSON path fails equals`` () =
    let body = """{"name": "test"}"""
    let response = ok200 body
    let assertions = [{ Target = "body.missing"; Op = Equals "anything" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)
    Assert.Equal("<missing>", results[0].Actual)

[<Fact>]
let ``Non-JSON body with body path returns missing`` () =
    let response = ok200 "plain text, not json"
    let assertions = [{ Target = "body.field"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)

[<Fact>]
let ``Empty body with body path returns missing`` () =
    let response = ok200 ""
    let assertions = [{ Target = "body.field"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)

// ─── Header assertions ────────────────────────────────────────

[<Fact>]
let ``Header case-insensitive lookup`` () =
    let response = makeResponse 200 [("content-type", "application/json")] "" 50
    let assertions = [{ Target = "headers.Content-Type"; Op = Contains "json" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed, "Header lookup should be case-insensitive")

[<Fact>]
let ``Header exact match`` () =
    let response = makeResponse 200 [("X-Custom", "hello")] "" 50
    let assertions = [{ Target = "headers.X-Custom"; Op = Equals "hello" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``Header exists`` () =
    let response = makeResponse 200 [("X-Request-Id", "abc-123")] "" 50
    let assertions = [{ Target = "headers.X-Request-Id"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``Missing header fails`` () =
    let response = makeResponse 200 [] "" 50
    let assertions = [{ Target = "headers.X-Missing"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)

// ─── Duration assertions ──────────────────────────────────────

[<Fact>]
let ``Duration less than passes`` () =
    let response = makeResponse 200 [] "" 100
    let assertions = [{ Target = "duration"; Op = LessThan "500ms" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``Duration less than fails when over threshold`` () =
    let response = makeResponse 200 [] "" 600
    let assertions = [{ Target = "duration"; Op = LessThan "500ms" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)

[<Fact>]
let ``Duration greater than passes`` () =
    let response = makeResponse 200 [] "" 600
    let assertions = [{ Target = "duration"; Op = GreaterThan "500ms" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``Duration greater than fails when under threshold`` () =
    let response = makeResponse 200 [] "" 100
    let assertions = [{ Target = "duration"; Op = GreaterThan "500ms" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)

// ─── Contains assertion ───────────────────────────────────────

[<Fact>]
let ``Contains is case-insensitive`` () =
    let response = makeResponse 200 [("Content-Type", "Application/JSON")] "" 50
    let assertions = [{ Target = "headers.Content-Type"; Op = Contains "json" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``Contains fails when substring absent`` () =
    let response = ok200 """{"type": "xml"}"""
    let assertions = [{ Target = "body.type"; Op = Contains "json" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)

// ─── Matches assertion ────────────────────────────────────────

[<Fact>]
let ``Matches with pattern`` () =
    let response = ok200 """{"email": "test@example.com"}"""
    let assertions = [{ Target = "body.email"; Op = Matches ".+@.+\\..+" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.True(results[0].Passed)

[<Fact>]
let ``Matches fails when pattern does not match`` () =
    let response = ok200 """{"email": "not-an-email"}"""
    let assertions = [{ Target = "body.email"; Op = Matches ".+@.+\\..+" }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)

// ─── Multiple assertions mixed results ────────────────────────

[<Fact>]
let ``Multiple assertions with mixed pass/fail`` () =
    let response = makeResponse 404 [("Content-Type", "application/json")] """{"error": "not found"}""" 50
    let assertions = [
        { Target = "status"; Op = Equals "200" }
        { Target = "headers.Content-Type"; Op = Contains "json" }
        { Target = "body.error"; Op = Equals "not found" }
        { Target = "body.id"; Op = Exists }
    ]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed, "status should fail (404 != 200)")
    Assert.True(results[1].Passed, "header should pass")
    Assert.True(results[2].Passed, "body.error should pass")
    Assert.False(results[3].Passed, "body.id should fail (missing)")

[<Fact>]
let ``All assertions pass for healthy response`` () =
    let body = """{"id": 1, "name": "Alice", "active": true}"""
    let response = makeResponse 200 [("Content-Type", "application/json"); ("X-Request-Id", "abc")] body 50
    let assertions = [
        { Target = "status"; Op = Equals "200" }
        { Target = "body.id"; Op = Exists }
        { Target = "body.name"; Op = Equals "Alice" }
        { Target = "body.active"; Op = Equals "true" }
        { Target = "headers.Content-Type"; Op = Contains "json" }
        { Target = "headers.X-Request-Id"; Op = Exists }
        { Target = "duration"; Op = LessThan "1000ms" }
    ]
    let results = Runner.evaluateAssertions assertions response
    Assert.All(results, fun r -> Assert.True(r.Passed, $"{r.Assertion.Target}: expected {r.Expected}, got {r.Actual}"))

// ─── Unknown target ───────────────────────────────────────────

[<Fact>]
let ``Unknown target returns missing`` () =
    let response = ok200 ""
    let assertions = [{ Target = "unknown_target"; Op = Exists }]
    let results = Runner.evaluateAssertions assertions response
    Assert.False(results[0].Passed)
    Assert.Equal("<missing>", results[0].Actual)
