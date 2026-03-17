module DotHttp.Tests.RealWorldTests

open System
open System.IO
open System.Net.Http
open Xunit
open DotHttp
open DotHttp.Parser

// ─── Infrastructure ───────────────────────────────────────────

let private cacheDir =
    Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".http-cache")

let private httpClient = new HttpClient()

let private loadCached (filename: string) (url: string) : string =
    let path = Path.Combine(cacheDir, filename)

    if not (Directory.Exists cacheDir) then
        Directory.CreateDirectory cacheDir |> ignore

    if not (File.Exists path) then
        let content = httpClient.GetStringAsync(url).Result
        File.WriteAllText(path, content)

    File.ReadAllText path

let private unwrap (input: string) : HttpFile =
    match parse input with
    | Ok f -> f
    | Error e -> failwith $"Parse failed: {e}"

let private reqAt (f: HttpFile) (i: int) : HttpRequest = f.Requests[i]

let private assertHeader (req: HttpRequest) (key: string) (valuePart: string) =
    let found = req.Headers |> List.tryFind (fun (k, _) -> k = key)
    Assert.True(found.IsSome, $"Header '{key}' not found in request {req.Method} {req.Url}")
    Assert.Contains(valuePart, snd found.Value)

let private assertHeaderExact (req: HttpRequest) (key: string) (value: string) =
    let found = req.Headers |> List.tryFind (fun (k, _) -> k = key)
    Assert.True(found.IsSome, $"Header '{key}' not found")
    Assert.Equal(value, snd found.Value)

// ─── Source URLs ──────────────────────────────────────────────

[<Literal>]
let private ReggierayUrl =
    "https://raw.githubusercontent.com/reggieray/http-file-examples/main/http-file-examples.http"

[<Literal>]
let private DeepnsUrl =
    "https://gist.githubusercontent.com/deepns/38c24829361f23c90b3fe74a9af00d13/raw/vscode-rest-client-samples.http"

[<Literal>]
let private WaldyriousUrl =
    "https://gist.githubusercontent.com/waldyrious/fc4ce598447312970236bc645d4a14bf/raw/example.http"

[<Literal>]
let private IjhttpEchoUrl =
    "https://raw.githubusercontent.com/vitalijr2/ijhttp-demo/main/echo.http"

[<Literal>]
let private BcnRustUrl =
    "https://raw.githubusercontent.com/BcnRust/devbcn-workshop/refs/heads/main/api.http"

[<Literal>]
let private ClockifyUrl =
    "https://raw.githubusercontent.com/balexandre/ba-clockify/e97d3816ff5b18a30dc35e77e62beab0f4dbb159/_.http"

[<Literal>]
let private DanvegaUrl =
    "https://raw.githubusercontent.com/danvega/quick-bytes/4c482241d63da7aabf91861eb146fad4abdfb71e/qb.http"

[<Literal>]
let private FlipChandlerUrl =
    "https://raw.githubusercontent.com/flipChandler/project-management-api/f14df9aa93a02be93fdfcad3b29bbd3a0199acca/ap.http"

[<Literal>]
let private JmfayardUrl =
    "https://raw.githubusercontent.com/jmfayard/playground-spring/refs/heads/main/API.http"

[<Literal>]
let private SquareCoreUrl =
    "https://raw.githubusercontent.com/UKP-SQuARE/square-core/refs/heads/master/api.http"

[<Literal>]
let private PanasonicUrl =
    "https://raw.githubusercontent.com/lostfields/python-panasonic-comfort-cloud/edcb2ff11e1c62bde2a47bf1841ffe4e6024723d/requests.http"

