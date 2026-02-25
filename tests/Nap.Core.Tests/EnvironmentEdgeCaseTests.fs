module EnvironmentEdgeCaseTests

open System.IO
open Xunit
open Nap.Core

// ─── parseEnvFile edge cases ──────────────────────────────────

[<Fact>]
let ``Empty env file returns empty map`` () =
    let vars = Environment.parseEnvFile ""
    Assert.True(vars.IsEmpty)

[<Fact>]
let ``Env file with only comments returns empty map`` () =
    let vars = Environment.parseEnvFile "# just a comment\n# another one\n"
    Assert.True(vars.IsEmpty)

[<Fact>]
let ``Env file with blank lines ignored`` () =
    let vars = Environment.parseEnvFile "\n\n\nkey = value\n\n\n"
    Assert.Equal(1, vars.Count)
    Assert.Equal("value", vars["key"])

[<Fact>]
let ``Env file strips quotes from values`` () =
    let vars = Environment.parseEnvFile "url = \"https://example.com\""
    Assert.Equal("https://example.com", vars["url"])

[<Fact>]
let ``Env file handles value with equals sign`` () =
    let vars = Environment.parseEnvFile "encoded = base64=abc==="
    Assert.Equal("base64=abc===", vars["encoded"])

[<Fact>]
let ``Env file trims whitespace from keys and values`` () =
    let vars = Environment.parseEnvFile "  key  =  value  "
    Assert.Equal("value", vars["key"])

[<Fact>]
let ``Env file multiple variables`` () =
    let content = "baseUrl = \"https://api.example.com\"\ntoken = abc123\nuserId = 42"
    let vars = Environment.parseEnvFile content
    Assert.Equal(3, vars.Count)
    Assert.Equal("https://api.example.com", vars["baseUrl"])
    Assert.Equal("abc123", vars["token"])
    Assert.Equal("42", vars["userId"])

// ─── resolveVars edge cases ───────────────────────────────────

[<Fact>]
let ``Multiple variables in one string`` () =
    let vars = Map.ofList [("host", "api.com"); ("port", "8080"); ("path", "users")]
    let result = Environment.resolveVars vars "https://{{host}}:{{port}}/{{path}}"
    Assert.Equal("https://api.com:8080/users", result)

[<Fact>]
let ``No variables in string returns unchanged`` () =
    let vars = Map.ofList [("key", "value")]
    let result = Environment.resolveVars vars "no variables here"
    Assert.Equal("no variables here", result)

[<Fact>]
let ``Empty string returns empty`` () =
    let vars = Map.ofList [("key", "value")]
    let result = Environment.resolveVars vars ""
    Assert.Equal("", result)

[<Fact>]
let ``Variable with underscores`` () =
    let vars = Map.ofList [("my_var", "resolved")]
    let result = Environment.resolveVars vars "{{my_var}}"
    Assert.Equal("resolved", result)

[<Fact>]
let ``Adjacent variables`` () =
    let vars = Map.ofList [("a", "hello"); ("b", "world")]
    let result = Environment.resolveVars vars "{{a}}{{b}}"
    Assert.Equal("helloworld", result)

[<Fact>]
let ``Mixed resolved and unresolved`` () =
    let vars = Map.ofList [("known", "yes")]
    let result = Environment.resolveVars vars "{{known}} and {{unknown}}"
    Assert.Equal("yes and {{unknown}}", result)

// ─── resolveNapFile edge cases ────────────────────────────────

[<Fact>]
let ``resolveNapFile resolves URL`` () =
    let vars = Map.ofList [("baseUrl", "https://api.example.com"); ("id", "42")]
    let napFile: NapFile = {
        Meta = { Name = None; Description = None; Tags = [] }
        Vars = Map.empty
        Request = { Method = GET; Url = "{{baseUrl}}/users/{{id}}"; Headers = Map.empty; Body = None }
        Assertions = []
        Script = { Pre = None; Post = None }
    }
    let resolved = Environment.resolveNapFile vars napFile
    Assert.Equal("https://api.example.com/users/42", resolved.Request.Url)

