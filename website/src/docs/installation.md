---
layout: layouts/docs.njk
title: Installation
description: "Install Napper CLI and VS Code extension. Available for macOS, Linux, and Windows."
keywords: "install napper, VS Code extension, CLI binary, macOS, Linux, Windows"
eleventyNavigation:
  key: Installation
  order: 2
---

# Installation

## Download from GitHub Releases (spec: cli-run)

The fastest way to get Napper is to download the CLI binary from [GitHub Releases](https://github.com/MelbourneDeveloper/napper/releases). The current release is **v0.10.0**.

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | [`napper-osx-arm64`](https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-osx-arm64) |
| macOS (Intel) | [`napper-osx-x64`](https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-osx-x64) |
| Linux (x64) | [`napper-linux-x64`](https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-linux-x64) |
| Windows (x64) | [`napper-win-x64.exe`](https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-win-x64.exe) |

Download the binary, make it executable (`chmod +x` on macOS/Linux), and move it somewhere on your PATH.

### Verify installation

```bash
napper --version
napper --help
```

## Install script

Alternatively, use the install script which auto-detects your platform and verifies the SHA256 checksum.

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/MelbourneDeveloper/napper/main/scripts/install.sh | bash
```

Or install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/MelbourneDeveloper/napper/main/scripts/install.sh | bash -s 0.10.0
```

### Windows

```powershell
irm https://raw.githubusercontent.com/MelbourneDeveloper/napper/main/scripts/install.ps1 | iex
```

Or install a specific version:

```powershell
.\scripts\install.ps1 -Version 0.10.0
```

## Build from source

If you have the .NET SDK and `make` installed, you can build and install the CLI from source:

```bash
git clone https://github.com/MelbourneDeveloper/napper.git
cd napper
make install-binaries
```

This builds the CLI for your platform and installs it to `~/.local/bin/napper`.

## VS Code Extension

The extension provides editor integration but relies on the CLI binary to run requests. Install the CLI first (see above), then install the extension.

Install from the marketplace:

```bash
code --install-extension nimblesite.napper
```

Or search for **"Napper"** in the VS Code Extensions panel.

The extension provides:
- Syntax highlighting for `.nap`, `.naplist`, and `.napenv` files
- Request explorer in the activity bar
- Test Explorer integration
- Environment switching via status bar
- CodeLens actions (Run, Copy as curl)

## Requirements (spec: script-fsx, script-csx)

- **CLI**: Self-contained binary, no runtime dependencies
- **VS Code Extension**: VS Code 1.100.0 or later
- **F# / C# Scripts**: .NET 10 SDK (only needed if using `.fsx` or `.csx` script hooks)

## Next steps

- Follow the [Quick Start](/docs/quick-start/) guide
- Learn the [.nap file format](/docs/nap-files/)