// ═══════════════════════════════════════════════════════════════
// 1. reggieray — .NET Todo CRUD with MS variables, $guid, $dotenv
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: reggieray Todo CRUD API`` () =
    let content = loadCached "reggieray-todos.http" ReggierayUrl
    let f = unwrap content
    Assert.Equal(Microsoft, f.Dialect)
    Assert.Equal(5, f.Requests.Length)
    // File variables: base_address, todo_id
    Assert.True(f.FileVariables.Length >= 2)
    Assert.Equal("base_address", fst f.FileVariables[0])
    Assert.Equal("http://localhost:5295", snd f.FileVariables[0])
    let todoIdVar = f.FileVariables |> List.find (fun (k, _) -> k = "todo_id")
    Assert.Equal("{{$guid}}", snd todoIdVar)

    // Request 0: GET all todos
    let r0 = reqAt f 0
    Assert.Equal("GET", r0.Method)
    Assert.Contains("{{base_address}}", r0.Url)
    Assert.Contains("/todos/", r0.Url)
    Assert.Equal(1, r0.Headers.Length)
    assertHeaderExact r0 "Accept" "application/json"
    Assert.True(r0.Body.IsNone)

    // Request 1: GET single todo with guid
    let r1 = reqAt f 1
    Assert.Equal("GET", r1.Method)
    Assert.Contains("{{$guid}}", r1.Url)
    Assert.Equal(2, r1.Headers.Length)
    assertHeader r1 "Authorization" "{{$dotenv Authorization}}"
    assertHeaderExact r1 "Accept" "application/json"
    Assert.True(r1.Body.IsNone)

    // Request 2: POST create todo
    let r2 = reqAt f 2
    Assert.Equal("POST", r2.Method)
    Assert.Contains("/todos/", r2.Url)
    Assert.Equal(2, r2.Headers.Length)
    assertHeader r2 "Authorization" "{{$dotenv Authorization}}"
    assertHeaderExact r2 "Content-Type" "application/json"
    Assert.True(r2.Body.IsSome)
    Assert.Contains("\"id\": \"{{$guid}}\"", r2.Body.Value)
    Assert.Contains("\"title\":", r2.Body.Value)
    Assert.Contains("{{$timestamp}}", r2.Body.Value)
    Assert.Contains("\"isComplete\": false", r2.Body.Value)

    // Request 3: PUT update todo
    let r3 = reqAt f 3
    Assert.Equal("PUT", r3.Method)
    Assert.Contains("{{todo_id}}", r3.Url)
    Assert.Equal(2, r3.Headers.Length)
    assertHeader r3 "Authorization" "{{$dotenv Authorization}}"
    assertHeaderExact r3 "Content-Type" "application/json"
    Assert.True(r3.Body.IsSome)
    Assert.Contains("\"id\": \"{{todo_id}}\"", r3.Body.Value)
    Assert.Contains("{{$timestamp}}", r3.Body.Value)

    // Request 4: DELETE todo
    let r4 = reqAt f 4
    Assert.Equal("DELETE", r4.Method)
    Assert.Contains("{{$guid}}", r4.Url)
    Assert.Equal(2, r4.Headers.Length)
    assertHeader r4 "Authorization" "{{$dotenv Authorization}}"
    assertHeaderExact r4 "Accept" "application/json"
    Assert.True(r4.Body.IsNone)

// ═══════════════════════════════════════════════════════════════
// 2. deepns — VS Code REST Client with @name, response refs
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: deepns StackExchange REST Client`` () =
    let content = loadCached "deepns-restclient.http" DeepnsUrl
    let f = unwrap content
    Assert.Equal(Microsoft, f.Dialect)
    Assert.True(f.Requests.Length >= 6)

    // File variable
    let testServer = f.FileVariables |> List.find (fun (k, _) -> k = "test_server")
    Assert.Equal("dummy.restapiexample.com", snd testServer)

    // Request 0: GET sites
    let r0 = reqAt f 0
    Assert.Equal("GET", r0.Method)
    Assert.Equal("https://api.stackexchange.com/2.2/sites", r0.Url)
    Assert.Equal(Some "A simple GET Request", r0.Name)
    Assert.True(r0.Body.IsNone)
    Assert.True(r0.Headers.IsEmpty)

    // Request 1: GET tags with query param
    let r1 = reqAt f 1
    Assert.Equal("GET", r1.Method)
    Assert.Contains("tags?site=stackoverflow", r1.Url)
    Assert.Equal(Some "Get list of tags by site", r1.Name)

    // Request 2: GET tag info
    let r2 = reqAt f 2
    Assert.Equal("GET", r2.Method)
    Assert.Contains("vscode-extensions", r2.Url)
    Assert.Equal(Some "Get details of a particular tag", r2.Name)

    // Request 3: Named request @name tagsearch
    let r3 = reqAt f 3
    Assert.Equal("GET", r3.Method)
    Assert.Equal(Some "tagsearch", r3.Name)
    Assert.Contains("tags?site=askubuntu", r3.Url)

    // Request 4: Response variable reference
    let r4 = reqAt f 4
    Assert.Equal("GET", r4.Method)
    Assert.Contains("{{tagsearch.response.body.$.items[0].name}}", r4.Url)
    Assert.Contains("?site=askubuntu", r4.Url)
    Assert.Equal(Some "Access values from a request or response in another request", r4.Name)

    // Request 5: POST with auth and body
    let r5 = reqAt f 5
    Assert.Equal("POST", r5.Method)
    Assert.Equal("https://example.com/posts", r5.Url)
    Assert.Equal(1, r5.Headers.Length)
    assertHeader r5 "Authorization" "Basic username:password"
    Assert.True(r5.Body.IsSome)
    Assert.Contains("\"id\": 1", r5.Body.Value)
    Assert.Contains("My awesome post", r5.Body.Value)
    Assert.Contains("1504932105", r5.Body.Value)

    // Request 6: POST with file-level variable in URL
    let r6 = reqAt f 6
    Assert.Equal("POST", r6.Method)
    Assert.Contains("{{test_server}}", r6.Url)
    Assert.Contains("/api/v1/create", r6.Url)
    assertHeaderExact r6 "Content-Type" "application/json"
    Assert.True(r6.Body.IsSome)
    Assert.Contains("\"name\":\"Joe\"", r6.Body.Value)
    Assert.Contains("\"salary\":\"123456789\"", r6.Body.Value)

