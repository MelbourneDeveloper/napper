# Install Napper CLI on Windows
# Usage: irm https://raw.githubusercontent.com/MelbourneDeveloper/napper/main/scripts/install.ps1 | iex
# Or:    .\scripts\install.ps1 [-Version 0.2.0] [-InstallDir C:\tools]

param(
    [string]$Version = "latest",
    [string]$InstallDir = "$env:LOCALAPPDATA\napper"
)

$ErrorActionPreference = "Stop"

$repo = "MelbourneDeveloper/napper"
$asset = "napper-win-x64.exe"
$checksumFile = "checksums-sha256.txt"

# --- Resolve version ---
if ($Version -eq "latest") {
    Write-Host "==> Fetching latest release..."
    $release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
    $tag = $release.tag_name
} else {
    $tag = "v$Version"
}

Write-Host "==> Installing napper $tag"

$baseUrl = "https://github.com/$repo/releases/download/$tag"
$binaryUrl = "$baseUrl/$asset"
$checksumUrl = "$baseUrl/$checksumFile"

# --- Download binary and checksums ---
$tmpDir = Join-Path $env:TEMP "napper-install"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

$binaryPath = Join-Path $tmpDir $asset
$checksumPath = Join-Path $tmpDir $checksumFile

Write-Host "==> Downloading $asset..."
Invoke-WebRequest -Uri $binaryUrl -OutFile $binaryPath -UseBasicParsing

Write-Host "==> Downloading checksums..."
Invoke-WebRequest -Uri $checksumUrl -OutFile $checksumPath -UseBasicParsing

# --- Verify checksum ---
Write-Host "==> Verifying SHA256 checksum..."
$actualHash = (Get-FileHash -Path $binaryPath -Algorithm SHA256).Hash.ToLower()
$checksumLines = Get-Content $checksumPath
$expectedLine = $checksumLines | Where-Object { $_ -match $asset }

if (-not $expectedLine) {
    Remove-Item -Recurse -Force $tmpDir
    throw "ERROR: $asset not found in checksums file"
}

$expectedHash = ($expectedLine -split "\s+")[0].ToLower()

if ($actualHash -ne $expectedHash) {
    Remove-Item -Recurse -Force $tmpDir
    throw "ERROR: Checksum mismatch`n  Expected: $expectedHash`n  Actual:   $actualHash"
}

Write-Host "    Checksum verified: $actualHash"

# --- Install to directory ---
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$destPath = Join-Path $InstallDir "napper.exe"
Move-Item -Force -Path $binaryPath -Destination $destPath

# --- Add to PATH if needed ---
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$InstallDir*") {
    Write-Host "==> Adding $InstallDir to user PATH..."
    [Environment]::SetEnvironmentVariable("PATH", "$userPath;$InstallDir", "User")
    $env:PATH = "$env:PATH;$InstallDir"
}

# --- Cleanup ---
Remove-Item -Recurse -Force $tmpDir

Write-Host ""
Write-Host "==> napper $tag installed to $destPath"
Write-Host "    Restart your terminal, then run: napper --help"
