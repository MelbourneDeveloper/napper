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
    let home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)

    let dotnetTool =
        Path.Combine(home, ".dotnet", "tools", NapperBinaryName)

    let localBin =
        Path.Combine(home, ".local", "bin", NapperBinaryName)

    if File.Exists dotnetTool then dotnetTool
    elif File.Exists localBin then localBin
    else NapperBinaryName

let runCli (args: string) (cwd: string) : int * string * string =
    let binary = findNapper ()
    let sw = Stopwatch.StartNew()
    log $"[test] napper %s{args}"
    let psi = ProcessStartInfo()
    psi.FileName <- binary
    psi.Arguments <- args
    psi.WorkingDirectory <- cwd
    psi.RedirectStandardOutput <- true
    psi.RedirectStandardError <- true
    psi.RedirectStandardInput <- true
    psi.UseShellExecute <- false
    psi.CreateNoWindow <- true
    use proc = Process.Start(psi)
    proc.StandardInput.Close()
    let timeoutMs = 5_000
    let stdoutTask = proc.StandardOutput.ReadToEndAsync()
    let stderrTask = proc.StandardError.ReadToEndAsync()

    if not (proc.WaitForExit(timeoutMs)) then
        proc.Kill(true)
        sw.Stop()
        log $"[test] TIMEOUT after %d{timeoutMs}ms | napper %s{args}"
        failwith $"napper process timed out after %d{timeoutMs}ms: napper %s{args}"

    let stdout = stdoutTask.Result
    let stderr = stderrTask.Result
    sw.Stop()
    log $"[test] napper %s{args} | exit=%d{proc.ExitCode} elapsed=%d{sw.ElapsedMilliseconds}ms"
    proc.ExitCode, stdout, stderr

// --- Temp directory helpers ---

let createTempDir (prefix: string) : string =
    let dir = Path.Combine(Path.GetTempPath(), $"{prefix}-{Guid.NewGuid():N}")
    Directory.CreateDirectory(dir) |> ignore
    dir

let cleanupDir (dir: string) : unit =
    if Directory.Exists(dir) then
        Directory.Delete(dir, true)
