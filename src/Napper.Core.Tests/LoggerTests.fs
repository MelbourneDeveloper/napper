module LoggerTests

open System
open System.IO
open Xunit
open Napper.Core

// Logger uses global mutable state — tests must run sequentially
[<CollectionDefinition("Logger", DisableParallelization = true)>]
type LoggerCollection() = class end

[<Collection("Logger")>]
type LoggerTests() =

    let withLogger (verbose: bool) (action: unit -> unit) : string =
        Logger.init verbose
        action ()
        Logger.close ()
        let dir = AppContext.BaseDirectory
        let logFiles = Directory.GetFiles(dir, "napper-*.log") |> Array.sortDescending
        Assert.True(logFiles.Length >= 1, "Must create at least one log file")
        let content = File.ReadAllText(logFiles[0])
        File.Delete(logFiles[0])
        content

    [<Fact>]
    member _.``init creates log file in base directory``() =
        let content = withLogger false (fun () -> Logger.info "test init")
        Assert.Contains("test init", content)

    [<Fact>]
    member _.``info writes INFO level``() =
        let content = withLogger false (fun () -> Logger.info "info message")
        Assert.Contains("[INFO]", content)
        Assert.Contains("info message", content)

    [<Fact>]
    member _.``warn writes WARN level``() =
        let content = withLogger false (fun () -> Logger.warn "warn message")
        Assert.Contains("[WARN]", content)
        Assert.Contains("warn message", content)

    [<Fact>]
    member _.``error writes ERROR level``() =
        let content = withLogger false (fun () -> Logger.error "error message")
        Assert.Contains("[ERROR]", content)
        Assert.Contains("error message", content)

    [<Fact>]
    member _.``debug is suppressed when not verbose``() =
        let content =
            withLogger false (fun () ->
                Logger.debug "should be hidden"
                Logger.info "should be visible")

        Assert.DoesNotContain("should be hidden", content)
        Assert.Contains("should be visible", content)

    [<Fact>]
    member _.``debug is written when verbose``() =
        let content = withLogger true (fun () -> Logger.debug "debug visible")
        Assert.Contains("[DEBUG]", content)
        Assert.Contains("debug visible", content)

    [<Fact>]
    member _.``log entries have ISO timestamp``() =
        let content = withLogger false (fun () -> Logger.info "timestamp check")
        Assert.Contains("[20", content)
        Assert.Contains("T", content)
        Assert.Contains("Z]", content)

    [<Fact>]
    member _.``close flushes and allows re-init``() =
        let content1 = withLogger false (fun () -> Logger.info "first session")
        Assert.Contains("first session", content1)
        let content2 = withLogger false (fun () -> Logger.info "second session")
        Assert.Contains("second session", content2)

    [<Fact>]
    member _.``multiple log entries in one session``() =
        let content =
            withLogger false (fun () ->
                Logger.info "line one"
                Logger.warn "line two"
                Logger.error "line three")

        Assert.Contains("line one", content)
        Assert.Contains("line two", content)
        Assert.Contains("line three", content)
