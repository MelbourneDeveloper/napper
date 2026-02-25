module Nap.Core.Environment

open System
open System.IO
/// Parse a .napenv file (simple key = value format, TOML-like)
let parseEnvFile (content: string) : Map<string, string> =
    content.Split([|'\n'; '\r'|], StringSplitOptions.RemoveEmptyEntries)
    |> Array.choose (fun line ->
        let line = line.Trim()
        if line = "" || line.StartsWith "#" then None
        elif line.Contains "=" then
            let parts = line.Split([|'='|], 2)
            Some (parts.[0].Trim(), parts.[1].Trim().Trim('"'))
        else None
    )
    |> Map.ofArray

let private mergeInto (source: Map<string, string>) (target: Map<string, string>) =
    source |> Map.fold (fun acc k v -> Map.add k v acc) target

/// Load environment variables from .napenv files
/// Resolution order (highest wins):
/// 1. CLI --var flags
/// 2. .napenv.local
/// 3. Named environment file (.napenv.{name})
/// 4. Base .napenv
/// 5. [vars] block in the .nap file
let loadEnvironment (dir: string) (envName: string option) (cliVars: Map<string, string>) (fileVars: Map<string, string>) : Map<string, string> =
    let readIfExists path =
        if File.Exists path then
            File.ReadAllText path |> parseEnvFile
        else Map.empty

    let baseEnv = readIfExists (Path.Combine(dir, ".napenv"))
    Logger.debug $"Loaded .napenv: {baseEnv.Count} vars"
    let namedEnv =
        match envName with
        | Some name ->
            let env = readIfExists (Path.Combine(dir, $".napenv.{name}"))
            Logger.debug $"Loaded .napenv.{name}: {env.Count} vars"
            env
        | None -> Map.empty
    let localEnv = readIfExists (Path.Combine(dir, ".napenv.local"))
    Logger.debug $"Loaded .napenv.local: {localEnv.Count} vars"

    fileVars
    |> mergeInto baseEnv
    |> mergeInto namedEnv
    |> mergeInto localEnv
    |> mergeInto cliVars

/// Resolve {{variable}} placeholders in a string using FParsec-based parsing
let resolveVars (vars: Map<string, string>) (input: string) : string =
    let sb = System.Text.StringBuilder()
    let mutable i = 0
    while i < input.Length do
        if i + 3 < input.Length && input.[i] = '{' && input.[i + 1] = '{' then
            let start = i + 2
            let mutable j = start
            while j < input.Length && input.[j] <> '}' && Char.IsLetterOrDigit(input.[j]) || input.[j] = '_' do
                j <- j + 1
            if j + 1 < input.Length && input.[j] = '}' && input.[j + 1] = '}' && j > start then
                let key = input.Substring(start, j - start)
                match Map.tryFind key vars with
                | Some v -> sb.Append(v) |> ignore
                | None -> sb.Append(input, i, j + 2 - i) |> ignore
                i <- j + 2
            else
                sb.Append(input.[i]) |> ignore
                i <- i + 1
        else
            sb.Append(input.[i]) |> ignore
            i <- i + 1
    sb.ToString()

/// Resolve all variables in a NapFile's request
let resolveNapFile (vars: Map<string, string>) (napFile: NapFile) : NapFile =
    let resolve = resolveVars vars
    { napFile with
        Request = {
            napFile.Request with
                Url = resolve napFile.Request.Url
                Headers = napFile.Request.Headers |> Map.map (fun _ v -> resolve v)
                Body =
                    napFile.Request.Body
                    |> Option.map (fun b -> { b with Content = resolve b.Content })
        }
        Assertions =
            napFile.Assertions |> List.map (fun a ->
                { a with
                    Op =
                        match a.Op with
                        | Equals v -> Equals (resolve v)
                        | Contains v -> Contains (resolve v)
                        | Matches v -> Matches (resolve v)
                        | LessThan v -> LessThan (resolve v)
                        | GreaterThan v -> GreaterThan (resolve v)
                        | Exists -> Exists
                }
            )
    }