// ═══════════════════════════════════════════════════════════════
// 3. waldyrious — JSON, query params, form-urlencoded
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: waldyrious mixed content types`` () =
    let content = loadCached "waldyrious-example.http" WaldyriousUrl
    let f = unwrap content
    Assert.Equal(Common, f.Dialect)
    Assert.Equal(3, f.Requests.Length)

    // Request 0: JSON POST
    let r0 = reqAt f 0
    Assert.Equal("POST", r0.Method)
    Assert.Equal("https://api.example.com/address", r0.Url)
    Assert.Equal(1, r0.Headers.Length)
    assertHeaderExact r0 "Content-Type" "application/json"
    Assert.True(r0.Body.IsSome)
    Assert.Contains("\"foo\": \"bar\"", r0.Body.Value)
    Assert.Contains("\"baz\": \"qux\"", r0.Body.Value)

    // Request 1: GET with multiline query params
    // The continuation lines (?page=2, &pageSize=10) are parsed as body, not URL
    let r1 = reqAt f 1
    Assert.Equal("GET", r1.Method)
    Assert.Contains("example.com/comments", r1.Url)
    Assert.True(r1.Body.IsSome)
    Assert.Contains("page=2", r1.Body.Value)
    Assert.Contains("pageSize=10", r1.Body.Value)

    // Request 2: Form-urlencoded POST
    let r2 = reqAt f 2
    Assert.Equal("POST", r2.Method)
    Assert.Equal("https://api.example.com/login", r2.Url)
    Assert.Equal(1, r2.Headers.Length)
    assertHeaderExact r2 "Content-Type" "application/x-www-form-urlencoded"
    Assert.True(r2.Body.IsSome)
    Assert.Contains("name=foo", r2.Body.Value)
    Assert.Contains("password=bar", r2.Body.Value)

// ═══════════════════════════════════════════════════════════════
// 4. ijhttp-demo — JetBrains echo with HTTP/1.1 and 7 headers
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: JetBrains ijhttp echo test`` () =
    let content = loadCached "ijhttp-echo.http" IjhttpEchoUrl
    let f = unwrap content
    Assert.Equal(1, f.Requests.Length)
    Assert.Equal(Common, f.Dialect)

    let r0 = reqAt f 0
    Assert.Equal("GET", r0.Method)
    Assert.Contains("/echo", r0.Url)
    Assert.Equal(Some "1.1", r0.HttpVersion)
    Assert.Equal(Some "Echo test", r0.Name)
    Assert.True(r0.Body.IsNone)

    // Exactly 8 headers with interpolated variables
    Assert.Equal(8, r0.Headers.Length)
    assertHeaderExact r0 "Accept" "application/json"
    assertHeaderExact r0 "Public-Variable" "{{public-variable}}"
    assertHeaderExact r0 "Another-Variable" "{{another-variable}}"
    assertHeaderExact r0 "Third-Variable" "{{third-variable}}"
    assertHeaderExact r0 "Hidden-Variable" "{{hidden-variable}}"
    assertHeaderExact r0 "Hidden-Variable2" "{{hidden-variable2}}"
    assertHeader r0 "Host" "localhost:{{localport}}"
    // Last-Variable should also be present
    assertHeaderExact r0 "Last-Variable" "{{last-variable}}"