[<Fact>]
let ``resolveNapFile resolves headers`` () =
    let vars = Map.ofList [("token", "abc123")]
    let napFile: NapFile = {
        Meta = { Name = None; Description = None; Tags = [] }
        Vars = Map.empty
        Request = {
            Method = GET
            Url = "https://example.com"
            Headers = Map.ofList [("Authorization", "Bearer {{token}}")]
            Body = None
        }
        Assertions = []
        Script = { Pre = None; Post = None }
    }
    let resolved = Environment.resolveNapFile vars napFile
    Assert.Equal("Bearer abc123", resolved.Request.Headers["Authorization"])

[<Fact>]
let ``resolveNapFile resolves body content`` () =
    let vars = Map.ofList [("userId", "42")]
    let napFile: NapFile = {
        Meta = { Name = None; Description = None; Tags = [] }
        Vars = Map.empty
        Request = {
            Method = POST
            Url = "https://example.com"
            Headers = Map.empty
            Body = Some { ContentType = "application/json"; Content = """{"userId": {{userId}}}""" }
        }
        Assertions = []
        Script = { Pre = None; Post = None }
    }
    let resolved = Environment.resolveNapFile vars napFile
    Assert.Equal("""{"userId": 42}""", resolved.Request.Body.Value.Content)

[<Fact>]
let ``resolveNapFile resolves assertion values`` () =
    let vars = Map.ofList [("expectedStatus", "201")]
    let napFile: NapFile = {
        Meta = { Name = None; Description = None; Tags = [] }
        Vars = Map.empty
        Request = { Method = GET; Url = "https://example.com"; Headers = Map.empty; Body = None }
        Assertions = [
            { Target = "status"; Op = Equals "{{expectedStatus}}" }
            { Target = "body.name"; Op = Contains "{{expectedStatus}}" }
        ]
        Script = { Pre = None; Post = None }
    }
    let resolved = Environment.resolveNapFile vars napFile
    Assert.Equal(Equals "201", resolved.Assertions[0].Op)
    Assert.Equal(Contains "201", resolved.Assertions[1].Op)

[<Fact>]
let ``resolveNapFile resolves LessThan and GreaterThan`` () =
    let vars = Map.ofList [("maxDuration", "500ms")]
    let napFile: NapFile = {
        Meta = { Name = None; Description = None; Tags = [] }
        Vars = Map.empty
        Request = { Method = GET; Url = "https://example.com"; Headers = Map.empty; Body = None }
        Assertions = [
            { Target = "duration"; Op = LessThan "{{maxDuration}}" }
        ]
        Script = { Pre = None; Post = None }
    }
    let resolved = Environment.resolveNapFile vars napFile
    Assert.Equal(LessThan "500ms", resolved.Assertions[0].Op)

[<Fact>]
let ``resolveNapFile preserves Exists op unchanged`` () =
    let vars = Map.ofList [("unused", "value")]
    let napFile: NapFile = {
        Meta = { Name = None; Description = None; Tags = [] }
        Vars = Map.empty
        Request = { Method = GET; Url = "https://example.com"; Headers = Map.empty; Body = None }
        Assertions = [{ Target = "body.id"; Op = Exists }]
        Script = { Pre = None; Post = None }
    }
    let resolved = Environment.resolveNapFile vars napFile
    Assert.Equal(Exists, resolved.Assertions[0].Op)

// ─── loadEnvironment priority ─────────────────────────────────

[<Fact>]
let ``loadEnvironment file vars are lowest priority`` () =
    let dir = Path.GetTempPath()
    let fileVars = Map.ofList [("key", "from-file"); ("unique", "file-only")]
    let result = Environment.loadEnvironment dir None Map.empty fileVars
    Assert.Equal("from-file", result["key"])
    Assert.Equal("file-only", result["unique"])

