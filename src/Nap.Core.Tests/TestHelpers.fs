module TestHelpers

open System
open System.Diagnostics
open System.IO

// --- Constants ---

[<Literal>]
let NapperBinaryName = "napper"

// --- CLI runner: uses the installed binary, never recompiles ---

let private findNapper () : string =
    let localBin =
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".local",
            "bin",
            NapperBinaryName
        )

    if File.Exists localBin then localBin else NapperBinaryName

let runCli (args: string) (cwd: string) : int * string * string =
    let binary = findNapper ()
    let psi = ProcessStartInfo()
    psi.FileName <- binary
    psi.Arguments <- args
    psi.WorkingDirectory <- cwd
    psi.RedirectStandardOutput <- true
    psi.RedirectStandardError <- true
    psi.UseShellExecute <- false
    psi.CreateNoWindow <- true
    use proc = Process.Start(psi)
    let stdout = proc.StandardOutput.ReadToEnd()
    let stderr = proc.StandardError.ReadToEnd()
    proc.WaitForExit()
    proc.ExitCode, stdout, stderr

// --- Temp directory helpers ---

let createTempDir (prefix: string) : string =
    let dir = Path.Combine(Path.GetTempPath(), $"{prefix}-{Guid.NewGuid():N}")
    Directory.CreateDirectory(dir) |> ignore
    dir

let cleanupDir (dir: string) : unit =
    if Directory.Exists(dir) then
        Directory.Delete(dir, true)
