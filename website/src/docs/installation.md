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

Napper has two components: the **CLI binary** and the **VS Code extension**. The extension bundles the CLI, so installing the extension is all most users need.

## VS Code Extension

Install from the marketplace:

```bash
code --install-extension nimblesite.napper
```

Or search for **"Napper"** in the VS Code Extensions panel.

The extension includes:
- Syntax highlighting for `.nap`, `.naplist`, and `.napenv` files
- Request explorer in the activity bar
- Test Explorer integration
- Environment switching via status bar
- CodeLens actions (Run, Copy as curl)

## CLI Binary

For CI/CD pipelines or terminal-only workflows, install the standalone CLI.

### From GitHub Releases

Download the latest binary for your platform from [GitHub Releases](https://github.com/MelbourneDeveloper/ApiTesting/releases):

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `napper-osx-arm64` |
| macOS (Intel) | `napper-osx-x64` |
| Linux (x64) | `napper-linux-x64` |
| Windows (x64) | `napper-win-x64.exe` |

### macOS / Linux

```bash
# Download (replace with your platform)
curl -L -o napper https://github.com/MelbourneDeveloper/ApiTesting/releases/latest/download/napper-osx-arm64

# Make executable
chmod +x napper

# Move to PATH
mv napper ~/.local/bin/
```

### Windows

Download `napper-win-x64.exe` from releases and add it to your PATH.

### Verify installation

```bash
napper --help
```

## Requirements

- **CLI**: Self-contained binary, no runtime dependencies
- **VS Code Extension**: VS Code 1.100.0 or later
- **F# Scripts**: .NET 10 SDK (only needed if using `.fsx` script hooks)

## Next steps

- Follow the [Quick Start](/docs/quick-start/) guide
- Learn the [.nap file format](/docs/nap-files/)
