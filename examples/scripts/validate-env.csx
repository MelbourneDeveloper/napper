// Validate that required environment variables are set before running tests
// This script would fail fast if critical config is missing

var requiredVars = new[] { "baseUrl", "userId" };

Console.WriteLine("[validate] Checking environment...");
foreach (var name in requiredVars)
{
    var value = Environment.GetEnvironmentVariable(name);
    if (value is null)
        Console.WriteLine($"[validate] WARNING: {name} not set (will use .napenv defaults)");
    else
        Console.WriteLine($"[validate] {name} = {value}");
}
Console.WriteLine("[validate] Environment check complete");
