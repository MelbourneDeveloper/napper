/// Integration tests for napper-lsp.
/// Every test launches the real binary and talks JSON-RPC over stdio —
/// the exact same protocol VSCode and Zed use.
module Nap.Lsp.Tests.LspIntegrationTests

open System.Text
open System.Text.Json.Nodes
open System.Threading.Tasks
open Xunit
open Nap.Lsp.Tests.LspClient

/// Build the standard initialize params
let private initializeParams () : JsonNode =
    let p = JsonObject()
    p["processId"] <- num 1
    p["capabilities"] <- JsonObject()
    p["rootUri"] <- str "file:///tmp/test-workspace"
    p :> JsonNode

/// Run a full initialize handshake (initialize request + initialized notification)
let private handshake (server: LspServerProcess) : Task<JsonNode> =
    task {
        let! response = server.SendRequest("initialize", 1, initializeParams())
        do! server.SendNotification("initialized", JsonObject())
        return response
    }

/// Build a textDocument/didOpen params object
let private didOpenParams (uri: string) (version: int) (text: string) : JsonNode =
    let p = JsonObject()
    let td = JsonObject()
    td["uri"] <- str uri
    td["languageId"] <- str "nap"
    td["version"] <- num version
    td["text"] <- str text
    p["textDocument"] <- td
    p :> JsonNode

[<Fact>]
let ``initialize handshake returns capabilities`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()

        let! response = server.SendRequest("initialize", 1, initializeParams())

        Assert.NotNull(response["result"])
        Assert.Null(response["error"])

        let result = response["result"]
        Assert.NotNull(result["capabilities"])

        // TextDocumentSync must be Full (1 = Full in LSP spec)
        let sync = result["capabilities"]["textDocumentSync"]
        Assert.NotNull(sync)
        Assert.Equal(1, sync.GetValue<int>())

        // Server info
        let serverInfo = result["serverInfo"]
        Assert.NotNull(serverInfo)
        Assert.Equal("napper-lsp", serverInfo["name"].GetValue<string>())
        Assert.NotNull(serverInfo["version"])

        Assert.True(server.IsRunning, "Server died after initialize")
    }

[<Fact>]
let ``initialized notification accepted without error`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()

        let! _initResponse = server.SendRequest("initialize", 1, initializeParams())
        do! server.SendNotification("initialized", JsonObject())
        do! Task.Delay(200)

        Assert.True(server.IsRunning, "Server died after initialized notification")
    }

[<Fact>]
let ``textDocument/didOpen tracks document`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        let napContent = "[request]\nmethod = GET\nurl = https://example.com\n"
        do! server.SendNotification("textDocument/didOpen", didOpenParams "file:///tmp/test.nap" 1 napContent)
        do! Task.Delay(200)

        Assert.True(server.IsRunning, "Server died after didOpen")
    }

[<Fact>]
let ``textDocument/didChange updates document`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        // Open
        do! server.SendNotification("textDocument/didOpen",
            didOpenParams "file:///tmp/test.nap" 1 "[request]\nmethod = GET\nurl = https://example.com\n")

        // Change
        let changeParams = JsonObject()
        let versionedDoc = JsonObject()
        versionedDoc["uri"] <- str "file:///tmp/test.nap"
        versionedDoc["version"] <- num 2
        changeParams["textDocument"] <- versionedDoc

        let change = JsonObject()
        change["text"] <- str "[request]\nmethod = POST\nurl = https://example.com/users\n"
        let changes = JsonArray()
        changes.Add(change)
        changeParams["contentChanges"] <- changes

        do! server.SendNotification("textDocument/didChange", changeParams)
        do! Task.Delay(200)

        Assert.True(server.IsRunning, "Server died after didChange")
    }

