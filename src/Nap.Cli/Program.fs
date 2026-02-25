open System
open System.IO
open Nap.Core

/// Parse CLI arguments into a structured form
type CliArgs = {
    Command : string        // "run", "check", "help"
    File    : string option
    Env     : string option
    Vars    : Map<string, string>
    Output  : string        // "pretty", "junit", "json", "ndjson"
    Verbose : bool
}

let parseArgs (argv: string array) : CliArgs =
    let mutable command = "help"
    let mutable file = None
    let mutable env = None
    let mutable vars = Map.empty
    let mutable output = "pretty"
    let mutable verbose = false
    let mutable i = 0

    if argv.Length > 0 then
        command <- argv[0]
        i <- 1

    while i < argv.Length do
        match argv[i] with
        | "--env" when i + 1 < argv.Length ->
            env <- Some argv[i + 1]
            i <- i + 2
        | "--var" when i + 1 < argv.Length ->
            let parts = argv[i + 1].Split([|'='|], 2)
            if parts.Length = 2 then
                vars <- vars |> Map.add (parts[0].Trim()) (parts[1].Trim())
            i <- i + 2
        | "--output" when i + 1 < argv.Length ->
            output <- argv[i + 1]
            i <- i + 2
        | "--verbose" ->
            verbose <- true
            i <- i + 1
        | arg when not (arg.StartsWith "--") && file.IsNone ->
            file <- Some arg
            i <- i + 1
        | _ ->
            i <- i + 1

    { Command = command; File = file; Env = env; Vars = vars; Output = output; Verbose = verbose }

let printHelp () =
    printfn "Nap — API testing tool"
    printfn ""
    printfn "Usage:"
    printfn "  nap run <file|folder>     Run a .nap file, .naplist playlist, or folder"
    printfn "  nap check <file>          Validate a .nap or .naplist file"
    printfn "  nap help                  Show this help"
    printfn ""
    printfn "Options:"
    printfn "  --env <name>              Environment name (loads .napenv.<name>)"
    printfn "  --var <key=value>         Variable override (repeatable)"
    printfn "  --output <format>         Output: pretty (default), junit, json, ndjson"
    printfn "  --verbose                 Enable debug-level logging"

