module Nap.Core.Logger

open System
open System.IO

/// Log severity levels — DU ordering gives natural comparison
type LogLevel =
    | Debug
    | Info
    | Warn
    | Error

let private levelTag (level: LogLevel) : string =
    match level with
    | Debug -> "DEBUG"
    | Info  -> "INFO"
    | Warn  -> "WARN"
    | Error -> "ERROR"

let mutable private minLevel : LogLevel = Info
let mutable private writer : StreamWriter option = None

let private formatLine (level: LogLevel) (message: string) : string =
    let ts = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $"[{ts}] [{levelTag level}] {message}"

/// Initialize the logger: creates timestamped log file in binary dir
let init (verbose: bool) : unit =
    minLevel <- if verbose then Debug else Info
    let dir = AppContext.BaseDirectory
    let ts = DateTime.UtcNow.ToString("yyyy-MM-ddTHH-mm-ss")
    let fileName = $"napper-{ts}.log"
    let filePath = Path.Combine(dir, fileName)
    let sw = new StreamWriter(filePath, append = true, AutoFlush = true)
    writer <- Some sw

/// Write a log entry (filtered by minLevel)
let log (level: LogLevel) (message: string) : unit =
    if level >= minLevel then
        match writer with
        | Some sw -> sw.WriteLine(formatLine level message)
        | None -> ()

let debug msg = log Debug msg
let info  msg = log Info msg
let warn  msg = log Warn msg
let error msg = log Error msg

/// Flush and close the log file
let close () : unit =
    match writer with
    | Some sw ->
        sw.Flush()
        sw.Close()
        writer <- None
    | None -> ()