[<Fact>]
let ``textDocument/didClose removes document`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        do! server.SendNotification("textDocument/didOpen",
            didOpenParams "file:///tmp/test.nap" 1 "GET https://example.com\n")

        let closeParams = JsonObject()
        let closeDoc = JsonObject()
        closeDoc["uri"] <- str "file:///tmp/test.nap"
        closeParams["textDocument"] <- closeDoc

        do! server.SendNotification("textDocument/didClose", closeParams)
        do! Task.Delay(200)

        Assert.True(server.IsRunning, "Server died after didClose")
    }

[<Fact>]
let ``shutdown and exit clean lifecycle`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        let! shutdownResponse = server.SendRequest("shutdown", 2)
        // Shutdown returns result (may be null for void) with no error
        Assert.Null(shutdownResponse["error"])
        Assert.True(server.IsRunning, "Server died before exit notification")

        do! server.SendNotification("exit")
        do! Task.Delay(1000)

        Assert.False(server.IsRunning, "Server should have exited after exit notification")
    }

[<Fact>]
let ``malformed request with unknown params does not crash server`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        // Send a valid JSON-RPC request with a bogus method and garbage params
        let bogusParams = JsonObject()
        bogusParams["garbage"] <- str "nonsense"
        bogusParams["moreGarbage"] <- num 42
        let! response = server.SendRequest("textDocument/totallyBogusMethod", 999, bogusParams)

        // Should return an error, not crash
        Assert.NotNull(response["error"])
        Assert.True(server.IsRunning, "Server crashed on malformed request")

        // Verify it still responds to a valid request after the bogus one
        let! shutdownResponse = server.SendRequest("shutdown", 100)
        Assert.Null(shutdownResponse["error"])
    }

[<Fact>]
let ``unknown method returns LSP error`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        let! response = server.SendRequest("textDocument/somethingThatDoesNotExist", 42)

        Assert.NotNull(response["error"])
        Assert.True(server.IsRunning, "Server crashed on unknown method")
    }

// ─── Document Symbols ────────────────────────────────────

let private docSymbolParams (uri: string) : JsonNode =
    let p = JsonObject()
    let td = JsonObject()
    td["uri"] <- str uri
    p["textDocument"] <- td
    p :> JsonNode

[<Fact>]
let ``documentSymbol returns sections for nap file`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        let uri = "file:///tmp/test.nap"
        let content = "[meta]\nname = \"Test\"\n\n[request]\nmethod = GET\nurl = https://example.com\n\n[assert]\nstatus = 200\n"
        do! server.SendNotification("textDocument/didOpen", didOpenParams uri 1 content)

        let! response = server.SendRequest("textDocument/documentSymbol", 10, docSymbolParams uri)

        Assert.Null(response["error"])
        Assert.NotNull(response["result"])

        let symbols = response["result"] :?> JsonArray
        Assert.True(symbols.Count >= 3, $"Expected at least 3 symbols (meta, request, assert), got {symbols.Count}")

        // Check section names
        let names = symbols |> Seq.map (fun s -> s["name"].GetValue<string>()) |> Seq.toList
        Assert.Contains("[meta]", names)
        Assert.Contains("[request]", names)
        Assert.Contains("[assert]", names)
    }

[<Fact>]
let ``documentSymbol returns sections for naplist file`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        let uri = "file:///tmp/test.naplist"
        let content = "[meta]\nname = \"Smoke tests\"\n\n[steps]\nauth/login.nap\nusers/get-user.nap\n"
        do! server.SendNotification("textDocument/didOpen",
            didOpenParams uri 1 content)

        let! response = server.SendRequest("textDocument/documentSymbol", 11, docSymbolParams uri)

        Assert.Null(response["error"])
        Assert.NotNull(response["result"])

        let symbols = response["result"] :?> JsonArray
        Assert.True(symbols.Count >= 2, $"Expected at least 2 symbols (meta, steps), got {symbols.Count}")

        let names = symbols |> Seq.map (fun s -> s["name"].GetValue<string>()) |> Seq.toList
        Assert.Contains("[meta]", names)
        Assert.Contains("[steps]", names)
    }

// ─── Code Lens ───────────────────────────────────────────

let private codeLensParams (uri: string) : JsonNode =
    let p = JsonObject()
    let td = JsonObject()
    td["uri"] <- str uri
    p["textDocument"] <- td
    p :> JsonNode

