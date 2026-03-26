---
layout: layouts/docs.njk
title: Installation
description: "Install Napper CLI and VS Code extension. Available for macOS, Linux, and Windows. No account required, no runtime dependencies."
keywords: "install napper, VS Code extension, VSIX install, CLI binary, macOS, Linux, Windows, dotnet tool"
eleventyNavigation:
  key: Installation
  order: 2
---

# Installation

![Screenshot: Napper VS Code extension installed and active in the VS Code Activity Bar, showing the Napper panel icon](installation-vscode-activity-bar.png)

Napper has two components: the **CLI binary** and the **VS Code extension**. The CLI is standalone with no runtime dependencies. The extension shells out to the CLI, so you need both for full VS Code integration.

---

## VS Code Extension

![Screenshot: Napper extension listing on the VS Code Marketplace, showing install button, ratings, and feature highlights](installation-marketplace-listing.png)

### Install from the Marketplace

The easiest way to get Napper in VS Code is from the marketplace:

**Option 1 — Marketplace UI:**
1. Open VS Code
2. Click the **Extensions** icon in the Activity Bar (or press `Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **Napper**
4. Click **Install** on the result published by **Nimblesite**

**Option 2 — Command line:**
```bash
code --install-extension nimblesite.napper
```

**Option 3 — Quick Open:**
Press `Ctrl+P` / `Cmd+P` and run:
```
ext install nimblesite.napper
```

### Install a VSIX manually

If you need a specific version or are working in an air-gapped environment, download the `.vsix` file from [GitHub Releases](https://github.com/MelbourneDeveloper/napper/releases) and install it manually.

**Via the VS Code UI:**
1. Download `napper-<version>.vsix` from the [Releases page](https://github.com/MelbourneDeveloper/napper/releases)
2. Open the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Click the `...` menu (top-right of the panel)
4. Select **Install from VSIX...**
5. Browse to the downloaded `.vsix` file and click **Install**

**Via the command line:**
```bash
code --install-extension napper-0.10.0.vsix
```

### What the extension provides

Once installed, Napper adds:

- **Syntax highlighting** for `.nap`, `.naplist`, and `.napenv` files
- **Napper panel** in the Activity Bar with a request and playlist explorer
- **Test Explorer integration** — run and inspect results without leaving VS Code
- **Environment switcher** in the status bar
- **CodeLens actions** — click **Run** or **Copy as curl** above any request
- **OpenAPI import** — generate test files from any OpenAPI/Swagger spec
- **AI enrichment** — optional GitHub Copilot integration for smarter assertions

---

## CLI Binary

![Screenshot: Napper CLI running a test suite in a terminal, showing coloured pass/fail output for each assertion](installation-cli-terminal.png)

The CLI is a self-contained binary with **no runtime dependencies** — no .NET, no Node, no Python required.

### Download from GitHub Releases

Download the binary for your platform from [GitHub Releases](https://github.com/MelbourneDeveloper/napper/releases). The current release is **v0.10.0**.

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | [`napper-osx-arm64`](https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-osx-arm64) |
| macOS (Intel) | [`napper-osx-x64`](https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-osx-x64) |
| Linux (x64) | [`napper-linux-x64`](https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-linux-x64) |
| Windows (x64) | [`napper-win-x64.exe`](https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-win-x64.exe) |

**macOS / Linux — make it executable and move to PATH:**
```bash
# Example for macOS Apple Silicon
chmod +x napper-osx-arm64
mv napper-osx-arm64 /usr/local/bin/napper
```

**Windows — add to PATH:**

Move `napper-win-x64.exe` to a folder on your `PATH`, or rename it to `napper.exe` and add its directory to your system PATH via System Properties → Environment Variables.

### Install script (macOS / Linux)

The install script auto-detects your platform and verifies the SHA256 checksum:

```bash
curl -fsSL https://raw.githubusercontent.com/MelbourneDeveloper/napper/main/scripts/install.sh | bash
```

Install a specific version:
```bash
curl -fsSL https://raw.githubusercontent.com/MelbourneDeveloper/napper/main/scripts/install.sh | bash -s 0.10.0
```

### Install script (Windows)

```powershell
irm https://raw.githubusercontent.com/MelbourneDeveloper/napper/main/scripts/install.ps1 | iex
```

Install a specific version:
```powershell
.\scripts\install.ps1 -Version 0.10.0
```

### Build from source

If you have the .NET SDK and `make` installed, you can build from source:

```bash
git clone https://github.com/MelbourneDeveloper/napper.git
cd napper
make install-binaries
```

This builds a self-contained, trimmed, single-file binary for your platform and installs it to `~/.local/bin/napper`.

### Verify the installation

```bash
napper --version
napper --help
```

You should see the version number and the list of available commands.

---

## Prerequisites

| Scenario | Requirement |
|----------|-------------|
| Running `.nap` / `.naplist` files | None — the CLI binary is self-contained |
| VS Code extension | VS Code 1.95.0 or later |
| F# script hooks (`.fsx`) | [.NET 10 SDK](https://dotnet.microsoft.com/download) |
| C# script hooks (`.csx`) | [.NET 10 SDK](https://dotnet.microsoft.com/download) |
| Building from source | .NET 10 SDK + `make` |

No account is required. Napper is entirely open source and free.

---

## First-time setup

![Screenshot: VS Code workspace with a .nap file open, CodeLens Run button visible above the request line, and the Napper Explorer panel populated with discovered requests](installation-first-time-setup.png)

After installing both components:

**1. Verify the CLI is on your PATH**

Open a terminal and run:
```bash
napper --version
```

If VS Code cannot find the CLI, set the path explicitly in VS Code settings:
```json
{
  "napper.cliPath": "/usr/local/bin/napper"
}
```

**2. Open a folder with `.nap` files**

The Napper panel in the Activity Bar will automatically discover all `.nap` and `.naplist` files in your workspace. If you do not have any yet, create a simple one:

```
GET https://jsonplaceholder.typicode.com/posts/1
```

Save it as `hello.nap`.

**3. Run your first request**

- **From VS Code**: Click the **Run** CodeLens link above the request line, or click the play button in the Napper Explorer panel.
- **From the CLI**: `napper run ./hello.nap`

**4. Set up environments (optional)**

Create a `.napenv` file in your project root with shared variables:

```
baseUrl = https://api.example.com
```

Create a `.napenv.local` file (add to `.gitignore`) for secrets:

```
token = your-secret-token
apiKey = your-api-key
```

Switch environments from the VS Code status bar or with `--env` on the CLI.

---

## Troubleshooting

**VS Code says it cannot find the `napper` CLI**

Make sure the CLI binary is on your system PATH. Test by opening a terminal inside VS Code (`Ctrl+`` `) and running `napper --version`. If it works there but not in the extension, set `napper.cliPath` explicitly in your VS Code settings.

**`chmod +x` is required on macOS / Linux**

After downloading the binary, you must make it executable before running it:
```bash
chmod +x napper-osx-arm64
```

**macOS Gatekeeper warning**

On macOS, you may see a warning that the binary is from an unidentified developer. Right-click the binary and choose **Open**, or run:
```bash
xattr -dr com.apple.quarantine /usr/local/bin/napper
```

**Script hooks fail with "dotnet not found"**

F# (`.fsx`) and C# (`.csx`) script hooks require the .NET 10 SDK. Download it from [dotnet.microsoft.com](https://dotnet.microsoft.com/download). Plain `.nap` and `.naplist` files do not need the SDK.

---

## Next steps

- Follow the [Quick Start](/docs/quick-start/) guide to create your first request and test suite
- Learn the [.nap file format](/docs/nap-files/)
- Import an existing API spec with [OpenAPI import](/docs/openapi-import/)
- Set up [environments](/docs/environments/) for local, staging, and production
