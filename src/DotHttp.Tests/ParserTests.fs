module DotHttp.Tests.ParserTests
// Specs: http-shared, http-separator, http-method-line, http-headers, http-body,
//        http-comments, http-vars, http-ms, http-jb, http-convert-detect,
//        http-convert-parse, http-parser-project

open Xunit
open DotHttp
open DotHttp.Parser

// ─── Helpers ───────────────────────────────────────────────────

let private unwrap (input: string) : HttpFile =
    match parse input with
    | Ok f -> f
    | Error e -> failwith $"Expected parse to succeed but got: {e}"

let private firstRequest (f: HttpFile) : HttpRequest =
    match f.Requests with
    | first :: _ -> first
    | [] -> failwith "Expected at least one request"

let private requestAt (f: HttpFile) (index: int) : HttpRequest =
    if index < f.Requests.Length then f.Requests[index]
    else failwith $"Expected request at index {index}"

// ─── Single request ────────────────────────────────────────────

[<Fact>]
let ``parse minimal GET request`` () =
    let f = unwrap "GET https://api.example.com/users\n"
    let req = firstRequest f
    Assert.Equal("GET", req.Method)
    Assert.Equal("https://api.example.com/users", req.Url)
    Assert.Equal(1, f.Requests.Length)
    Assert.True(req.Headers.IsEmpty)
    Assert.True(req.Body.IsNone)
    Assert.True(req.Name.IsNone)
    Assert.Equal(Common, f.Dialect)

[<Fact>]
let ``parse POST with headers and body`` () =
    let input = """POST https://api.example.com/users
Content-Type: application/json
Accept: application/json

{
  "name": "Alice",
  "email": "alice@example.com"
}
"""
    let f = unwrap input
    let req = firstRequest f
    Assert.Equal("POST", req.Method)
    Assert.Equal("https://api.example.com/users", req.Url)
    Assert.Equal(2, req.Headers.Length)
    Assert.Equal("Content-Type", fst req.Headers[0])
    Assert.Equal("application/json", snd req.Headers[0])
    Assert.Equal("Accept", fst req.Headers[1])
    Assert.Equal("application/json", snd req.Headers[1])
    Assert.True(req.Body.IsSome)
    Assert.Contains("Alice", req.Body.Value)
    Assert.Contains("alice@example.com", req.Body.Value)

[<Fact>]
let ``parse request with HTTP version`` () =
    let f = unwrap "GET https://example.com HTTP/1.1\n"
    let req = firstRequest f
    Assert.Equal("GET", req.Method)
    Assert.Equal("https://example.com", req.Url)
    Assert.Equal(Some "1.1", req.HttpVersion)

[<Fact>]
let ``parse request with HTTP/2`` () =
    let f = unwrap "GET https://example.com HTTP/2\n"
    let req = firstRequest f
    Assert.Equal(Some "2", req.HttpVersion)

// ─── Multiple requests with ### separator ──────────────────────

[<Fact>]
let ``parse multiple requests separated by ###`` () =
    let input = """GET https://api.example.com/users

###

POST https://api.example.com/users
Content-Type: application/json

{"name": "Bob"}

### Delete user

DELETE https://api.example.com/users/1
"""
    let f = unwrap input
    Assert.Equal(3, f.Requests.Length)

    let get = requestAt f 0
    Assert.Equal("GET", get.Method)
    Assert.Equal("https://api.example.com/users", get.Url)
    Assert.True(get.Body.IsNone)

    let post = requestAt f 1
    Assert.Equal("POST", post.Method)
    Assert.True(post.Body.IsSome)
    Assert.Contains("Bob", post.Body.Value)

    let delete = requestAt f 2
    Assert.Equal("DELETE", delete.Method)
    Assert.Equal("https://api.example.com/users/1", delete.Url)
    Assert.Equal(Some "Delete user", delete.Name)

// ─── Named requests (### name) ─────────────────────────────────

[<Fact>]
let ``parse separator name becomes request name`` () =
    let input = """### Get all users
GET https://api.example.com/users
"""
    let f = unwrap input
    let req = firstRequest f
    Assert.Equal(Some "Get all users", req.Name)
    Assert.Equal("GET", req.Method)

// ─── Comments ──────────────────────────────────────────────────

[<Fact>]
let ``parse hash comments`` () =
    let input = """# This is a comment
GET https://api.example.com/users
"""
    let f = unwrap input
    let req = firstRequest f
    Assert.Equal("GET", req.Method)
    Assert.Contains("This is a comment", req.Comments)

[<Fact>]
let ``parse double-slash comments`` () =
    let input = """// Another comment
GET https://api.example.com/users
"""
    let f = unwrap input
    let req = firstRequest f
    Assert.Contains("Another comment", req.Comments)

// ─── Microsoft dialect ─────────────────────────────────────────

[<Fact>]
let ``parse Microsoft file-level variable declarations`` () =
    let input = """@host = api.example.com
@token = abc123

GET https://{{host}}/users
Authorization: Bearer {{token}}
"""
    let f = unwrap input
    Assert.Equal(Microsoft, f.Dialect)
    Assert.Equal(2, f.FileVariables.Length)
    Assert.Equal("host", fst f.FileVariables[0])
    Assert.Equal("api.example.com", snd f.FileVariables[0])
    Assert.Equal("token", fst f.FileVariables[1])
    Assert.Equal("abc123", snd f.FileVariables[1])

    let req = firstRequest f
    Assert.Equal("GET", req.Method)
    Assert.Contains("{{host}}", req.Url)
    Assert.Equal(1, req.Headers.Length)
    Assert.Equal("Authorization", fst req.Headers[0])
    Assert.Contains("{{token}}", snd req.Headers[0])