// ═══════════════════════════════════════════════════════════════
// 5. BcnRust — Rust film CRUD, MS vars, HTTP/1.1 everywhere
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: BcnRust workshop film API`` () =
    let content = loadCached "bcnrust-workshop.http" BcnRustUrl
    let f = unwrap content
    Assert.Equal(Microsoft, f.Dialect)
    Assert.Equal(7, f.Requests.Length)
    Assert.Equal(2, f.FileVariables.Length)
    Assert.Equal("host", fst f.FileVariables[0])
    Assert.Equal("http://localhost:8080", snd f.FileVariables[0])
    Assert.Equal("film_id", fst f.FileVariables[1])
    Assert.Equal("6f05e5f2-133c-11ee-be9f-0ab7e0d8c876", snd f.FileVariables[1])

    // Request 0: health check
    let r0 = reqAt f 0
    Assert.Equal("GET", r0.Method)
    Assert.Contains("{{host}}", r0.Url)
    Assert.Contains("/api/health", r0.Url)
    Assert.Equal(Some "1.1", r0.HttpVersion)
    Assert.Equal(Some "health", r0.Name)
    Assert.True(r0.Body.IsNone)

    // Request 1: POST create film
    let r1 = reqAt f 1
    Assert.Equal("POST", r1.Method)
    Assert.Contains("/api/v1/films", r1.Url)
    Assert.Equal(Some "1.1", r1.HttpVersion)
    Assert.Equal(Some "create film", r1.Name)
    Assert.Equal(1, r1.Headers.Length)
    assertHeaderExact r1 "Content-Type" "application/json"
    Assert.True(r1.Body.IsSome)
    Assert.Contains("Death in Venice", r1.Body.Value)
    Assert.Contains("Luchino Visconti", r1.Body.Value)
    Assert.Contains("1971", r1.Body.Value)
    Assert.Contains("poster", r1.Body.Value)

    // Request 2: PUT update film
    let r2 = reqAt f 2
    Assert.Equal("PUT", r2.Method)
    Assert.Contains("/api/v1/films", r2.Url)
    Assert.Equal(Some "update film", r2.Name)
    Assert.True(r2.Body.IsSome)
    Assert.Contains("{{film_id}}", r2.Body.Value)
    Assert.Contains("Benjamin Britten", r2.Body.Value)
    Assert.Contains("1981", r2.Body.Value)

    // Request 3: GET all films
    let r3 = reqAt f 3
    Assert.Equal("GET", r3.Method)
    Assert.Equal(Some "get all films", r3.Name)
    Assert.True(r3.Body.IsNone)

    // Request 4: GET single film with variable
    let r4 = reqAt f 4
    Assert.Equal("GET", r4.Method)
    Assert.Contains("{{film_id}}", r4.Url)
    Assert.Equal(Some "get film", r4.Name)

    // Request 5: GET bad film (truncated UUID)
    let r5 = reqAt f 5
    Assert.Equal("GET", r5.Method)
    Assert.Contains("356e42a8-e659-406f-98", r5.Url)
    Assert.Equal(Some "get bad film", r5.Name)

    // Request 6: DELETE film
    let r6 = reqAt f 6
    Assert.Equal("DELETE", r6.Method)
    Assert.Contains("{{film_id}}", r6.Url)
    Assert.Equal(Some "delete film", r6.Name)
    Assert.True(r6.Body.IsNone)

    // All requests should have HTTP/1.1
    for req in f.Requests do
        Assert.Equal(Some "1.1", req.HttpVersion)

// ═══════════════════════════════════════════════════════════════
// 6. Clockify — 7 dense GET requests with API key auth
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: Clockify API requests`` () =
    let content = loadCached "clockify.http" ClockifyUrl
    let f = unwrap content
    Assert.Equal(Microsoft, f.Dialect)
    Assert.Equal(7, f.Requests.Length)
    Assert.Equal(4, f.FileVariables.Length)
    Assert.Equal("HOST", fst f.FileVariables[0])
    Assert.Equal("https://api.clockify.me/api/v1", snd f.FileVariables[0])
    Assert.Equal("USER", fst f.FileVariables[1])
    Assert.Equal("?", snd f.FileVariables[1])
    Assert.Equal("WORKSPACE", fst f.FileVariables[2])
    Assert.Equal("APIKEY", fst f.FileVariables[3])

    // Every request: GET, has X-Api-Key and content-type, uses {{HOST}}
    for req in f.Requests do
        Assert.Equal("GET", req.Method)
        Assert.Contains("{{HOST}}", req.Url)
        Assert.Equal(2, req.Headers.Length)
        assertHeaderExact req "X-Api-Key" "{{APIKEY}}"
        assertHeaderExact req "content-type" "application/json"

    // Most requests have no body, except request 4 whose continuation
    // line (?project=...&start=...) is parsed as body
    for i in 0 .. f.Requests.Length - 1 do
        if i <> 4 then
            Assert.True((reqAt f i).Body.IsNone)

    // Request 0: /user
    Assert.Contains("/user", (reqAt f 0).Url)
    Assert.False((reqAt f 0).Url.Contains("time-entries"))

    // Request 1: /workspaces (just the list)
    Assert.Contains("/workspaces", (reqAt f 1).Url)
    Assert.False((reqAt f 1).Url.Contains("{{WORKSPACE}}"))

    // Request 2: /workspaces/{id}/clients
    Assert.Contains("{{WORKSPACE}}/clients", (reqAt f 2).Url)

    // Request 3: /workspaces/{id}/projects
    Assert.Contains("{{WORKSPACE}}/projects", (reqAt f 3).Url)

    // Request 4: time-entries with query params on continuation line (parsed as body)
    let r4 = reqAt f 4
    Assert.Contains("{{USER}}/time-entries", r4.Url)
    Assert.Contains("{{WORKSPACE}}", r4.Url)
    Assert.True(r4.Body.IsSome)
    Assert.Contains("project=", r4.Body.Value)

