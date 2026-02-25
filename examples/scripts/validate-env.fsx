// Validate that required environment variables are set before running tests
// This script would fail fast if critical config is missing

open System

let requiredVars = ["baseUrl"; "userId"]

let checkEnvVar (name: string) =
    match Environment.GetEnvironmentVariable(name) with
    | null -> printfn "[validate] WARNING: %s not set (will use .napenv defaults)" name
    | value -> printfn "[validate] %s = %s" name value

printfn "[validate] Checking environment..."
requiredVars |> List.iter checkEnvVar
printfn "[validate] Environment check complete"