[<Fact>]
let ``parse Microsoft name directive`` () =
    let input = """# @name GetUsers
GET https://api.example.com/users
"""
    let f = unwrap input
    let req = firstRequest f
    Assert.Equal(Microsoft, f.Dialect)
    Assert.Equal(Some "GetUsers", req.Name)

// ─── JetBrains dialect ─────────────────────────────────────────

[<Fact>]
let ``parse JetBrains inline post-response script`` () =
    let input = """GET https://api.example.com/users

> {%
    client.test("status", function() {
        client.assert(response.status === 200);
    });
%}
"""
    let f = unwrap input
    Assert.Equal(JetBrains, f.Dialect)
    let req = firstRequest f
    Assert.True(req.PostScript.IsSome)
    Assert.Contains("response.status", req.PostScript.Value)

[<Fact>]
let ``parse JetBrains inline pre-request script`` () =
    let input = """< {% request.variables.set("ts", Date.now()) %}
POST https://api.example.com/data
Content-Type: application/json

{"timestamp": "{{ts}}"}
"""
    let f = unwrap input
    Assert.Equal(JetBrains, f.Dialect)
    let req = firstRequest f
    Assert.True(req.PreScript.IsSome)
    Assert.Contains("request.variables.set", req.PreScript.Value)

[<Fact>]
let ``parse JetBrains file script references`` () =
    let input = """< scripts/setup.js
GET https://api.example.com/users
> scripts/validate.js
"""
    let f = unwrap input
    let req = firstRequest f
    Assert.True(req.PreScript.IsSome)
    Assert.Equal("file:scripts/setup.js", req.PreScript.Value)
    Assert.True(req.PostScript.IsSome)
    Assert.Equal("file:scripts/validate.js", req.PostScript.Value)

// ─── Variable interpolation (passthrough) ──────────────────────

[<Fact>]
let ``variable interpolation syntax preserved in URL`` () =
    let f = unwrap "GET https://{{host}}/api/{{version}}/users\n"
    let req = firstRequest f
    Assert.Contains("{{host}}", req.Url)
    Assert.Contains("{{version}}", req.Url)

[<Fact>]
let ``variable interpolation preserved in headers`` () =
    let input = """GET https://api.example.com
Authorization: Bearer {{token}}
X-Request-Id: {{requestId}}
"""
    let f = unwrap input
    let req = firstRequest f
    Assert.Equal(2, req.Headers.Length)
    Assert.Contains("{{token}}", snd req.Headers[0])
    Assert.Contains("{{requestId}}", snd req.Headers[1])

// ─── Case-insensitive methods ──────────────────────────────────

[<Theory>]
[<InlineData("get")>]
[<InlineData("Get")>]
[<InlineData("GET")>]
let ``parse method case-insensitively`` (method: string) =
    let f = unwrap $"{method} https://example.com\n"
    let req = firstRequest f
    Assert.Equal("GET", req.Method)

[<Theory>]
[<InlineData("post")>]
[<InlineData("put")>]
[<InlineData("patch")>]
[<InlineData("delete")>]
[<InlineData("head")>]
[<InlineData("options")>]
[<InlineData("trace")>]
[<InlineData("connect")>]
let ``parse all HTTP methods`` (method: string) =
    let f = unwrap $"{method} https://example.com\n"
    let req = firstRequest f
    Assert.Equal(method.ToUpperInvariant(), req.Method)

// ─── Edge cases ────────────────────────────────────────────────

[<Fact>]
let ``empty input returns error`` () =
    match parse "" with
    | Error msg -> Assert.Contains("No HTTP requests", msg)
    | Ok _ -> failwith "Expected error for empty input"

[<Fact>]
let ``only comments returns error`` () =
    match parse "# just a comment\n// another comment\n" with
    | Error msg -> Assert.Contains("No HTTP requests", msg)
    | Ok _ -> failwith "Expected error for comments-only input"

[<Fact>]
let ``request without body has None body`` () =
    let f = unwrap "DELETE https://api.example.com/users/42\n"
    let req = firstRequest f
    Assert.True(req.Body.IsNone)

[<Fact>]
let ``multiple blank lines between requests handled`` () =
    let input = """GET https://example.com/a



###



GET https://example.com/b
"""
    let f = unwrap input
    Assert.Equal(2, f.Requests.Length)
    Assert.Equal("https://example.com/a", (requestAt f 0).Url)
    Assert.Equal("https://example.com/b", (requestAt f 1).Url)

// ─── Mixed dialect detection ───────────────────────────────────

[<Fact>]
let ``file with only standard features detected as Common`` () =
    let input = """### Request 1
GET https://example.com

### Request 2
POST https://example.com
Content-Type: application/json

{"key": "value"}
"""
    let f = unwrap input
    Assert.Equal(Common, f.Dialect)

[<Fact>]
let ``file with file-level variables detected as Microsoft`` () =
    let f = unwrap "@host = example.com\nGET https://{{host}}\n"
    Assert.Equal(Microsoft, f.Dialect)

[<Fact>]
let ``file with script blocks detected as JetBrains`` () =
    let input = """GET https://example.com
> {% client.log("done") %}
"""
    let f = unwrap input
    Assert.Equal(JetBrains, f.Dialect)

// ─── Realistic multi-request file ──────────────────────────────