// ═══════════════════════════════════════════════════════════════
// 7. danvega — Spring Framework 7 resilience demo
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: danvega Spring resilience demo`` () =
    let content = loadCached "danvega-quickbytes.http" DanvegaUrl
    let f = unwrap content
    Assert.Equal(Common, f.Dialect)
    Assert.Equal(5, f.Requests.Length)
    Assert.True(f.FileVariables.IsEmpty)

    // All requests target localhost:8080
    for req in f.Requests do
        Assert.Contains("localhost:8080", req.Url)

    // Request 0: GET all restaurants
    let r0 = reqAt f 0
    Assert.Equal("GET", r0.Method)
    Assert.Contains("/api/restaurants/", r0.Url)
    Assert.Equal(Some "Get All Restaurants", r0.Name)
    Assert.True(r0.Headers.IsEmpty)
    Assert.True(r0.Body.IsNone)

    // Request 1: GET restaurant menu (@Retryable demo)
    let r1 = reqAt f 1
    Assert.Equal("GET", r1.Method)
    Assert.Contains("rest-001/menu", r1.Url)
    Assert.Equal(1, r1.Headers.Length)
    assertHeaderExact r1 "Accept" "application/json"
    Assert.True(r1.Body.IsNone)
    Assert.True(r1.Comments.Length > 0)
    Assert.True(r1.Comments |> List.exists (fun c -> c.Contains("retry") || c.Contains("Retry")))

    // Request 2: POST assign driver (RetryTemplate demo)
    let r2 = reqAt f 2
    Assert.Equal("POST", r2.Method)
    Assert.Contains("/api/drivers/assign", r2.Url)
    Assert.Contains("orderId=order-001", r2.Url)
    Assert.Equal(1, r2.Headers.Length)
    assertHeaderExact r2 "Accept" "application/json"
    Assert.True(r2.Body.IsNone)

    // Request 3: GET lunch-rush (ConcurrencyLimit demo - platform threads)
    let r3 = reqAt f 3
    Assert.Equal("GET", r3.Method)
    Assert.Contains("lunch-rush", r3.Url)
    Assert.False(r3.Url.Contains("virtual"))
    Assert.Equal(1, r3.Headers.Length)

    // Request 4: GET lunch-rush-virtual (ConcurrencyLimit demo - virtual threads)
    let r4 = reqAt f 4
    Assert.Equal("GET", r4.Method)
    Assert.Contains("lunch-rush-virtual", r4.Url)
    Assert.Equal(1, r4.Headers.Length)

// ═══════════════════════════════════════════════════════════════
// 8. flipChandler — Portuguese project management API
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: flipChandler project management API`` () =
    let content = loadCached "flipchandler.http" FlipChandlerUrl
    let f = unwrap content
    Assert.Equal(Common, f.Dialect)
    Assert.Equal(8, f.Requests.Length)

    // Request 0: GET all resources
    let r0 = reqAt f 0
    Assert.Equal("GET", r0.Method)
    Assert.Contains("/recursos", r0.Url)
    Assert.True(r0.Headers.IsEmpty)

    // Requests 1-4: Four POSTs creating different employees
    let r1 = reqAt f 1
    Assert.Equal("POST", r1.Method)
    Assert.Contains("/recursos", r1.Url)
    assertHeaderExact r1 "Content-Type" "application/json"
    Assert.True(r1.Body.IsSome)
    Assert.Contains("Roger Guedes", r1.Body.Value)
    Assert.Contains("72152492048", r1.Body.Value)
    Assert.Contains("Product Owner", r1.Body.Value)
    Assert.Contains("2021-12-20", r1.Body.Value)

    let r2 = reqAt f 2
    Assert.Equal("POST", r2.Method)
    Assert.True(r2.Body.IsSome)
    Assert.Contains("Eva Mendes", r2.Body.Value)
    Assert.Contains("Scrum Master", r2.Body.Value)

    let r3 = reqAt f 3
    Assert.Equal("POST", r3.Method)
    Assert.True(r3.Body.IsSome)
    Assert.Contains("Immanuel Kant", r3.Body.Value)
    Assert.Contains("Backend Developer", r3.Body.Value)

    let r4 = reqAt f 4
    Assert.Equal("POST", r4.Method)
    Assert.True(r4.Body.IsSome)
    Assert.Contains("Priscila Fantin", r4.Body.Value)
    Assert.Contains("Analista de Requisitos", r4.Body.Value)

    // Request 5: GET by UUID (findByPk)
    let r5 = reqAt f 5
    Assert.Equal("GET", r5.Method)
    Assert.Contains("149b32d4-302a-463f-ab97-045641df38bf", r5.Url)

    // Request 6: PATCH update name
    let r6 = reqAt f 6
    Assert.Equal("PATCH", r6.Method)
    Assert.Contains("149b32d4-302a-463f-ab97-045641df38bf", r6.Url)
    assertHeaderExact r6 "Content-Type" "application/json"
    Assert.True(r6.Body.IsSome)
    Assert.Contains("Boneco Sifuroso", r6.Body.Value)

    // Request 7: DELETE
    let r7 = reqAt f 7
    Assert.Equal("DELETE", r7.Method)
    Assert.Contains("recursos", r7.Url)
    Assert.True(r7.Body.IsNone)

