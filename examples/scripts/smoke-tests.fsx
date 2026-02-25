// Smoke test suite — runs multiple HTTP tests via F# and fails on first error
// Use as a script step in a .naplist to run a batch of quick validations

open System
open System.Net.Http
open System.Text

let client = new HttpClient()
client.Timeout <- TimeSpan.FromSeconds(15.0)

type TestResult = { Name: string; Passed: bool; Detail: string }

let runTest (name: string) (test: unit -> Async<TestResult>) =
    async {
        try
            return! test ()
        with ex ->
            return { Name = name; Passed = false; Detail = ex.Message }
    }

let assertStatus (expected: int) (response: HttpResponseMessage) =
    let actual = int response.StatusCode
    if actual <> expected then
        failwithf "Expected status %d but got %d" expected actual

let getJson (url: string) =
    async {
        let! response = client.GetAsync(url) |> Async.AwaitTask
        let! body = response.Content.ReadAsStringAsync() |> Async.AwaitTask
        return response, body
    }

let postJson (url: string) (payload: string) =
    async {
        let content = new StringContent(payload, Encoding.UTF8, "application/json")
        let! response = client.PostAsync(url, content) |> Async.AwaitTask
        let! body = response.Content.ReadAsStringAsync() |> Async.AwaitTask
        return response, body
    }

// ─── Tests ───────────────────────────────────────────────────────────

let testGetPosts () =
    runTest "GET /posts returns 200" (fun () -> async {
        let! response, body = getJson "https://jsonplaceholder.typicode.com/posts"
        assertStatus 200 response
        if body.Length < 100 then failwith "Response body unexpectedly short"
        return { Name = "GET /posts returns 200"; Passed = true; Detail = "OK" }
    })

let testGetSinglePost () =
    runTest "GET /posts/1 returns correct post" (fun () -> async {
        let! response, body = getJson "https://jsonplaceholder.typicode.com/posts/1"
        assertStatus 200 response
        if not (body.Contains("userId")) then failwith "Missing userId field"
        return { Name = "GET /posts/1 returns correct post"; Passed = true; Detail = "OK" }
    })

let testCreatePost () =
    runTest "POST /posts returns 201" (fun () -> async {
        let payload = """{"title":"F# smoke test","body":"automated","userId":1}"""
        let! response, body = postJson "https://jsonplaceholder.typicode.com/posts" payload
        assertStatus 201 response
        if not (body.Contains("id")) then failwith "Missing id in response"
        return { Name = "POST /posts returns 201"; Passed = true; Detail = "OK" }
    })

let testGetComments () =
    runTest "GET /posts/1/comments returns 200" (fun () -> async {
        let! response, _ = getJson "https://jsonplaceholder.typicode.com/posts/1/comments"
        assertStatus 200 response
        return { Name = "GET /posts/1/comments returns 200"; Passed = true; Detail = "OK" }
    })

let testGetUsers () =
    runTest "GET /users returns 200" (fun () -> async {
        let! response, body = getJson "https://jsonplaceholder.typicode.com/users"
        assertStatus 200 response
        if not (body.Contains("email")) then failwith "Missing email field in users"
        return { Name = "GET /users returns 200"; Passed = true; Detail = "OK" }
    })

let testNotFound () =
    runTest "GET /posts/99999 returns 404" (fun () -> async {
        let! response, _ = getJson "https://jsonplaceholder.typicode.com/posts/99999"
        assertStatus 404 response
        return { Name = "GET /posts/99999 returns 404"; Passed = true; Detail = "OK" }
    })

// ─── Runner ──────────────────────────────────────────────────────────

let allTests =
    [ testGetPosts
      testGetSinglePost
      testCreatePost
      testGetComments
      testGetUsers
      testNotFound ]

let results =
    allTests
    |> List.map (fun t -> t () |> Async.RunSynchronously)

printfn ""
printfn "━━━ Smoke Test Results ━━━"

let mutable failures = 0

for r in results do
    let icon = if r.Passed then "PASS" else "FAIL"
    printfn "  [%s] %s — %s" icon r.Name r.Detail
    if not r.Passed then failures <- failures + 1

printfn ""
printfn "  %d/%d passed" (results.Length - failures) results.Length
printfn "━━━━━━━━━━━━━━━━━━━━━━━━━"

if failures > 0 then
    eprintfn "[smoke-tests] %d test(s) failed" failures
    exit 1

printfn "[smoke-tests] All passed"
