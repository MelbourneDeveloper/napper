module ParserEdgeCaseTests

open Xunit
open Nap.Core

// ─── Shorthand: all HTTP methods ──────────────────────────────

[<Fact>]
let ``Parse shorthand PUT`` () =
    match Parser.parseNapFile "PUT https://example.com/resource/1" with
    | Ok nap ->
        Assert.Equal(PUT, nap.Request.Method)
        Assert.Equal("https://example.com/resource/1", nap.Request.Url)
    | Error e -> failwith e

[<Fact>]
let ``Parse shorthand PATCH`` () =
    match Parser.parseNapFile "PATCH https://example.com/resource/1" with
    | Ok nap -> Assert.Equal(PATCH, nap.Request.Method)
    | Error e -> failwith e

[<Fact>]
let ``Parse shorthand DELETE`` () =
    match Parser.parseNapFile "DELETE https://example.com/resource/1" with
    | Ok nap -> Assert.Equal(DELETE, nap.Request.Method)
    | Error e -> failwith e

[<Fact>]
let ``Parse shorthand HEAD`` () =
    match Parser.parseNapFile "HEAD https://example.com/" with
    | Ok nap ->
        Assert.Equal(HEAD, nap.Request.Method)
        Assert.Equal("https://example.com/", nap.Request.Url)
    | Error e -> failwith e

[<Fact>]
let ``Parse shorthand OPTIONS`` () =
    match Parser.parseNapFile "OPTIONS https://example.com/api" with
    | Ok nap -> Assert.Equal(OPTIONS, nap.Request.Method)
    | Error e -> failwith e

[<Fact>]
let ``Shorthand is case-insensitive`` () =
    match Parser.parseNapFile "get https://example.com" with
    | Ok nap -> Assert.Equal(GET, nap.Request.Method)
    | Error e -> failwith e

[<Fact>]
let ``Shorthand with leading whitespace`` () =
    match Parser.parseNapFile "   GET https://example.com" with
    | Ok nap ->
        Assert.Equal(GET, nap.Request.Method)
        Assert.Equal("https://example.com", nap.Request.Url)
    | Error e -> failwith e

[<Fact>]
let ``Shorthand has empty meta and no assertions`` () =
    match Parser.parseNapFile "GET https://example.com" with
    | Ok nap ->
        Assert.Equal(None, nap.Meta.Name)
        Assert.Equal(None, nap.Meta.Description)
        Assert.Empty(nap.Meta.Tags)
        Assert.True(nap.Vars.IsEmpty)
        Assert.True(nap.Request.Headers.IsEmpty)
        Assert.True(nap.Request.Body.IsNone)
        Assert.Empty(nap.Assertions)
        Assert.Equal(None, nap.Script.Pre)
        Assert.Equal(None, nap.Script.Post)
    | Error e -> failwith e

// ─── Full format: meta variations ─────────────────────────────

[<Fact>]
let ``Parse meta with description`` () =
    let input = """
[meta]
name = "My Request"
description = "A detailed description"

[request]
method = GET
url = https://example.com
"""
    match Parser.parseNapFile input with
    | Ok nap ->
        Assert.Equal(Some "My Request", nap.Meta.Name)
        Assert.Equal(Some "A detailed description", nap.Meta.Description)
    | Error e -> failwith e

[<Fact>]
let ``Parse meta with empty tags`` () =
    let input = """
[meta]
name = "No tags"

[request]
method = GET
url = https://example.com
"""
    match Parser.parseNapFile input with
    | Ok nap -> Assert.Empty(nap.Meta.Tags)
    | Error e -> failwith e

[<Fact>]
let ``Parse without meta block`` () =
    let input = """
[request]
method = POST
url = https://example.com/create
"""
    match Parser.parseNapFile input with
    | Ok nap ->
        Assert.Equal(None, nap.Meta.Name)
        Assert.Equal(POST, nap.Request.Method)
    | Error e -> failwith e

[<Fact>]
let ``Request defaults to GET when method missing`` () =
    let input = """
[request]
url = https://example.com
"""
    match Parser.parseNapFile input with
    | Ok nap -> Assert.Equal(GET, nap.Request.Method)
    | Error e -> failwith e

