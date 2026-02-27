// Pre-test setup script (C#)
// Run before a playlist to seed data or configure state

using System.Net.Http;
using System.Text;

var client = new HttpClient();

var json = @"{""title"":""Seeded by C# script"",""body"":""Setup data"",""userId"":1}";
var content = new StringContent(json, Encoding.UTF8, "application/json");
var response = await client.PostAsync("https://jsonplaceholder.typicode.com/posts", content);
var body = await response.Content.ReadAsStringAsync();
Console.WriteLine($"[setup] Seeded post: {(int)response.StatusCode} — {body[..Math.Min(80, body.Length)]}");
Console.WriteLine("[setup] Done");
