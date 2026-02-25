// Pre-test setup script
// Run before a playlist to seed data or configure state

open System
open System.Net.Http
open System.Text

let client = new HttpClient()

let seedPost () = async {
    let json = """{"title":"Seeded by F# script","body":"Setup data","userId":1}"""
    let content = new StringContent(json, Encoding.UTF8, "application/json")
    let! response =
        client.PostAsync("https://jsonplaceholder.typicode.com/posts", content)
        |> Async.AwaitTask
    let! body = response.Content.ReadAsStringAsync() |> Async.AwaitTask
    printfn "[setup] Seeded post: %d — %s" (int response.StatusCode) (body.Substring(0, min 80 body.Length))
}

seedPost () |> Async.RunSynchronously
printfn "[setup] Done"
