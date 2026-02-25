// Generate a summary report after test execution
// Could write to file, post to Slack, etc.

open System
open System.IO

let reportPath =
    Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        ".nap",
        "last-report.txt"
    )

let timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")

let report = $"""
===================================
  Nap Test Report
  {timestamp}
===================================

  Runner:  F# Script
  Status:  Complete
===================================
"""

let dir = Path.GetDirectoryName(reportPath)
if not (Directory.Exists(dir)) then
    Directory.CreateDirectory(dir) |> ignore

File.WriteAllText(reportPath, report)
printfn "[report] Written to %s" reportPath