// ═══════════════════════════════════════════════════════════════
// 9. jmfayard — Spring Boot policy CRUD with ---- separators
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: jmfayard Spring Boot policies`` () =
    let content = loadCached "jmfayard-spring.http" JmfayardUrl
    let f = unwrap content
    Assert.Equal(Common, f.Dialect)
    Assert.Equal(8, f.Requests.Length)

    // Request 0: Health check — the "----" separator is parsed as body
    let r0 = reqAt f 0
    Assert.Equal("GET", r0.Method)
    Assert.Equal("http://localhost:8080/api/1/health", r0.Url)
    Assert.Equal(Some "Check whether server is up and running", r0.Name)
    Assert.True(r0.Body.IsSome)
    Assert.Contains("----", r0.Body.Value)
    Assert.True(r0.Headers.IsEmpty)

    // Request 1: Spring actuator — also has "----" parsed as body
    let r1 = reqAt f 1
    Assert.Equal("GET", r1.Method)
    Assert.Contains("/actuator", r1.Url)
    Assert.Equal(Some "Spring actuator", r1.Name)
    Assert.True(r1.Body.IsSome)
    Assert.Contains("----", r1.Body.Value)

    // Request 2: GET policies
    let r2 = reqAt f 2
    Assert.Equal("GET", r2.Method)
    Assert.Equal("http://localhost:8080/policies", r2.Url)
    Assert.Equal(Some "Get policies", r2.Name)

    // Request 3: POST create policy
    let r3 = reqAt f 3
    Assert.Equal("POST", r3.Method)
    Assert.Equal("http://localhost:8080/policies", r3.Url)
    Assert.Equal(Some "Create policies", r3.Name)
    Assert.Equal(2, r3.Headers.Length)
    assertHeaderExact r3 "Content-Type" "application/json"
    assertHeaderExact r3 "Accept" "application/json"
    Assert.True(r3.Body.IsSome)
    Assert.Contains("What is this", r3.Body.Value)
    Assert.Contains("INACTIVE", r3.Body.Value)
    Assert.Contains("2026-01-01", r3.Body.Value)
    Assert.Contains("2026-12-01", r3.Body.Value)

    // Request 4: GET specific policy
    let r4 = reqAt f 4
    Assert.Equal("GET", r4.Method)
    Assert.Contains("policies/1", r4.Url)
    Assert.Equal(Some "GET a particular policy", r4.Name)

    // Request 5: PUT update policy
    let r5 = reqAt f 5
    Assert.Equal("PUT", r5.Method)
    Assert.Contains("policies/1", r5.Url)
    Assert.Equal(Some "Update policy", r5.Name)
    Assert.Equal(2, r5.Headers.Length)
    assertHeaderExact r5 "Content-Type" "application/json"
    Assert.True(r5.Body.IsSome)
    Assert.Contains("\"id\": 1", r5.Body.Value)
    Assert.Contains("obsolete", r5.Body.Value)
    Assert.Contains("createdAt", r5.Body.Value)
    Assert.Contains("updatedAt", r5.Body.Value)

    // Request 6: DELETE policy
    let r6 = reqAt f 6
    Assert.Equal("DELETE", r6.Method)
    Assert.Contains("policies/1", r6.Url)
    Assert.Equal(Some "Delete policy", r6.Name)
    Assert.True(r6.Body.IsNone)

    // Request 7: Extra GET user by name at end of file
    let r7 = reqAt f 7
    Assert.Equal("GET", r7.Method)
    Assert.Contains("policies/1", r7.Url)
    Assert.Equal(Some "GET user by name", r7.Name)
    Assert.Equal(2, r7.Headers.Length)
    assertHeaderExact r7 "Content-Type" "application/json"
    assertHeaderExact r7 "Accept" "application/json"

