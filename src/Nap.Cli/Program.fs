open System
open System.IO
open Nap.Core

/// Parse CLI arguments into a structured form
type CliArgs = {
    Command    : string        // "run", "check", "generate", "help"
    SubCommand : string option // e.g. "openapi" for "generate openapi"
    File       : string option
    Env        : string option
    Vars       : Map<string, string>
    Output     : string        // "pretty", "junit", "json", "ndjson"
    OutputDir  : string option // --output-dir for generate command
    Verbose    : bool
}

let parseArgs (argv: string array) : CliArgs =
    let mutable command = "help"
    let mutable subCommand = None
    let mutable file = None
    let mutable env = None
    let mutable vars = Map.empty
    let mutable output = "pretty"
    let mutable outputDir = None
    let mutable verbose = false
    let mutable i = 0

    if argv.Length > 0 then
        command <- argv[0]
        i <- 1

    // For "generate openapi", consume the subcommand
    if command = "generate" && i < argv.Length && not (argv[i].StartsWith "--") then
        subCommand <- Some argv[i]
        i <- i + 1

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
        | "--output-dir" when i + 1 < argv.Length ->
            outputDir <- Some argv[i + 1]
            i <- i + 2
        | "--verbose" ->
            verbose <- true
            i <- i + 1
        | arg when not (arg.StartsWith "--") && file.IsNone ->
            file <- Some arg
            i <- i + 1
        | _ ->
            i <- i + 1

    { Command = command; SubCommand = subCommand; File = file; Env = env
      Vars = vars; Output = output; OutputDir = outputDir; Verbose = verbose }

let printHelp () =
    printfn "Nap — API testing tool"
    printfn ""
    printfn "Usage:"
    printfn "  nap run <file|folder>                     Run a .nap file, .naplist playlist, or folder"
    printfn "  nap check <file>                          Validate a .nap or .naplist file"
    printfn "  nap generate openapi <spec> --output-dir <dir>  Generate .nap files from OpenAPI spec"
    printfn "  nap help                                  Show this help"
    printfn ""
    printfn "Options:"
    printfn "  --env <name>              Environment name (loads .napenv.<name>)"
    printfn "  --var <key=value>         Variable override (repeatable)"
    printfn "  --output <format>         Output: pretty (default), junit, json, ndjson"
    printfn "  --output-dir <dir>        Output directory for generate command"
    printfn "  --verbose                 Enable debug-level logging"

/// Print result as ndjson and return whether it passed
let private printNdjson (r: NapResult) : bool =
    printfn "%s" (Output.formatJson r)
    Console.Out.Flush()
    r.Passed

/// Format and print results, return exit code
let private formatAndExit (output: string) (results: NapResult list) : int =
    match output with
    | "junit" -> printf "%s" (Output.formatJUnit results)
    | "json" -> printf "%s" (Output.formatJsonArray results)
    | _ ->
        for r in results do
            printf "%s" (Output.formatPretty r)
        printf "%s" (Output.formatSummary results)
    if results |> List.forall (fun r -> r.Passed) then 0 else 1

/// Run all .nap files in a directory
let private runDirectory (args: CliArgs) (dirPath: string) : int =
    let files = Directory.GetFiles(dirPath, "*.nap") |> Array.sort
    if files.Length = 0 then
        eprintfn "No .nap files found in %s" dirPath
        2
    elif args.Output = "ndjson" then
        let passed = files |> Array.forall (fun f ->
            Runner.runNapFile f args.Vars args.Env |> Async.RunSynchronously |> printNdjson)
        if passed then 0 else 1
    else
        files
        |> Array.map (fun f -> Runner.runNapFile f args.Vars args.Env |> Async.RunSynchronously)
        |> Array.toList
        |> formatAndExit args.Output

/// Merge playlist vars with CLI overrides
let private mergeVars (playlist: NapPlaylist) (cliVars: Map<string, string>) : Map<string, string> =
    let mutable v = playlist.Vars
    for kv in cliVars do
        v <- v |> Map.add kv.Key kv.Value
    v

/// Collect results from playlist steps recursively
let rec private collectSteps (steps: PlaylistStep list) (vars: Map<string, string>) (baseDir: string) (env: string option) : NapResult list =
    steps |> List.collect (fun step ->
        let full p = Path.GetFullPath(Path.Combine(baseDir, p))
        match step with
        | NapFileStep p ->
            [Runner.runNapFile (full p) vars env |> Async.RunSynchronously]
        | FolderRef p ->
            Directory.GetFiles(full p, "*.nap")
            |> Array.sort
            |> Array.map (fun f -> Runner.runNapFile f vars env |> Async.RunSynchronously)
            |> Array.toList
        | PlaylistRef p ->
            let fp = full p
            match File.ReadAllText(fp) |> Parser.parseNapList with
            | Result.Ok nested -> collectSteps nested.Steps vars (Path.GetDirectoryName fp) env
            | Result.Error _ -> []
        | ScriptStep p ->
            [Runner.runScript (full p) |> Async.RunSynchronously]
    )

