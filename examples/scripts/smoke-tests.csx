// Smoke test suite — runs multiple HTTP tests via C# and fails on first error
// Use as a script step in a .naplist to run a batch of quick validations

using System.Net.Http;
using System.Text;

var client = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

var results = new List<(string Name, bool Passed, string Detail)>();

async Task RunTest(string name, Func<Task> test)
{
    try
    {
        await test();
        results.Add((name, true, "OK"));
    }
    catch (Exception ex)
    {
        results.Add((name, false, ex.Message));
    }
}

void AssertStatus(int expected, HttpResponseMessage response)
{
    var actual = (int)response.StatusCode;
    if (actual != expected)
        throw new Exception($"Expected status {expected} but got {actual}");
}

// ─── Tests ───────────────────────────────────────────────────────────

await RunTest("GET /posts returns 200", async () =>
{
    var response = await client.GetAsync("https://jsonplaceholder.typicode.com/posts");
    AssertStatus(200, response);
    var body = await response.Content.ReadAsStringAsync();
    if (body.Length < 100) throw new Exception("Response body unexpectedly short");
});

await RunTest("GET /posts/1 returns correct post", async () =>
{
    var response = await client.GetAsync("https://jsonplaceholder.typicode.com/posts/1");
    AssertStatus(200, response);
    var body = await response.Content.ReadAsStringAsync();
    if (!body.Contains("userId")) throw new Exception("Missing userId field");
});

await RunTest("POST /posts returns 201", async () =>
{
    var payload = @"{""title"":""C# smoke test"",""body"":""automated"",""userId"":1}";
    var content = new StringContent(payload, Encoding.UTF8, "application/json");
    var response = await client.PostAsync("https://jsonplaceholder.typicode.com/posts", content);
    AssertStatus(201, response);
    var body = await response.Content.ReadAsStringAsync();
    if (!body.Contains("id")) throw new Exception("Missing id in response");
});

await RunTest("GET /posts/1/comments returns 200", async () =>
{
    var response = await client.GetAsync("https://jsonplaceholder.typicode.com/posts/1/comments");
    AssertStatus(200, response);
});

await RunTest("GET /users returns 200", async () =>
{
    var response = await client.GetAsync("https://jsonplaceholder.typicode.com/users");
    AssertStatus(200, response);
    var body = await response.Content.ReadAsStringAsync();
    if (!body.Contains("email")) throw new Exception("Missing email field in users");
});

await RunTest("GET /posts/99999 returns 404", async () =>
{
    var response = await client.GetAsync("https://jsonplaceholder.typicode.com/posts/99999");
    AssertStatus(404, response);
});

// ─── Results ──────────────────────────────────────────────────────────

Console.WriteLine();
Console.WriteLine("━━━ Smoke Test Results ━━━");

var failures = results.Count(r => !r.Passed);

foreach (var r in results)
{
    var icon = r.Passed ? "PASS" : "FAIL";
    Console.WriteLine($"  [{icon}] {r.Name} — {r.Detail}");
}

Console.WriteLine();
Console.WriteLine($"  {results.Count - failures}/{results.Count} passed");
Console.WriteLine("━━━━━━━━━━━━━━━━━━━━━━━━━");

if (failures > 0)
{
    Console.Error.WriteLine($"[smoke-tests] {failures} test(s) failed");
    Environment.Exit(1);
}

Console.WriteLine("[smoke-tests] All passed");
