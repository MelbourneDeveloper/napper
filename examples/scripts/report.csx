// Generate a summary report after test execution
// Could write to file, post to Slack, etc.

var reportPath = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
    ".nap",
    "last-report.txt"
);

var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

var report = $"""
===================================
  Nap Test Report
  {timestamp}
===================================

  Runner:  C# Script
  Status:  Complete
===================================
""";

var dir = Path.GetDirectoryName(reportPath)!;
if (!Directory.Exists(dir))
    Directory.CreateDirectory(dir);

File.WriteAllText(reportPath, report);
Console.WriteLine($"[report] Written to {reportPath}");