/// Stream playlist steps as ndjson, return whether all passed
let rec private streamSteps (steps: PlaylistStep list) (vars: Map<string, string>) (baseDir: string) (env: string option) : bool =
    steps |> List.forall (fun step ->
        let full p = Path.GetFullPath(Path.Combine(baseDir, p))
        match step with
        | NapFileStep p ->
            Runner.runNapFile (full p) vars env |> Async.RunSynchronously |> printNdjson
        | FolderRef p ->
            Directory.GetFiles(full p, "*.nap")
            |> Array.sort
            |> Array.forall (fun f -> Runner.runNapFile f vars env |> Async.RunSynchronously |> printNdjson)
        | PlaylistRef p ->
            let fp = full p
            match File.ReadAllText(fp) |> Parser.parseNapList with
            | Result.Ok nested -> streamSteps nested.Steps vars (Path.GetDirectoryName fp) env
            | Result.Error _ -> false
        | ScriptStep p ->
            Runner.runScript (full p) |> Async.RunSynchronously |> printNdjson
    )

/// Run a .naplist playlist
let private runPlaylist (args: CliArgs) (filePath: string) : int =
    let content = File.ReadAllText(filePath)
    match Parser.parseNapList content with
    | Result.Error msg ->
        Logger.error $"Playlist parse error: {msg}"
        eprintfn "Error parsing playlist: %s" msg
        2
    | Result.Ok playlist ->
        Logger.info $"Playlist loaded: {playlist.Steps.Length} steps"
        let dir = Path.GetDirectoryName(filePath)
        let env = playlist.Env |> Option.orElse args.Env
        let vars = mergeVars playlist args.Vars
        match args.Output with
        | "ndjson" -> if streamSteps playlist.Steps vars dir env then 0 else 1
        | _ -> collectSteps playlist.Steps vars dir env |> formatAndExit args.Output

/// Run a single .nap file
let private runSingleNap (args: CliArgs) (filePath: string) : int =
    let result = Runner.runNapFile filePath args.Vars args.Env |> Async.RunSynchronously
    match args.Output with
    | "junit" -> printf "%s" (Output.formatJUnit [result])
    | "json" | "ndjson" -> printf "%s" (Output.formatJson result)
    | _ -> printf "%s" (Output.formatPretty result)
    if result.Passed then 0 else 1

let runFile (args: CliArgs) : int =
    match args.File with
    | None ->
        eprintfn "Error: no file specified"
        printHelp ()
        2
    | Some f ->
        let filePath = Path.GetFullPath(f)
        Logger.info $"Processing: {filePath}"
        if not (File.Exists filePath) && not (Directory.Exists filePath) then
            Logger.error $"File not found: {filePath}"
            eprintfn "Error: %s not found" filePath
            2
        elif Directory.Exists filePath then runDirectory args filePath
        elif filePath.EndsWith ".naplist" then runPlaylist args filePath
        else runSingleNap args filePath

let private writeGenerated (outDir: string) (result: OpenApiGenerator.GenerationResult) : unit =
    let writeFile (f: OpenApiGenerator.GeneratedFile) =
        let fullPath = Path.Combine(outDir, f.FileName)
        let dir = Path.GetDirectoryName(fullPath)
        if not (Directory.Exists dir) then
            Directory.CreateDirectory(dir) |> ignore
        File.WriteAllText(fullPath, f.Content)
    writeFile result.Environment
    for nap in result.NapFiles do
        writeFile nap
    writeFile result.Playlist

/// Display generation results
let private displayGenerated (output: string) (generated: OpenApiGenerator.GenerationResult) (outDir: string) : unit =
    match output with
    | "json" ->
        printfn "{\"files\":%d,\"playlist\":\"%s\"}" generated.NapFiles.Length generated.Playlist.FileName
    | _ ->
        printfn "Generated %d .nap files from OpenAPI spec" generated.NapFiles.Length
        printfn "  Playlist: %s" generated.Playlist.FileName
        printfn "  Environment: %s" generated.Environment.FileName
        printfn "  Output: %s" outDir

let generateOpenApi (args: CliArgs) : int =
    match args.File with
    | None ->
        eprintfn "Error: no spec file specified"
        eprintfn "Usage: nap generate openapi <spec.json> --output-dir <dir>"
        2
    | Some specFile ->
        let specPath = Path.GetFullPath(specFile)
        if not (File.Exists specPath) then
            eprintfn "Error: %s not found" specPath
            2
        else
            let outDir = args.OutputDir |> Option.map Path.GetFullPath |> Option.defaultWith (fun () -> Path.GetDirectoryName(specPath))
            match File.ReadAllText(specPath) |> OpenApiGenerator.generate with
            | Error msg -> eprintfn "Error: %s" msg; 1
            | Ok generated ->
                if not (Directory.Exists outDir) then Directory.CreateDirectory(outDir) |> ignore
                writeGenerated outDir generated
                displayGenerated args.Output generated outDir
                0

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
        | "generate" ->
            match args.SubCommand with
            | Some "openapi" -> generateOpenApi args
            | Some other ->
                eprintfn "Unknown generate target: %s" other
                2
            | None ->
                eprintfn "Usage: nap generate openapi <spec.json> --output-dir <dir>"
                2
        | "version" | "--version" ->
            let v = Reflection.Assembly.GetExecutingAssembly().GetName().Version
            printfn "%d.%d.%d" v.Major v.Minor v.Build
            0
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