[<Fact>]
let ``parse realistic REST API file`` () =
    let input = """### List all users
GET https://api.example.com/v1/users
Accept: application/json
Authorization: Bearer {{token}}

### Create a user
POST https://api.example.com/v1/users
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Charlie",
  "email": "charlie@test.com",
  "role": "admin"
}

### Get user by ID
GET https://api.example.com/v1/users/{{userId}}
Accept: application/json
Authorization: Bearer {{token}}

### Delete user
DELETE https://api.example.com/v1/users/{{userId}}
Authorization: Bearer {{token}}
"""
    let f = unwrap input
    Assert.Equal(4, f.Requests.Length)

    let list = requestAt f 0
    Assert.Equal("GET", list.Method)
    Assert.Equal(Some "List all users", list.Name)
    Assert.Equal(2, list.Headers.Length)
    Assert.True(list.Body.IsNone)

    let create = requestAt f 1
    Assert.Equal("POST", create.Method)
    Assert.Equal(Some "Create a user", create.Name)
    Assert.Equal(2, create.Headers.Length)
    Assert.True(create.Body.IsSome)
    Assert.Contains("Charlie", create.Body.Value)
    Assert.Contains("charlie@test.com", create.Body.Value)
    Assert.Contains("admin", create.Body.Value)

    let get = requestAt f 2
    Assert.Equal("GET", get.Method)
    Assert.Contains("{{userId}}", get.Url)
    Assert.Equal(Some "Get user by ID", get.Name)

    let delete = requestAt f 3
    Assert.Equal("DELETE", delete.Method)
    Assert.Equal(Some "Delete user", delete.Name)
    Assert.Equal(1, delete.Headers.Length)

// ─── Body blank line preservation ─────────────────────────────

[<Fact>]
let ``body preserves internal blank lines`` () =
    let input = "POST https://example.com\nContent-Type: text/plain\n\nline 1\n\nline 2\n\nline 3\n"
    let f = unwrap input
    let req = firstRequest f
    Assert.True(req.Body.IsSome)
    Assert.Contains("line 1", req.Body.Value)
    Assert.Contains("line 2", req.Body.Value)
    Assert.Contains("line 3", req.Body.Value)
    // Blank lines between body lines must be preserved
    Assert.Contains("line 1\n\nline 2", req.Body.Value)
    Assert.Contains("line 2\n\nline 3", req.Body.Value)

// ─── CRLF line endings ────────────────────────────────────────

[<Fact>]
let ``CRLF line endings parsed correctly`` () =
    let input = "GET https://example.com/crlf HTTP/1.1\r\nAccept: text/html\r\nHost: example.com\r\n\r\n"
    let f = unwrap input
    let req = firstRequest f
    Assert.Equal("GET", req.Method)
    Assert.Equal("https://example.com/crlf", req.Url)
    Assert.Equal(Some "1.1", req.HttpVersion)
    Assert.Equal(2, req.Headers.Length)
    Assert.Equal("Accept", fst req.Headers[0])
    Assert.Equal("text/html", snd req.Headers[0])
    Assert.Equal("Host", fst req.Headers[1])
    Assert.Equal("example.com", snd req.Headers[1])

// ─── Headers with colons in values ────────────────────────────

[<Fact>]
let ``header values may contain colons`` () =
    let input = "GET https://example.com\nX-Forwarded-For: http://proxy.internal:8080\nAuthorization: Basic dXNlcjpwYXNz\n"
    let f = unwrap input
    let req = firstRequest f
    Assert.Equal(2, req.Headers.Length)
    Assert.Equal("X-Forwarded-For", fst req.Headers[0])
    Assert.Equal("http://proxy.internal:8080", snd req.Headers[0])
    Assert.Equal("Authorization", fst req.Headers[1])
    Assert.Equal("Basic dXNlcjpwYXNz", snd req.Headers[1])

// ─── URL with query parameters ────────────────────────────────

[<Fact>]
let ``URL with complex query parameters preserved`` () =
    let input = "GET https://api.example.com/search?q=hello+world&page=2&filter=status%3Aactive&sort=name:asc\n"
    let f = unwrap input
    let req = firstRequest f
    Assert.Equal("GET", req.Method)
    Assert.Contains("q=hello+world", req.Url)
    Assert.Contains("page=2", req.Url)
    Assert.Contains("filter=status%3Aactive", req.Url)
    Assert.Contains("sort=name:asc", req.Url)

// ═══════════════════════════════════════════════════════════════
// Real-world .http file scenarios
// ═══════════════════════════════════════════════════════════════

// ─── 1. Stripe-style payment API ──────────────────────────────

[<Fact>]
let ``real-world: Stripe-style payment API`` () =
    let input = """@baseUrl = https://api.stripe.com/v1
@secretKey = sk_test_abc123

### Create a customer
# @name CreateCustomer
POST https://{{baseUrl}}/customers
Authorization: Bearer {{secretKey}}
Content-Type: application/x-www-form-urlencoded

email=customer@example.com&name=Jane%20Doe&description=Test%20customer

### Create a payment intent
# @name CreatePaymentIntent
POST https://{{baseUrl}}/payment_intents
Authorization: Bearer {{secretKey}}
Content-Type: application/x-www-form-urlencoded

amount=2000&currency=usd&customer={{CreateCustomer.response.body.id}}&payment_method_types[]=card

### List charges with pagination
GET https://{{baseUrl}}/charges?limit=10&starting_after={{lastChargeId}}
Authorization: Bearer {{secretKey}}
"""
    let f = unwrap input
    Assert.Equal(Microsoft, f.Dialect)
    Assert.Equal(3, f.Requests.Length)
    Assert.Equal(2, f.FileVariables.Length)
    Assert.Equal("baseUrl", fst f.FileVariables[0])
    Assert.Equal("https://api.stripe.com/v1", snd f.FileVariables[0])
    Assert.Equal("secretKey", fst f.FileVariables[1])
    Assert.Equal("sk_test_abc123", snd f.FileVariables[1])

    let createCust = requestAt f 0
    Assert.Equal("POST", createCust.Method)
    Assert.Equal(Some "CreateCustomer", createCust.Name)
    Assert.Contains("{{baseUrl}}", createCust.Url)
    Assert.Equal(2, createCust.Headers.Length)
    Assert.Equal("Authorization", fst createCust.Headers[0])
    Assert.Contains("{{secretKey}}", snd createCust.Headers[0])
    Assert.Equal("Content-Type", fst createCust.Headers[1])
    Assert.Equal("application/x-www-form-urlencoded", snd createCust.Headers[1])
    Assert.True(createCust.Body.IsSome)
    Assert.Contains("email=customer@example.com", createCust.Body.Value)
    Assert.Contains("name=Jane%20Doe", createCust.Body.Value)

    let pi = requestAt f 1
    Assert.Equal("POST", pi.Method)
    Assert.Equal(Some "CreatePaymentIntent", pi.Name)
    Assert.True(pi.Body.IsSome)
    Assert.Contains("amount=2000", pi.Body.Value)
    Assert.Contains("currency=usd", pi.Body.Value)
    Assert.Contains("payment_method_types[]=card", pi.Body.Value)

    let charges = requestAt f 2
    Assert.Equal("GET", charges.Method)
    Assert.Contains("limit=10", charges.Url)
    Assert.Contains("starting_after={{lastChargeId}}", charges.Url)
    Assert.True(charges.Body.IsNone)