[<Fact>]
let ``loadEnvironment CLI vars override everything`` () =
    let dir = Path.Combine(Path.GetTempPath(), "nap-env-test-" + System.Guid.NewGuid().ToString("N"))
    Directory.CreateDirectory(dir) |> ignore
    try
        File.WriteAllText(Path.Combine(dir, ".napenv"), "key = base-value")
        File.WriteAllText(Path.Combine(dir, ".napenv.local"), "key = local-value")
        let cliVars = Map.ofList [("key", "cli-wins")]
        let fileVars = Map.ofList [("key", "file-value")]
        let result = Environment.loadEnvironment dir None cliVars fileVars
        Assert.Equal("cli-wins", result["key"])
    finally
        Directory.Delete(dir, true)

[<Fact>]
let ``loadEnvironment named env overrides base`` () =
    let dir = Path.Combine(Path.GetTempPath(), "nap-env-test-" + System.Guid.NewGuid().ToString("N"))
    Directory.CreateDirectory(dir) |> ignore
    try
        File.WriteAllText(Path.Combine(dir, ".napenv"), "key = base-value")
        File.WriteAllText(Path.Combine(dir, ".napenv.staging"), "key = staging-value")
        let result = Environment.loadEnvironment dir (Some "staging") Map.empty Map.empty
        Assert.Equal("staging-value", result["key"])
    finally
        Directory.Delete(dir, true)

[<Fact>]
let ``loadEnvironment local overrides named env`` () =
    let dir = Path.Combine(Path.GetTempPath(), "nap-env-test-" + System.Guid.NewGuid().ToString("N"))
    Directory.CreateDirectory(dir) |> ignore
    try
        File.WriteAllText(Path.Combine(dir, ".napenv"), "key = base")
        File.WriteAllText(Path.Combine(dir, ".napenv.staging"), "key = staging")
        File.WriteAllText(Path.Combine(dir, ".napenv.local"), "key = local")
        let result = Environment.loadEnvironment dir (Some "staging") Map.empty Map.empty
        Assert.Equal("local", result["key"])
    finally
        Directory.Delete(dir, true)

[<Fact>]
let ``loadEnvironment merges distinct keys from all sources`` () =
    let dir = Path.Combine(Path.GetTempPath(), "nap-env-test-" + System.Guid.NewGuid().ToString("N"))
    Directory.CreateDirectory(dir) |> ignore
    try
        File.WriteAllText(Path.Combine(dir, ".napenv"), "base_key = from-base")
        File.WriteAllText(Path.Combine(dir, ".napenv.staging"), "staging_key = from-staging")
        File.WriteAllText(Path.Combine(dir, ".napenv.local"), "local_key = from-local")
        let fileVars = Map.ofList [("file_key", "from-file")]
        let cliVars = Map.ofList [("cli_key", "from-cli")]
        let result = Environment.loadEnvironment dir (Some "staging") cliVars fileVars
        Assert.Equal("from-base", result["base_key"])
        Assert.Equal("from-staging", result["staging_key"])
        Assert.Equal("from-local", result["local_key"])
        Assert.Equal("from-file", result["file_key"])
        Assert.Equal("from-cli", result["cli_key"])
    finally
        Directory.Delete(dir, true)

[<Fact>]
let ``loadEnvironment with no env files returns fileVars merged with cliVars`` () =
    let dir = Path.Combine(Path.GetTempPath(), "nap-env-empty-" + System.Guid.NewGuid().ToString("N"))
    Directory.CreateDirectory(dir) |> ignore
    try
        let fileVars = Map.ofList [("a", "1")]
        let cliVars = Map.ofList [("b", "2")]
        let result = Environment.loadEnvironment dir None cliVars fileVars
        Assert.Equal("1", result["a"])
        Assert.Equal("2", result["b"])
    finally
        Directory.Delete(dir, true)