let runFile (args: CliArgs) : int =
    match args.File with
    | None ->
        eprintfn "Error: no file specified"
        printHelp ()
        2
    | Some filePath ->
        let filePath = Path.GetFullPath(filePath)
        Logger.info $"Processing: {filePath}"

        if not (File.Exists filePath) && not (Directory.Exists filePath) then
            Logger.error $"File not found: {filePath}"
            eprintfn "Error: %s not found" filePath
            2
        elif Directory.Exists filePath then
            // Run all .nap files in directory
            let files = Directory.GetFiles(filePath, "*.nap") |> Array.sort
            if files.Length = 0 then
                eprintfn "No .nap files found in %s" filePath
                2
            else
                match args.Output with
                | "ndjson" ->
                    let mutable allPassed = true
                    for f in files do
                        let r = Runner.runNapFile f args.Vars args.Env |> Async.RunSynchronously
                        if not r.Passed then allPassed <- false
                        printfn "%s" (Output.formatJson r)
                        Console.Out.Flush()
                    if allPassed then 0 else 1
                | _ ->
                    let results =
                        files
                        |> Array.map (fun f -> Runner.runNapFile f args.Vars args.Env |> Async.RunSynchronously)
                        |> Array.toList

                    match args.Output with
                    | "junit" -> printf "%s" (Output.formatJUnit results)
                    | "json" -> printf "%s" (Output.formatJsonArray results)
                    | _ ->
                        for r in results do
                            printf "%s" (Output.formatPretty r)
                        printf "%s" (Output.formatSummary results)

                    if results |> List.forall (fun r -> r.Passed) then 0 else 1

        elif filePath.EndsWith ".naplist" then
            let content = File.ReadAllText(filePath)
            match Parser.parseNapList content with
            | Result.Error msg ->
                Logger.error $"Playlist parse error: {msg}"
                eprintfn "Error parsing playlist: %s" msg
                2
            | Result.Ok playlist ->
                Logger.info $"Playlist loaded: {playlist.Steps.Length} steps"
                let playlistDir = Path.GetDirectoryName(filePath)
                let playlistEnv = playlist.Env |> Option.orElse args.Env
                let allVars =
                    let mutable v = playlist.Vars
                    for kv in args.Vars do
                        v <- v |> Map.add kv.Key kv.Value
                    v

                let rec runSteps (steps: PlaylistStep list) (vars: Map<string, string>) (baseDir: string) : NapResult list =
                    steps |> List.collect (fun step ->
                        match step with
                        | NapFileStep path ->
                            let fullPath = Path.GetFullPath(Path.Combine(baseDir, path))
                            [Runner.runNapFile fullPath vars playlistEnv |> Async.RunSynchronously]
                        | FolderRef path ->
                            let fullPath = Path.GetFullPath(Path.Combine(baseDir, path))
                            Directory.GetFiles(fullPath, "*.nap")
                            |> Array.sort
                            |> Array.map (fun f -> Runner.runNapFile f vars playlistEnv |> Async.RunSynchronously)
                            |> Array.toList
                        | PlaylistRef path ->
                            let fullPath = Path.GetFullPath(Path.Combine(baseDir, path))
                            let nestedDir = Path.GetDirectoryName fullPath
                            let nestedContent = File.ReadAllText(fullPath)
                            match Parser.parseNapList nestedContent with
                            | Result.Ok nested -> runSteps nested.Steps vars nestedDir
                            | Result.Error _ -> []
                        | ScriptStep path ->
                            let fullPath = Path.GetFullPath(Path.Combine(baseDir, path))
                            [Runner.runScript fullPath |> Async.RunSynchronously]
                    )

                match args.Output with
                | "ndjson" ->
                    let rec streamSteps (steps: PlaylistStep list) (vars: Map<string, string>) (baseDir: string) : bool =
                        steps |> List.forall (fun step ->
                            match step with
                            | NapFileStep path ->
                                let fullPath = Path.GetFullPath(Path.Combine(baseDir, path))
                                let r = Runner.runNapFile fullPath vars playlistEnv |> Async.RunSynchronously
                                printfn "%s" (Output.formatJson r)
                                Console.Out.Flush()
                                r.Passed
                            | FolderRef path ->
                                let fullPath = Path.GetFullPath(Path.Combine(baseDir, path))
                                Directory.GetFiles(fullPath, "*.nap")
                                |> Array.sort
                                |> Array.forall (fun f ->
                                    let r = Runner.runNapFile f vars playlistEnv |> Async.RunSynchronously
                                    printfn "%s" (Output.formatJson r)
                                    Console.Out.Flush()
                                    r.Passed)
                            | PlaylistRef path ->
                                let fullPath = Path.GetFullPath(Path.Combine(baseDir, path))
                                let nestedDir = Path.GetDirectoryName fullPath
                                let nestedContent = File.ReadAllText(fullPath)
                                match Parser.parseNapList nestedContent with
                                | Result.Ok nested -> streamSteps nested.Steps vars nestedDir
                                | Result.Error _ -> false
                            | ScriptStep path ->
                                let fullPath = Path.GetFullPath(Path.Combine(baseDir, path))
                                let r = Runner.runScript fullPath |> Async.RunSynchronously
                                printfn "%s" (Output.formatJson r)
                                Console.Out.Flush()
                                r.Passed
                        )
                    if streamSteps playlist.Steps allVars playlistDir then 0 else 1
                | _ ->
                    let results = runSteps playlist.Steps allVars playlistDir

                    match args.Output with
                    | "junit" -> printf "%s" (Output.formatJUnit results)
                    | "json" -> printf "%s" (Output.formatJsonArray results)
                    | _ ->
                        for r in results do
                            printf "%s" (Output.formatPretty r)
                        printf "%s" (Output.formatSummary results)

                    if results |> List.forall (fun r -> r.Passed) then 0 else 1
        else
            // Single .nap file
            let result = Runner.runNapFile filePath args.Vars args.Env |> Async.RunSynchronously

            match args.Output with
            | "junit" -> printf "%s" (Output.formatJUnit [result])
            | "json" | "ndjson" -> printf "%s" (Output.formatJson result)
            | _ -> printf "%s" (Output.formatPretty result)

            if result.Passed then 0 else 1

let checkFile (args: CliArgs) : int =
    match args.File with
    | None ->
        eprintfn "Error: no file specified"
        2
    | Some file ->
        let filePath = Path.GetFullPath(file)
        if not (File.Exists filePath) then
            eprintfn "Error: %s not found" filePath
            2
        else
            let content = File.ReadAllText(filePath)
            let result =
                if filePath.EndsWith ".naplist"
                then Parser.parseNapList content |> Result.map ignore
                else Parser.parseNapFile content |> Result.map ignore
            match result with
            | Result.Ok _ ->
                printfn "\x1b[32m✓\x1b[0m %s is valid" (Path.GetFileName filePath)
                0
            | Result.Error msg ->
                eprintfn "\x1b[31m✗\x1b[0m %s" (Path.GetFileName filePath)
                eprintfn "  %s" msg
                1

[<EntryPoint>]
let main argv =
    let args = parseArgs argv
    Logger.init args.Verbose
    let joinedArgs = argv |> String.concat " "
    Logger.info $"CLI started: args={joinedArgs} cwd={Directory.GetCurrentDirectory()}"
    let exitCode =
        match args.Command with
        | "run" -> runFile args
        | "check" -> checkFile args
        | "help" | "--help" | "-h" ->
            printHelp ()
            0
        | other ->
            eprintfn "Unknown command: %s" other
            printHelp ()
            2
    Logger.info $"CLI exiting with code {exitCode}"
    Logger.close ()
    exitCode
