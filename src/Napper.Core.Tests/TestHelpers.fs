module TestHelpers

open System
open System.Diagnostics
open System.IO

// --- Constants ---

[<Literal>]
let NapperBinaryName = "napper"

// --- CLI runner: uses the installed binary, never recompiles ---

let private logLock = obj ()

let log (msg: string) =
    lock logLock (fun () ->
        Console.Error.WriteLine(msg)
        Console.Error.Flush())

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
    let sw = Stopwatch.StartNew()
    log $"[runCli] START %s{args}"
    let psi = ProcessStartInfo()
    psi.FileName <- binary
    psi.Arguments <- args
    psi.WorkingDirectory <- cwd
    psi.RedirectStandardOutput <- true
    psi.RedirectStandardError <- true
    psi.UseShellExecute <- false
    psi.CreateNoWindow <- true
    use proc = Process.Start(psi)
    let stderrTask = proc.StandardError.ReadToEndAsync()
    let stdout = proc.StandardOutput.ReadToEnd()
    let stderr = stderrTask.Result
    proc.WaitForExit()
    sw.Stop()
    log $"[runCli] DONE  %s{args} exit=%d{proc.ExitCode} elapsed=%d{sw.ElapsedMilliseconds}ms"
    proc.ExitCode, stdout, stderr

// --- Temp directory helpers ---

let createTempDir (prefix: string) : string =
    let dir = Path.Combine(Path.GetTempPath(), $"{prefix}-{Guid.NewGuid():N}")
    Directory.CreateDirectory(dir) |> ignore
    dir

let cleanupDir (dir: string) : unit =
    if Directory.Exists(dir) then
        Directory.Delete(dir, true)