// ═══════════════════════════════════════════════════════════════
// 10. UKP-SQuARE — ML platform with OAuth, @name, response refs
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: UKP-SQuARE ML platform API`` () =
    let content = loadCached "square-core.http" SquareCoreUrl
    let f = unwrap content
    Assert.Equal(Microsoft, f.Dialect)
    Assert.Equal(7, f.Requests.Length)

    // File variables
    Assert.Equal("hostname", fst f.FileVariables[0])
    Assert.Equal("test.square.ukp-lab.de", snd f.FileVariables[0])
    // Multiple inline @token variables referencing response body
    let tokenVars = f.FileVariables |> List.filter (fun (k, _) -> k = "token")
    Assert.True(tokenVars.Length >= 4)

    for (_, v) in tokenVars do
        Assert.Contains("get_token.response.body.access_token", v)

    // Request 0: OAuth token exchange
    let r0 = reqAt f 0
    Assert.Equal("POST", r0.Method)
    Assert.Equal(Some "get_token", r0.Name)
    Assert.Contains("{{hostname}}", r0.Url)
    Assert.Contains("openid-connect/token", r0.Url)
    Assert.Equal(Some "1.1", r0.HttpVersion)
    Assert.Equal(2, r0.Headers.Length)
    assertHeader r0 "Host" "{{hostname}}"
    assertHeader r0 "content-type" "x-www-form-urlencoded"
    Assert.True(r0.Body.IsSome)
    Assert.Contains("client_id=square-api", r0.Body.Value)
    Assert.Contains("grant_type=password", r0.Body.Value)
    Assert.Contains("username={{username}}", r0.Body.Value)
    Assert.Contains("password={{password}}", r0.Body.Value)

    // Request 1: GET deployed models
    let r1 = reqAt f 1
    Assert.Equal("GET", r1.Method)
    Assert.Equal(Some "get_deployed_models", r1.Name)
    Assert.Contains("deployed-models", r1.Url)
    Assert.Equal(Some "1.1", r1.HttpVersion)
    assertHeader r1 "Authorization" "Bearer {{token}}"
    assertHeader r1 "Host" "{{hostname}}"

    // Request 2: DELETE remove model
    let r2 = reqAt f 2
    Assert.Equal("DELETE", r2.Method)
    Assert.Equal(Some "remove_model", r2.Name)
    Assert.Contains("{{model_name}}", r2.Url)
    Assert.Equal(Some "1.1", r2.HttpVersion)
    assertHeader r2 "Authorization" "Bearer {{token}}"

    // Request 3: POST deploy all models
    let r3 = reqAt f 3
    Assert.Equal("POST", r3.Method)
    Assert.Equal(Some "deploy_all_models", r3.Name)
    Assert.Contains("/db/deploy", r3.Url)

    // Request 4: GET datastores
    let r4 = reqAt f 4
    Assert.Equal("GET", r4.Method)
    Assert.Equal(Some "get_datastores", r4.Name)
    Assert.Contains("/datastores", r4.Url)

    // Request 5: GET datastore indices
    let r5 = reqAt f 5
    Assert.Equal("GET", r5.Method)
    Assert.Equal(Some "get_datastores_indices", r5.Name)
    Assert.Contains("/datastores/nq/indices", r5.Url)

    // Request 6: POST deploy specific model
    let r6 = reqAt f 6
    Assert.Equal("POST", r6.Method)
    Assert.Equal(Some "deploy_model", r6.Name)
    Assert.Contains("{{model_identifier}}", r6.Url)
    Assert.Equal(Some "1.1", r6.HttpVersion)

    // Every request (except first) should have Bearer auth
    for i in 1 .. f.Requests.Length - 1 do
        assertHeader (reqAt f i) "Authorization" "Bearer {{token}}"

// ═══════════════════════════════════════════════════════════════
// 11. Panasonic Comfort Cloud — 223-line IoT API
// ═══════════════════════════════════════════════════════════════

