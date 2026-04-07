# Nap CLI — Implementation Plan

---

## Parser Implementation

### Recommended approach: ANTLR4

The `.nap` and `.naplist` formats should be parsed with **ANTLR4** (targeting the C# runtime via `Antlr4.Runtime.Standard` NuGet package, which works fine from F#).

**Rationale:**
- The format has a non-trivial grammar (multi-line string literals, section headers, assertion expressions, variable interpolation).
- ANTLR gives a formal grammar file (`.g4`) that serves as the authoritative format spec and is easy to evolve.
- The C# ANTLR runtime is mature and well-maintained. Generating a visitor/listener from F# is straightforward.
- Alternatives (FParsec, manual recursive descent) are viable but ANTLR's grammar file is more readable as documentation and easier to extend without regressions.

**Alternative — FParsec:**
If the grammar stays simple enough, [FParsec](https://www.quanttec.com/fparsec/) (a combinator parser library for F#) is a strong alternative. It keeps everything in F#, has excellent error messages, and has no code generation step. Use FParsec if the grammar remains simple; switch to ANTLR if the grammar grows complex (e.g. full expression language for assertions, conditional blocks).

**Grammar files location:**

```
nap/
└── src/
    └── Napper.Core/
        └── Grammar/
            ├── NapFile.g4      # .nap file grammar
            └── NapList.g4      # .naplist grammar
```

The generated parser code is committed to the repo (not regenerated on every build) to avoid toolchain dependencies in CI.

---

## Project Layout

```
nap/
├── src/
│   ├── Napper.Core/           # F# — parser, types, runner engine
│   ├── Napper.Scripting/      # F# — fsi host, script context injection
│   └── Napper.Cli/            # F# — CLI entry point (System.CommandLine)
├── tests/
│   ├── Napper.Core.Tests/
│   └── Napper.Scripting.Tests/
├── examples/
│   └── petstore/           # Sample collection against Petstore API
└── nap.sln
```

---

## Implementation Phases

### Phase 1 — Core CLI (MVP)

- `.nap` file parser
- HTTP request runner (single file)
- Built-in `[assert]` block evaluation
- `.napenv` variable resolution
- `--output pretty` and `--output junit`
- `nap run <file>` command

### Phase 2 — Collections & Playlists

- Folder-based collection runner
- `.naplist` file parser and runner
- Nested playlist support
- Variable scoping across steps (`ctx.Set`)

### Phase 3 — F# Scripting

- dotnet-fsi host integration
- `NapContext` injection
- Pre/post script execution
- `ctx.Set` for cross-step variable passing

### Phase 4 — Polish & Distribution

- **NuGet package for `dotnet tool install` (PRIMARY channel)** — set `<PackAsTool>true</PackAsTool>` and `<ToolCommandName>napper</ToolCommandName>` in `Nap.Cli.fsproj`, publish to nuget.org. This is the primary distribution method — no code signing needed, no SmartScreen warnings on Windows, immediate availability. The VSIX extension auto-installs via `dotnet tool install -g napper --version X.X.X`.
- Standalone native binary (NativeAOT or single-file publish) — secondary channel for users without .NET SDK
- Homebrew formula
- Winget / Chocolatey / Scoop packages (future)
- `nap new` scaffolding commands
- Language-extensible script runner plugin model

---

## Open Questions / Future Considerations

- **GraphQL support** — a `[request.graphql]` block with query/variables sub-keys.
- **WebSocket / SSE testing** — separate request type, different assertion model.
- **Mock server mode** — `nap mock ./collection/` serves a mock based on expected responses.
- **Script language plugins** — `.py`, `.js` runners as opt-in packages.
- **Secret manager integration** — pull `{{token}}` from 1Password, AWS Secrets Manager, etc. at runtime.
- **HTML report output** — `--output html` for a shareable test report.

---

## TODO

### Phase 1 — Core CLI (MVP)
- [ ] `.nap` file parser
- [ ] HTTP request runner (single file)
- [ ] Built-in `[assert]` block evaluation
- [ ] `.napenv` variable resolution
- [ ] `--output pretty` and `--output junit`
- [ ] `nap run <file>` command

### Phase 2 — Collections & Playlists
- [ ] Folder-based collection runner
- [ ] `.naplist` file parser and runner
- [ ] Nested playlist support
- [ ] Variable scoping across steps (`ctx.Set`)

### Phase 3 — F# Scripting
- [ ] dotnet-fsi host integration
- [ ] `NapContext` injection
- [ ] Pre/post script execution
- [ ] `ctx.Set` for cross-step variable passing

### Phase 4 — Polish & Distribution
- [ ] `dotnet tool install` — set `PackAsTool` in fsproj, publish to nuget.org (PRIMARY)
- [ ] VSIX auto-installs CLI via `dotnet tool install -g napper --version X.X.X`
- [ ] Standalone native binary (NativeAOT or single-file publish) — secondary
- [ ] Homebrew formula
- [ ] Winget / Chocolatey / Scoop packages
- [ ] `nap new` scaffolding commands
- [ ] Language-extensible script runner plugin model