[<Fact>]
let ``codeLens returns lenses for nap file with request section`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        let uri = "file:///tmp/test.nap"
        let content = "[request]\nmethod = GET\nurl = https://example.com\n"
        do! server.SendNotification("textDocument/didOpen", didOpenParams uri 1 content)

        let! response = server.SendRequest("textDocument/codeLens", 12, codeLensParams uri)

        Assert.Null(response["error"])
        Assert.NotNull(response["result"])

        let lenses = response["result"] :?> JsonArray
        Assert.True(lenses.Count >= 1, $"Expected at least 1 code lens, got {lenses.Count}")

        // First lens should be on line 0 (where [request] is)
        let firstLens = lenses[0]
        Assert.NotNull(firstLens["range"])
        let rangeNode = firstLens["range"]
        let startNode = rangeNode["start"]
        let startLine = startNode["line"].GetValue<int>()
        Assert.Equal(0, startLine)
    }

// ─── Execute Command: requestInfo ────────────────────────

let private executeCommandParams (command: string) (arg: string) : JsonNode =
    let p = JsonObject()
    p["command"] <- str command
    let args = JsonArray()
    args.Add(str arg)
    p["arguments"] <- args
    p :> JsonNode

[<Fact>]
let ``executeCommand requestInfo returns method and URL`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        let uri = "file:///tmp/test.nap"
        let content = "[request]\nmethod = POST\nurl = https://api.example.com/users\n"
        do! server.SendNotification("textDocument/didOpen", didOpenParams uri 1 content)

        let! response = server.SendRequest("workspace/executeCommand", 20,
            executeCommandParams "napper.requestInfo" uri)

        Assert.Null(response["error"])
        Assert.NotNull(response["result"])

        let result = response["result"]
        Assert.Equal("POST", result["method"].GetValue<string>())
        Assert.Equal("https://api.example.com/users", result["url"].GetValue<string>())
    }

// ─── Execute Command: copyCurl ───────────────────────────

[<Fact>]
let ``executeCommand copyCurl returns curl string`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        let uri = "file:///tmp/test.nap"
        let content = "[request]\nmethod = GET\nurl = https://example.com/api\n"
        do! server.SendNotification("textDocument/didOpen", didOpenParams uri 1 content)

        let! response = server.SendRequest("workspace/executeCommand", 21,
            executeCommandParams "napper.copyCurl" uri)

        Assert.Null(response["error"])
        Assert.NotNull(response["result"])

        let curl = response["result"].GetValue<string>()
        Assert.Contains("curl", curl)
        Assert.Contains("GET", curl)
        Assert.Contains("https://example.com/api", curl)
    }

// ─── Execute Command: listEnvironments ───────────────────

[<Fact>]
let ``executeCommand listEnvironments returns env names`` () : Task =
    task {
        use server = new LspServerProcess()
        server.Start()
        let! _ = handshake server

        // Create temp .napenv files
        let tmpDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"napper-lsp-test-{System.Guid.NewGuid()}")
        System.IO.Directory.CreateDirectory(tmpDir) |> ignore
        System.IO.File.WriteAllText(System.IO.Path.Combine(tmpDir, ".napenv"), "baseUrl = https://example.com")
        System.IO.File.WriteAllText(System.IO.Path.Combine(tmpDir, ".napenv.staging"), "baseUrl = https://staging.example.com")
        System.IO.File.WriteAllText(System.IO.Path.Combine(tmpDir, ".napenv.production"), "baseUrl = https://prod.example.com")
        System.IO.File.WriteAllText(System.IO.Path.Combine(tmpDir, ".napenv.local"), "secret = hunter2")

        try
            let rootUri = $"file://{tmpDir}"
            let! response = server.SendRequest("workspace/executeCommand", 22,
                executeCommandParams "napper.listEnvironments" rootUri)

            Assert.Null(response["error"])
            Assert.NotNull(response["result"])

            let envs = response["result"] :?> JsonArray
            let envNames = envs |> Seq.map (fun e -> e.GetValue<string>()) |> Seq.toList

            // Should find staging and production, NOT base (.napenv) or local (.napenv.local)
            Assert.Contains("staging", envNames)
            Assert.Contains("production", envNames)
            Assert.DoesNotContain("local", envNames)
            Assert.Equal(2, envs.Count)
        finally
            System.IO.Directory.Delete(tmpDir, true)
    }