// ─── Full format: body variations ─────────────────────────────

[<Fact>]
let ``Body without content-type defaults to application/json`` () =
    let tq = "\"\"\""
    let input =
        "[request]\n" +
        "method = POST\n" +
        "url = https://example.com\n\n" +
        "[request.body]\n" +
        tq + "\n" +
        "{\"key\": \"value\"}\n" +
        tq + "\n"
    match Parser.parseNapFile input with
    | Ok nap ->
        Assert.True(nap.Request.Body.IsSome)
        Assert.Equal("application/json", nap.Request.Body.Value.ContentType)
    | Error e -> failwith e

[<Fact>]
let ``Body with inline content (not triple-quoted)`` () =
    let input = """
[request]
method = POST
url = https://example.com

[request.body]
content-type = text/plain
content = Hello world
"""
    match Parser.parseNapFile input with
    | Ok nap ->
        Assert.True(nap.Request.Body.IsSome)
        Assert.Equal("text/plain", nap.Request.Body.Value.ContentType)
        Assert.Equal("Hello world", nap.Request.Body.Value.Content)
    | Error e -> failwith e

[<Fact>]
let ``No body block yields None`` () =
    let input = """
[request]
method = GET
url = https://example.com
"""
    match Parser.parseNapFile input with
    | Ok nap -> Assert.True(nap.Request.Body.IsNone)
    | Error e -> failwith e

// ─── Full format: multiple sections combined ──────────────────

[<Fact>]
let ``Full format with all sections`` () =
    let tq = "\"\"\""
    let input =
        "# File-level comment\n\n" +
        "[meta]\n" +
        "name = \"Full test\"\n" +
        "description = \"Everything\"\n" +
        "tags = [\"smoke\", \"integration\"]\n\n" +
        "# Vars comment\n" +
        "[vars]\n" +
        "baseUrl = \"https://api.example.com\"\n" +
        "userId = \"42\"\n\n" +
        "[request]\n" +
        "method = POST\n" +
        "url = {{baseUrl}}/users/{{userId}}\n\n" +
        "[request.headers]\n" +
        "Authorization = Bearer token123\n" +
        "Accept = application/json\n\n" +
        "[request.body]\n" +
        "content-type = application/json\n" +
        tq + "\n" +
        "{ \"name\": \"test\" }\n" +
        tq + "\n\n" +
        "[assert]\n" +
        "status = 201\n" +
        "body.id exists\n" +
        "headers.Content-Type contains \"json\"\n" +
        "duration < 1000ms\n" +
        "body.name = test\n\n" +
        "[script]\n" +
        "pre = ./setup.fsx\n" +
        "post = ./teardown.fsx\n"
    match Parser.parseNapFile input with
    | Ok nap ->
        Assert.Equal(Some "Full test", nap.Meta.Name)
        Assert.Equal(Some "Everything", nap.Meta.Description)
        Assert.Equal<string list>(["smoke"; "integration"], nap.Meta.Tags)
        Assert.Equal("https://api.example.com", nap.Vars["baseUrl"])
        Assert.Equal("42", nap.Vars["userId"])
        Assert.Equal(POST, nap.Request.Method)
        Assert.Equal("Bearer token123", nap.Request.Headers["Authorization"])
        Assert.True(nap.Request.Body.IsSome)
        Assert.Equal(5, nap.Assertions.Length)
        Assert.Equal(Some "./setup.fsx", nap.Script.Pre)
        Assert.Equal(Some "./teardown.fsx", nap.Script.Post)
    | Error e -> failwith e

// ─── Assertion operators ──────────────────────────────────────

[<Fact>]
let ``Parse all assertion operators`` () =
    let input = """
[request]
method = GET
url = https://example.com

[assert]
status = 200
body.id exists
headers.Content-Type contains "json"
body.pattern matches "^\\d+$"
duration < 500ms
body.count > 10
"""
    match Parser.parseNapFile input with
    | Ok nap ->
        Assert.Equal(6, nap.Assertions.Length)
        Assert.Equal({ Target = "status"; Op = Equals "200" }, nap.Assertions[0])
        Assert.Equal({ Target = "body.id"; Op = Exists }, nap.Assertions[1])
        Assert.Equal({ Target = "headers.Content-Type"; Op = Contains "json" }, nap.Assertions[2])
        Assert.Equal({ Target = "body.pattern"; Op = Matches "^\\\\d+$" }, nap.Assertions[3])
        Assert.Equal({ Target = "duration"; Op = LessThan "500ms" }, nap.Assertions[4])
        Assert.Equal({ Target = "body.count"; Op = GreaterThan "10" }, nap.Assertions[5])
    | Error e -> failwith e

