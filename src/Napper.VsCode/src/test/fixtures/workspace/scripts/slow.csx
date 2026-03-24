// Script that takes a few seconds to complete
Console.WriteLine("[slow-csx] Starting slow operation");
await Task.Delay(3000);
Console.WriteLine("[slow-csx] Slow operation complete");