// ─── 2. OAuth2 token flow ─────────────────────────────────────

[<Fact>]
let ``real-world: OAuth2 authorization code flow`` () =
    let input = """### Exchange authorization code for tokens
# @name TokenExchange
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded
Accept: application/json

grant_type=authorization_code&code={{authCode}}&redirect_uri=https://app.example.com/callback&client_id={{clientId}}&client_secret={{clientSecret}}

### Refresh access token
# @name RefreshToken
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token={{TokenExchange.response.body.refresh_token}}&client_id={{clientId}}

### Call protected resource
GET https://api.example.com/me
Authorization: Bearer {{TokenExchange.response.body.access_token}}
Accept: application/json
"""
    let f = unwrap input
    Assert.Equal(Microsoft, f.Dialect)
    Assert.Equal(3, f.Requests.Length)

    let tokenEx = requestAt f 0
    Assert.Equal("POST", tokenEx.Method)
    Assert.Equal("https://auth.example.com/oauth/token", tokenEx.Url)
    Assert.Equal(Some "TokenExchange", tokenEx.Name)
    Assert.Equal(2, tokenEx.Headers.Length)
    Assert.True(tokenEx.Body.IsSome)
    Assert.Contains("grant_type=authorization_code", tokenEx.Body.Value)
    Assert.Contains("redirect_uri=https://app.example.com/callback", tokenEx.Body.Value)
    Assert.Contains("client_secret={{clientSecret}}", tokenEx.Body.Value)

    let refresh = requestAt f 1
    Assert.Equal(Some "RefreshToken", refresh.Name)
    Assert.True(refresh.Body.IsSome)
    Assert.Contains("grant_type=refresh_token", refresh.Body.Value)
    Assert.Contains("{{TokenExchange.response.body.refresh_token}}", refresh.Body.Value)

    let protected' = requestAt f 2
    Assert.Equal("GET", protected'.Method)
    Assert.Equal("https://api.example.com/me", protected'.Url)
    Assert.Equal(2, protected'.Headers.Length)
    Assert.Contains("{{TokenExchange.response.body.access_token}}", snd protected'.Headers[0])

// ─── 3. GraphQL over HTTP ─────────────────────────────────────

[<Fact>]
let ``real-world: GraphQL query and mutation over HTTP`` () =
    let input = """### GraphQL query - list repositories
POST https://api.github.com/graphql
Authorization: Bearer {{githubToken}}
Content-Type: application/json
User-Agent: MyApp/1.0

{
  "query": "query { viewer { repositories(first: 10) { nodes { name, stargazerCount } } } }"
}

### GraphQL mutation - create issue
POST https://api.github.com/graphql
Authorization: Bearer {{githubToken}}
Content-Type: application/json
User-Agent: MyApp/1.0

{
  "query": "mutation($input: CreateIssueInput!) { createIssue(input: $input) { issue { id number title } } }",
  "variables": {
    "input": {
      "repositoryId": "MDEwOlJlcG9zaXRvcnkxMjM0NTY=",
      "title": "Bug: Login page broken",
      "body": "Steps to reproduce:\n1. Go to /login\n2. Enter credentials\n3. Page crashes"
    }
  }
}
"""
    let f = unwrap input
    Assert.Equal(Common, f.Dialect)
    Assert.Equal(2, f.Requests.Length)

    let query = requestAt f 0
    Assert.Equal("POST", query.Method)
    Assert.Equal("https://api.github.com/graphql", query.Url)
    Assert.Equal(3, query.Headers.Length)
    Assert.Equal("User-Agent", fst query.Headers[2])
    Assert.Equal("MyApp/1.0", snd query.Headers[2])
    Assert.True(query.Body.IsSome)
    Assert.Contains("viewer", query.Body.Value)
    Assert.Contains("repositories", query.Body.Value)
    Assert.Contains("stargazerCount", query.Body.Value)

    let mutation = requestAt f 1
    Assert.Equal("POST", mutation.Method)
    Assert.True(mutation.Body.IsSome)
    Assert.Contains("createIssue", mutation.Body.Value)
    Assert.Contains("MDEwOlJlcG9zaXRvcnkxMjM0NTY=", mutation.Body.Value)
    Assert.Contains("Bug: Login page broken", mutation.Body.Value)
    // Body with nested JSON must preserve structure including blank lines between keys
    Assert.Contains("variables", mutation.Body.Value)

// ─── 4. XML SOAP request ──────────────────────────────────────

[<Fact>]
let ``real-world: SOAP XML web service`` () =
    let input = """### GetWeather SOAP call
POST https://www.w3schools.com/xml/tempconvert.asmx HTTP/1.1
Content-Type: text/xml; charset=utf-8
SOAPAction: "https://www.w3schools.com/xml/CelsiusToFahrenheit"

<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CelsiusToFahrenheit xmlns="https://www.w3schools.com/xml/">
      <Celsius>100</Celsius>
    </CelsiusToFahrenheit>
  </soap:Body>
</soap:Envelope>
"""
    let f = unwrap input
    Assert.Equal(Common, f.Dialect)
    Assert.Equal(1, f.Requests.Length)

    let req = firstRequest f
    Assert.Equal("POST", req.Method)
    Assert.Equal("https://www.w3schools.com/xml/tempconvert.asmx", req.Url)
    Assert.Equal(Some "1.1", req.HttpVersion)
    Assert.Equal(Some "GetWeather SOAP call", req.Name)
    Assert.Equal(2, req.Headers.Length)
    Assert.Equal("Content-Type", fst req.Headers[0])
    Assert.Equal("text/xml; charset=utf-8", snd req.Headers[0])
    Assert.Equal("SOAPAction", fst req.Headers[1])
    Assert.Contains("CelsiusToFahrenheit", snd req.Headers[1])
    Assert.True(req.Body.IsSome)
    Assert.Contains("<?xml version=", req.Body.Value)
    Assert.Contains("soap:Envelope", req.Body.Value)
    Assert.Contains("soap:Body", req.Body.Value)
    Assert.Contains("<Celsius>100</Celsius>", req.Body.Value)
    Assert.Contains("xmlns:xsi=", req.Body.Value)

// ─── 5. JetBrains multi-request with response handlers ────────

[<Fact>]
let ``real-world: JetBrains test suite with response handlers`` () =
    let input = """### Login and capture token
POST https://api.example.com/auth/login
Content-Type: application/json

{"username": "admin", "password": "secret"}

> {%
    client.test("Login successful", function() {
        client.assert(response.status === 200, "Expected 200");
        client.assert(response.body.token !== undefined, "Token missing");
        client.global.set("authToken", response.body.token);
    });
%}

### Get user profile
GET https://api.example.com/users/me
Authorization: Bearer {{authToken}}
Accept: application/json

> {%
    client.test("Profile loaded", function() {
        client.assert(response.status === 200);
        client.assert(response.body.email !== undefined);
    });
%}

### Update profile
PATCH https://api.example.com/users/me
Authorization: Bearer {{authToken}}
Content-Type: application/json

{"displayName": "Admin User", "timezone": "UTC"}

> {%
    client.test("Profile updated", function() {
        client.assert(response.status === 200);
        client.assert(response.body.displayName === "Admin User");
    });
%}
"""
    let f = unwrap input
    Assert.Equal(JetBrains, f.Dialect)
    Assert.Equal(3, f.Requests.Length)

    let login = requestAt f 0
    Assert.Equal("POST", login.Method)
    Assert.Equal("https://api.example.com/auth/login", login.Url)
    Assert.Equal(Some "Login and capture token", login.Name)
    Assert.True(login.Body.IsSome)
    Assert.Contains("admin", login.Body.Value)
    Assert.True(login.PostScript.IsSome)
    Assert.Contains("response.status === 200", login.PostScript.Value)
    Assert.Contains("client.global.set", login.PostScript.Value)
    Assert.Contains("authToken", login.PostScript.Value)
    Assert.True(login.PreScript.IsNone)

    let profile = requestAt f 1
    Assert.Equal("GET", profile.Method)
    Assert.Equal(Some "Get user profile", profile.Name)
    Assert.Equal(2, profile.Headers.Length)
    Assert.Contains("{{authToken}}", snd profile.Headers[0])
    Assert.True(profile.PostScript.IsSome)
    Assert.Contains("response.body.email", profile.PostScript.Value)
    Assert.True(profile.Body.IsNone)

    let update = requestAt f 2
    Assert.Equal("PATCH", update.Method)
    Assert.Equal(Some "Update profile", update.Name)
    Assert.True(update.Body.IsSome)
    Assert.Contains("Admin User", update.Body.Value)
    Assert.Contains("UTC", update.Body.Value)
    Assert.True(update.PostScript.IsSome)
    Assert.Contains("Admin User", update.PostScript.Value)

// ─── 6. Microsoft REST Client with environments ──────────────

[<Fact>]
let ``real-world: Microsoft REST Client full featured`` () =
    let input = """@hostname = localhost
@port = 3000
@host = {{hostname}}:{{port}}
@contentType = application/json
@createdAt = 2024-01-15T10:30:00Z

// This file tests the full CRUD API

### Create a new todo item
# @name CreateTodo
POST https://{{host}}/api/todos
Content-Type: {{contentType}}

{
    "title": "Buy groceries",
    "completed": false,
    "dueDate": "{{createdAt}}",
    "tags": ["shopping", "personal"],
    "priority": 1
}

### Get the created item using response reference
GET https://{{host}}/api/todos/{{CreateTodo.response.body.id}}
Accept: {{contentType}}

### List all todos with filtering
GET https://{{host}}/api/todos?completed=false&sort=priority&order=asc&limit=25
Accept: {{contentType}}

### Update a todo with PUT (full replace)
PUT https://{{host}}/api/todos/{{CreateTodo.response.body.id}}
Content-Type: {{contentType}}

{
    "title": "Buy groceries and cook dinner",
    "completed": true,
    "dueDate": "{{createdAt}}",
    "tags": ["shopping", "personal", "cooking"],
    "priority": 2
}
"""
    let f = unwrap input
    Assert.Equal(Microsoft, f.Dialect)
    Assert.Equal(4, f.Requests.Length)
    Assert.Equal(5, f.FileVariables.Length)
    Assert.Equal("hostname", fst f.FileVariables[0])
    Assert.Equal("localhost", snd f.FileVariables[0])
    Assert.Equal("port", fst f.FileVariables[1])
    Assert.Equal("3000", snd f.FileVariables[1])
    Assert.Equal("host", fst f.FileVariables[2])
    Assert.Equal("{{hostname}}:{{port}}", snd f.FileVariables[2])
    Assert.Equal("contentType", fst f.FileVariables[3])
    Assert.Equal("application/json", snd f.FileVariables[3])
    Assert.Equal("createdAt", fst f.FileVariables[4])

    let create = requestAt f 0
    Assert.Equal("POST", create.Method)
    Assert.Equal(Some "CreateTodo", create.Name)
    Assert.Contains("{{host}}", create.Url)
    Assert.True(create.Body.IsSome)
    Assert.Contains("Buy groceries", create.Body.Value)
    Assert.Contains("\"tags\":", create.Body.Value)
    Assert.Contains("\"shopping\"", create.Body.Value)
    Assert.Contains("\"priority\": 1", create.Body.Value)

    let getItem = requestAt f 1
    Assert.Equal("GET", getItem.Method)
    Assert.Contains("{{CreateTodo.response.body.id}}", getItem.Url)
    Assert.True(getItem.Body.IsNone)

    let list = requestAt f 2
    Assert.Equal("GET", list.Method)
    Assert.Contains("completed=false", list.Url)
    Assert.Contains("sort=priority", list.Url)
    Assert.Contains("limit=25", list.Url)

    let update = requestAt f 3
    Assert.Equal("PUT", update.Method)
    Assert.True(update.Body.IsSome)
    Assert.Contains("cook dinner", update.Body.Value)
    Assert.Contains("cooking", update.Body.Value)
    Assert.Contains("\"priority\": 2", update.Body.Value)

// ─── 7. Kubernetes API ────────────────────────────────────────

[<Fact>]
let ``real-world: Kubernetes API requests`` () =
    let input = """### List pods in default namespace
GET https://kubernetes.default.svc/api/v1/namespaces/default/pods
Authorization: Bearer {{k8sToken}}
Accept: application/json

### Create a deployment
POST https://kubernetes.default.svc/apis/apps/v1/namespaces/default/deployments
Authorization: Bearer {{k8sToken}}
Content-Type: application/json

{
  "apiVersion": "apps/v1",
  "kind": "Deployment",
  "metadata": {
    "name": "nginx-deployment",
    "labels": {
      "app": "nginx"
    }
  },
  "spec": {
    "replicas": 3,
    "selector": {
      "matchLabels": {
        "app": "nginx"
      }
    },
    "template": {
      "metadata": {
        "labels": {
          "app": "nginx"
        }
      },
      "spec": {
        "containers": [
          {
            "name": "nginx",
            "image": "nginx:1.25",
            "ports": [
              {
                "containerPort": 80
              }
            ]
          }
        ]
      }
    }
  }
}

### Scale deployment
PATCH https://kubernetes.default.svc/apis/apps/v1/namespaces/default/deployments/nginx-deployment/scale
Authorization: Bearer {{k8sToken}}
Content-Type: application/strategic-merge-patch+json

{"spec": {"replicas": 5}}

### Delete deployment
DELETE https://kubernetes.default.svc/apis/apps/v1/namespaces/default/deployments/nginx-deployment
Authorization: Bearer {{k8sToken}}
"""
    let f = unwrap input
    Assert.Equal(Common, f.Dialect)
    Assert.Equal(4, f.Requests.Length)

    let listPods = requestAt f 0
    Assert.Equal("GET", listPods.Method)
    Assert.Contains("/api/v1/namespaces/default/pods", listPods.Url)
    Assert.Equal(Some "List pods in default namespace", listPods.Name)
    Assert.True(listPods.Body.IsNone)
    Assert.Equal(2, listPods.Headers.Length)

    let createDeploy = requestAt f 1
    Assert.Equal("POST", createDeploy.Method)
    Assert.Contains("deployments", createDeploy.Url)
    Assert.True(createDeploy.Body.IsSome)
    Assert.Contains("nginx-deployment", createDeploy.Body.Value)
    Assert.Contains("\"replicas\": 3", createDeploy.Body.Value)
    Assert.Contains("nginx:1.25", createDeploy.Body.Value)
    Assert.Contains("containerPort", createDeploy.Body.Value)

    let scale = requestAt f 2
    Assert.Equal("PATCH", scale.Method)
    Assert.Contains("/scale", scale.Url)
    Assert.Equal("Content-Type", fst scale.Headers[1])
    Assert.Equal("application/strategic-merge-patch+json", snd scale.Headers[1])
    Assert.True(scale.Body.IsSome)
    Assert.Contains("\"replicas\": 5", scale.Body.Value)

    let del = requestAt f 3
    Assert.Equal("DELETE", del.Method)
    Assert.Contains("nginx-deployment", del.Url)
    Assert.True(del.Body.IsNone)

// ─── 8. AWS S3 pre-signed style requests ──────────────────────

[<Fact>]
let ``real-world: AWS-style requests with complex headers`` () =
    let input = """### Upload object to S3
PUT https://my-bucket.s3.us-east-1.amazonaws.com/photos/2024/vacation.jpg
Host: my-bucket.s3.us-east-1.amazonaws.com
Content-Type: image/jpeg
x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
x-amz-date: 20240115T120000Z
Authorization: AWS4-HMAC-SHA256 Credential={{accessKey}}/20240115/us-east-1/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature={{signature}}

### List bucket contents
GET https://my-bucket.s3.us-east-1.amazonaws.com/?list-type=2&prefix=photos/&max-keys=100
Host: my-bucket.s3.us-east-1.amazonaws.com
x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
x-amz-date: 20240115T120000Z
Authorization: AWS4-HMAC-SHA256 Credential={{accessKey}}/20240115/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature={{listSig}}
"""
    let f = unwrap input
    Assert.Equal(2, f.Requests.Length)

    let upload = requestAt f 0
    Assert.Equal("PUT", upload.Method)
    Assert.Contains("vacation.jpg", upload.Url)
    Assert.Equal(5, upload.Headers.Length)
    Assert.Equal("Host", fst upload.Headers[0])
    Assert.Equal("x-amz-content-sha256", fst upload.Headers[2])
    Assert.Equal("x-amz-date", fst upload.Headers[3])
    Assert.Contains("AWS4-HMAC-SHA256", snd upload.Headers[4])
    Assert.Contains("{{accessKey}}", snd upload.Headers[4])
    Assert.Contains("Signature={{signature}}", snd upload.Headers[4])

    let listBucket = requestAt f 1
    Assert.Equal("GET", listBucket.Method)
    Assert.Contains("list-type=2", listBucket.Url)
    Assert.Contains("prefix=photos/", listBucket.Url)
    Assert.Contains("max-keys=100", listBucket.Url)
    Assert.Equal(4, listBucket.Headers.Length)

// ─── 9. JetBrains with pre-request scripts and file refs ─────

[<Fact>]
let ``real-world: JetBrains pre and post scripts with file refs`` () =
    let input = """### Create signed webhook
< scripts/generate-hmac.js
POST https://api.example.com/webhooks
Content-Type: application/json
X-Signature: {{hmacSignature}}
X-Timestamp: {{timestamp}}

{
  "url": "https://myapp.com/webhook",
  "events": ["order.created", "order.updated", "payment.received"],
  "secret": "whsec_abc123"
}

> scripts/verify-webhook.js

### Trigger test event
POST https://api.example.com/webhooks/{{webhookId}}/test
Authorization: Bearer {{apiKey}}

> {%
    client.test("Test event sent", function() {
        client.assert(response.status === 202, "Expected 202 Accepted");
        client.assert(response.body.eventId !== undefined);
    });
%}
"""
    let f = unwrap input
    Assert.Equal(JetBrains, f.Dialect)
    Assert.Equal(2, f.Requests.Length)

    let createWebhook = requestAt f 0
    Assert.Equal("POST", createWebhook.Method)
    Assert.Equal("https://api.example.com/webhooks", createWebhook.Url)
    Assert.Equal(Some "Create signed webhook", createWebhook.Name)
    Assert.Equal(3, createWebhook.Headers.Length)
    Assert.Equal("X-Signature", fst createWebhook.Headers[1])
    Assert.Contains("{{hmacSignature}}", snd createWebhook.Headers[1])
    Assert.True(createWebhook.Body.IsSome)
    Assert.Contains("order.created", createWebhook.Body.Value)
    Assert.Contains("payment.received", createWebhook.Body.Value)
    Assert.True(createWebhook.PreScript.IsSome)
    Assert.Equal("file:scripts/generate-hmac.js", createWebhook.PreScript.Value)
    Assert.True(createWebhook.PostScript.IsSome)
    Assert.Equal("file:scripts/verify-webhook.js", createWebhook.PostScript.Value)

    let triggerTest = requestAt f 1
    Assert.Equal("POST", triggerTest.Method)
    Assert.Contains("{{webhookId}}", triggerTest.Url)
    Assert.True(triggerTest.PostScript.IsSome)
    Assert.Contains("202 Accepted", triggerTest.PostScript.Value)
    Assert.Contains("eventId", triggerTest.PostScript.Value)

// ─── 10. Elasticsearch bulk operations ────────────────────────

[<Fact>]
let ``real-world: Elasticsearch bulk and NDJSON body`` () =
    let input = """### Create index with mappings
PUT https://elasticsearch.local:9200/products
Content-Type: application/json

{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0
  },
  "mappings": {
    "properties": {
      "name": { "type": "text", "analyzer": "standard" },
      "price": { "type": "float" },
      "category": { "type": "keyword" },
      "created_at": { "type": "date" }
    }
  }
}

### Search with aggregation
POST https://elasticsearch.local:9200/products/_search
Content-Type: application/json

{
  "size": 0,
  "query": {
    "bool": {
      "must": [
        { "range": { "price": { "gte": 10, "lte": 100 } } },
        { "term": { "category": "electronics" } }
      ]
    }
  },
  "aggs": {
    "avg_price": { "avg": { "field": "price" } },
    "price_ranges": {
      "range": {
        "field": "price",
        "ranges": [
          { "to": 25 },
          { "from": 25, "to": 50 },
          { "from": 50 }
        ]
      }
    }
  }
}

### Delete by query
POST https://elasticsearch.local:9200/products/_delete_by_query
Content-Type: application/json

{"query": {"range": {"created_at": {"lt": "2023-01-01"}}}}
"""
    let f = unwrap input
    Assert.Equal(Common, f.Dialect)
    Assert.Equal(3, f.Requests.Length)

    let createIdx = requestAt f 0
    Assert.Equal("PUT", createIdx.Method)
    Assert.Contains("/products", createIdx.Url)
    Assert.Equal(Some "Create index with mappings", createIdx.Name)
    Assert.True(createIdx.Body.IsSome)
    Assert.Contains("number_of_shards", createIdx.Body.Value)
    Assert.Contains("\"text\"", createIdx.Body.Value)
    Assert.Contains("\"float\"", createIdx.Body.Value)
    Assert.Contains("\"keyword\"", createIdx.Body.Value)

    let search = requestAt f 1
    Assert.Equal("POST", search.Method)
    Assert.Contains("/_search", search.Url)
    Assert.True(search.Body.IsSome)
    Assert.Contains("\"size\": 0", search.Body.Value)
    Assert.Contains("electronics", search.Body.Value)
    Assert.Contains("avg_price", search.Body.Value)
    Assert.Contains("price_ranges", search.Body.Value)

    let deleteBQ = requestAt f 2
    Assert.Equal("POST", deleteBQ.Method)
    Assert.Contains("_delete_by_query", deleteBQ.Url)
    Assert.True(deleteBQ.Body.IsSome)
    Assert.Contains("2023-01-01", deleteBQ.Body.Value)

// ─── 11. Mixed comments and separators ────────────────────────

[<Fact>]
let ``real-world: Azure DevOps API with mixed comments`` () =
    let input = """# Azure DevOps REST API examples
# Base URL: https://dev.azure.com/{org}/{project}/_apis

@org = mycompany
@project = myproject
@apiVersion = 7.1

### Get work item by ID
// List work items by query
GET https://dev.azure.com/{{org}}/{{project}}/_apis/wit/workitems/42?$expand=all&api-version={{apiVersion}}
Authorization: Basic {{pat}}
Accept: application/json

### Create bug work item
// Create a new bug
POST https://dev.azure.com/{{org}}/{{project}}/_apis/wit/workitems/$Bug?api-version={{apiVersion}}
Content-Type: application/json-patch+json
Authorization: Basic {{pat}}

[
  {"op": "add", "path": "/fields/System.Title", "value": "Login button unresponsive"},
  {"op": "add", "path": "/fields/System.Description", "value": "<p>The login button does not respond to clicks on Safari 17</p>"},
  {"op": "add", "path": "/fields/Microsoft.VSTS.Common.Priority", "value": 1},
  {"op": "add", "path": "/fields/System.Tags", "value": "bug; safari; auth"}
]
"""
    let f = unwrap input
    Assert.Equal(Microsoft, f.Dialect)
    Assert.Equal(2, f.Requests.Length)
    Assert.Equal(3, f.FileVariables.Length)
    Assert.Equal("org", fst f.FileVariables[0])
    Assert.Equal("mycompany", snd f.FileVariables[0])
    Assert.Equal("project", fst f.FileVariables[1])
    Assert.Equal("apiVersion", fst f.FileVariables[2])
    Assert.Equal("7.1", snd f.FileVariables[2])

    let getWI = requestAt f 0
    Assert.Equal("GET", getWI.Method)
    Assert.Contains("{{org}}", getWI.Url)
    Assert.Contains("{{project}}", getWI.Url)
    Assert.Contains("workitems/42", getWI.Url)
    Assert.Contains("$expand=all", getWI.Url)
    Assert.Contains("api-version={{apiVersion}}", getWI.Url)
    Assert.Equal(Some "Get work item by ID", getWI.Name)
    Assert.Equal(2, getWI.Headers.Length)
    Assert.True(getWI.Body.IsNone)
    // Comments should be captured
    Assert.True(getWI.Comments.Length > 0)

    let createBug = requestAt f 1
    Assert.Equal("POST", createBug.Method)
    Assert.Contains("$Bug", createBug.Url)
    Assert.Equal(Some "Create bug work item", createBug.Name)
    Assert.Equal("Content-Type", fst createBug.Headers[0])
    Assert.Equal("application/json-patch+json", snd createBug.Headers[0])
    Assert.True(createBug.Body.IsSome)
    Assert.Contains("System.Title", createBug.Body.Value)
    Assert.Contains("Login button unresponsive", createBug.Body.Value)
    Assert.Contains("<p>The login button", createBug.Body.Value)
    Assert.Contains("Safari 17", createBug.Body.Value)
    Assert.Contains("Priority", createBug.Body.Value)

// ─── 12. Multipart form data ─────────────────────────────────

[<Fact>]
let ``real-world: multipart form data file upload`` () =
    let input = """### Upload document with metadata
POST https://api.example.com/documents/upload
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW
Authorization: Bearer {{token}}

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="title"

Quarterly Report Q4 2024
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="department"

Engineering
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="report.pdf"
Content-Type: application/pdf

<binary content placeholder>
------WebKitFormBoundary7MA4YWxkTrZu0gW--
"""
    let f = unwrap input
    Assert.Equal(1, f.Requests.Length)

    let req = firstRequest f
    Assert.Equal("POST", req.Method)
    Assert.Contains("/documents/upload", req.Url)
    Assert.Equal(2, req.Headers.Length)
    Assert.Contains("multipart/form-data", snd req.Headers[0])
    Assert.Contains("boundary=", snd req.Headers[0])
    Assert.True(req.Body.IsSome)
    Assert.Contains("WebKitFormBoundary", req.Body.Value)
    Assert.Contains("Quarterly Report Q4 2024", req.Body.Value)
    Assert.Contains("Engineering", req.Body.Value)
    Assert.Contains("report.pdf", req.Body.Value)
    Assert.Contains("application/pdf", req.Body.Value)
    // Multipart bodies have internal blank lines that must be preserved
    Assert.Contains("form-data; name=\"title\"", req.Body.Value)

// ─── 13. Request without trailing newline ─────────────────────

[<Fact>]
let ``edge case: request without trailing newline`` () =
    let input = "GET https://example.com/no-trailing-newline"
    let f = unwrap input
    let req = firstRequest f
    Assert.Equal("GET", req.Method)
    Assert.Equal("https://example.com/no-trailing-newline", req.Url)

// ─── 14. JetBrains unsupported methods produce no crash ───────

[<Fact>]
let ``unsupported JetBrains methods are silently skipped`` () =
    let input = """### Normal request
GET https://example.com/api

### WebSocket (unsupported)
WEBSOCKET wss://example.com/ws

### Another normal request
POST https://example.com/api
Content-Type: application/json

{"key": "value"}
"""
    let f = unwrap input
    // WebSocket request is skipped, only 2 real HTTP requests
    Assert.Equal(2, f.Requests.Length)
    Assert.Equal("GET", (requestAt f 0).Method)
    Assert.Equal("POST", (requestAt f 1).Method)
    Assert.True((requestAt f 1).Body.IsSome)
    Assert.Contains("key", (requestAt f 1).Body.Value)