// ─── Naplist variations ───────────────────────────────────────

[<Fact>]
let ``Naplist with folder refs`` () =
    let input = """
[meta]
name = "With folders"

[steps]
auth
./tests/01_basic.nap
"""
    match Parser.parseNapList input with
    | Ok pl ->
        Assert.Equal(2, pl.Steps.Length)
        Assert.Equal(FolderRef "auth", pl.Steps[0])
        Assert.Equal(NapFileStep "./tests/01_basic.nap", pl.Steps[1])
    | Error e -> failwith e

[<Fact>]
let ``Naplist with comments between steps`` () =
    let input = """
[steps]
# First step
./01_login.nap
# Second step
./02_get-user.nap
"""
    match Parser.parseNapList input with
    | Ok pl ->
        Assert.Equal(2, pl.Steps.Length)
        Assert.Equal(NapFileStep "./01_login.nap", pl.Steps[0])
        Assert.Equal(NapFileStep "./02_get-user.nap", pl.Steps[1])
    | Error e -> failwith e

[<Fact>]
let ``Naplist with no env defaults to None`` () =
    let input = """
[meta]
name = "No env"

[steps]
./test.nap
"""
    match Parser.parseNapList input with
    | Ok pl -> Assert.Equal(None, pl.Env)
    | Error e -> failwith e

[<Fact>]
let ``Naplist with env set`` () =
    let input = """
[meta]
name = "Staging"
env = staging

[steps]
./test.nap
"""
    match Parser.parseNapList input with
    | Ok pl -> Assert.Equal(Some "staging", pl.Env)
    | Error e -> failwith e

[<Fact>]
let ``Naplist with vars`` () =
    let input = """
[vars]
timeout = "5000"
baseUrl = "https://staging.example.com"

[steps]
./test.nap
"""
    match Parser.parseNapList input with
    | Ok pl ->
        Assert.Equal("5000", pl.Vars["timeout"])
        Assert.Equal("https://staging.example.com", pl.Vars["baseUrl"])
    | Error e -> failwith e

[<Fact>]
let ``Naplist with mixed step types`` () =
    let input = """
[steps]
./scripts/setup.fsx
./auth/login.nap
crud
./regression.naplist
./scripts/teardown.fsx
"""
    match Parser.parseNapList input with
    | Ok pl ->
        Assert.Equal(5, pl.Steps.Length)
        Assert.Equal(ScriptStep "./scripts/setup.fsx", pl.Steps[0])
        Assert.Equal(NapFileStep "./auth/login.nap", pl.Steps[1])
        Assert.Equal(FolderRef "crud", pl.Steps[2])
        Assert.Equal(PlaylistRef "./regression.naplist", pl.Steps[3])
        Assert.Equal(ScriptStep "./scripts/teardown.fsx", pl.Steps[4])
    | Error e -> failwith e

[<Fact>]
let ``Naplist empty steps section`` () =
    let input = """
[meta]
name = "Empty"

[steps]
"""
    match Parser.parseNapList input with
    | Ok pl -> Assert.Empty(pl.Steps)
    | Error e -> failwith e

// ─── Parse errors ─────────────────────────────────────────────

[<Fact>]
let ``Parse error on completely invalid input`` () =
    let result = Parser.parseNapFile "!@#$%^&*this is garbage"
    Assert.True(Result.isError result)

[<Fact>]
let ``Parse quoted values preserve spaces`` () =
    let input = """
[request]
method = GET
url = "https://example.com/path with spaces"
"""
    match Parser.parseNapFile input with
    | Ok nap -> Assert.Equal("https://example.com/path with spaces", nap.Request.Url)
    | Error e -> failwith e
