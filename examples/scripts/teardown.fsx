// Post-test teardown script
// Clean up after a playlist run

open System

printfn "[teardown] Cleaning up test artifacts..."
printfn "[teardown] Timestamp: %s" (DateTime.UtcNow.ToString("o"))
printfn "[teardown] Done"