[<Fact>]
let ``real-world download: Panasonic Comfort Cloud IoT API`` () =
    let content = loadCached "panasonic-cloud.http" PanasonicUrl
    let f = unwrap content
    Assert.Equal(Microsoft, f.Dialect)
    Assert.True(f.Requests.Length >= 10)
    Assert.Equal("APP-VERSION", fst f.FileVariables[0])
    Assert.Equal("1.20.1", snd f.FileVariables[0])

    // Request 0: Login
    let login = f.Requests |> List.find (fun r -> r.Name = Some "login")
    Assert.Equal("POST", login.Method)
    Assert.Equal("https://accsmart.panasonic.com/auth/login", login.Url)
    Assert.Equal(Some "1.1", login.HttpVersion)
    Assert.True(login.Headers.Length >= 7)
    assertHeaderExact login "X-APP-TYPE" "1"
    assertHeader login "X-APP-VERSION" "{{APP-VERSION}}"
    assertHeaderExact login "User-Agent" "G-RAC"
    assertHeaderExact login "X-APP-TIMESTAMP" "1"
    assertHeaderExact login "X-APP-NAME" "Comfort Cloud"
    assertHeaderExact login "X-CFC-API-KEY" "Comfort Cloud"
    assertHeader login "Accept" "application/json"
    assertHeader login "Content-Type" "application/json"
    Assert.True(login.Body.IsSome)
    Assert.Contains("\"language\": 0", login.Body.Value)
    Assert.Contains("\"loginId\": \"{{$dotenv USERNAME}}\"", login.Body.Value)
    Assert.Contains("\"password\": \"{{$dotenv PASSWORD}}\"", login.Body.Value)

    // Request 1: Device group (named "device")
    let device = f.Requests |> List.find (fun r -> r.Name = Some "device")
    Assert.Equal("GET", device.Method)
    Assert.Contains("device/group", device.Url)
    Assert.Equal(Some "1.1", device.HttpVersion)
    assertHeader device "X-User-Authorization" "{{login.response.body.$.uToken}}"
    assertHeaderExact device "X-APP-TYPE" "1"
    assertHeaderExact device "User-Agent" "G-RAC"
    Assert.True(device.Body.IsNone)

    // Requests referencing device GUID via response variable in URL
    // Only 2 requests have device.response.body in the URL (deviceStatus/now and deviceStatus)
    let deviceGuidRequests =
        f.Requests |> List.filter (fun r -> r.Url.Contains("device.response.body"))

    Assert.True(deviceGuidRequests.Length >= 2)

    for req in deviceGuidRequests do
        Assert.Contains("deviceGuid", req.Url)
        assertHeader req "X-User-Authorization" "login.response.body"

    // Device control POSTs with nested JSON
    let controls =
        f.Requests
        |> List.filter (fun r -> r.Method = "POST" && r.Url.Contains("control"))

    Assert.True(controls.Length >= 2)

    // First control: full parameter set
    let fullControl =
        controls
        |> List.find (fun r -> r.Body.IsSome && r.Body.Value.Contains("operationMode"))

    Assert.Contains("\"operate\": 1", fullControl.Body.Value)
    Assert.Contains("\"operationMode\": 3", fullControl.Body.Value)
    Assert.Contains("\"temperatureSet\": 22.5", fullControl.Body.Value)
    Assert.Contains("\"ecoMode\": null", fullControl.Body.Value)
    Assert.Contains("\"airSwingUD\": null", fullControl.Body.Value)
    Assert.Contains("\"fanSpeed\": null", fullControl.Body.Value)
    Assert.Contains("deviceGuid", fullControl.Body.Value)

    // Second control: just temperature
    let tempControl =
        controls |> List.find (fun r -> r.Body.IsSome && r.Body.Value.Contains("21.0"))

    Assert.Contains("\"temperatureSet\": 21.0", tempControl.Body.Value)

    // History data POST
    let history = f.Requests |> List.find (fun r -> r.Url.Contains("deviceHistoryData"))
    Assert.Equal("POST", history.Method)
    Assert.True(history.Body.IsSome)
    Assert.Contains("\"dataMode\": 0", history.Body.Value)
    Assert.Contains("\"date\": \"20190610\"", history.Body.Value)
    Assert.Contains("osTimezone", history.Body.Value)

    // Agreement endpoints
    let agreementGet =
        f.Requests
        |> List.filter (fun r -> r.Method = "GET" && r.Url.Contains("agreement"))

    Assert.True(agreementGet.Length >= 3)

    let agreementPut =
        f.Requests
        |> List.find (fun r -> r.Method = "PUT" && r.Url.Contains("agreement"))

    Assert.True(agreementPut.Body.IsSome)
    Assert.Contains("\"agreementStatus\": 0", agreementPut.Body.Value)
    Assert.Contains("\"type\": 0", agreementPut.Body.Value)

    // Requests with rich headers (>= 7 headers)
    let richHeaderRequests = f.Requests |> List.filter (fun r -> r.Headers.Length >= 7)
    Assert.True(richHeaderRequests.Length >= 5)

    // Requests with Accept-Encoding and Connection headers
    let withAcceptEncoding =
        f.Requests
        |> List.filter (fun r -> r.Headers |> List.exists (fun (k, _) -> k = "Accept-Encoding"))

    Assert.True(withAcceptEncoding.Length >= 1)

    for req in withAcceptEncoding do
        assertHeaderExact req "Accept-Encoding" "gzip"
        assertHeaderExact req "Connection" "Keep-Alive"
