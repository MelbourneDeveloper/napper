<!-- agent-pmo:74cf183 -->

## Too Many Cooks

⚠️ NEVER KILL VSCODE PROCESSES

## Coding Rules

- **Zero duplication - TOP PRIORITY** - Always search for existing code before adding. Move; don't copy files. Add assertions to tests rather than duplicating tests. AIM FOR LESS CODE!
- **Maximum code reuse** - Move code to shared libraries and REUSE it
- **No string literals** - Named constants only, and it ONE location
- DO NOT USE GIT
- **Functional style** - Prefer pure functions, avoid classes where possible
- **Centralise global state** - Generally avoid global state, but put it in one file where necessary
- **Heavy logging at all levels** - Logs are critical, even in tests
- **No suppressing warnings** - Fix them properly
- **Use a robust library for CLI arg parsing** - Don't use Regex
- **No REGEX matching on structured data like JSON, .HTTP, YAML, TOML, F#, TS, etc** - Use a well-established parser. Regex is only for extreme corner cases
- **Expressions over assignments** - Prefer const and immutable patterns
- **Named parameters** - Use object params for functions with 1+ args
- **Keep files under 450 LOC and functions under 20 LOC**
- **No commented-out code** - Delete it
- **No placeholders** - If incomplete, leave LOUD compilation error with TODO
- **Spec IDs are hierarchical, descriptive, and non-numeric.** Every spec section MUST have a unique ID in the format `[GROUP-TOPIC]` or `[GROUP-TOPIC-DETAIL]` (e.g., `[CLI-PARSE-NAP]`, `[LSP-COMPLETION-VARS]`, `[HTTP-REQ-HEADERS]`). The first word is the **group** — all sections in the same group MUST be adjacent in the spec's TOC. NEVER use sequential numbers like `[SPEC-001]`. All code, tests, and design docs that implement a spec section MUST reference its ID in a comment (e.g., `// Implements [LSP-COMPLETION-VARS]`).

### Rust
- Keep files under 500 LOC
- Run fmt and clippy regularly!!!

### Typescript
- **TypeScript strict mode** - No `any`, no implicit types, turn all lints up to error
- **Regularly run the linter** - Fix lint errors IMMEDIATELY
- **Decouple providers from the VSCODE SDK** - No vscode sdk use within the providers
- **Ignoring lints = ⛔️ illegal** - Fix violations immediately
- **No throwing** - Only return `Result<T,E>`

### F#
- **⚠️ MAXIMUM CODE SHARING — NON-NEGOTIABLE** - All F# projects (Napper.Cli, Napper.Lsp, future consumers) MUST share logic through `Napper.Core`. If code could live in `Napper.Core`, it MUST live in `Napper.Core`. NEVER duplicate parsing, types, environment resolution, logging, or any domain logic across projects. Before writing ANY new module in a consumer project, check if it belongs in `Napper.Core` first.
- **Idiomatic F#**
- **Move content out of the fsproj files and into Directory.Build.props**
- **Standard F# result types** - Use the standard F# built-in result types
- **Turn on F# analyzers** - Strict rules to enforce F# best practice
- **Prefer moving config from fsproj -> buildprops** avoid project config across projects

## Testing

#### Rules

- **Prefer e2e tests over unit tests** - only unit tests for isolating bugs
- Separate e2e tests from unit tests by file. They should not be in the same file together.
- **Add more assertions** - No, that's not enough. Add more!!!
- Multiple user interactions per test, multiple assertions per user interaction
- Prefer adding assertions to existing tests rather than adding new tests
- NEVER remove assertions
- FAILING TEST = ✅ OK. TEST THAT DOESN'T ENFORCE BEHAVIOR = ⛔️ ILLEGAL
- Unit tests are for isolating issues only
- FAKE TESTS ARE ILLEGAL **A "fake test" is any test that passes without actually verifying behavior. These are STRICTLY FORBIDDEN:**

### Automated (E2E) Testing

**AUTOMATED TESTING IS BLACK BOX TESTING ONLY**

- Only test the UI **THROUGH the UI**.
- Do not run command etc. to coerce the state.
- You are testing the UI, not the code.
- Make assertions about the UI - not the internal state
- This is true for both the CLI and the VSIX.
- The test VSIX must call the actual, real CLI.
- VSIX tests run in actual VS Code window

### Test First Process

- Write test that fails because of bug/missing feature
- Run tests to verify that test fails because of this reason
- Adjust test and repeat until you see failure for the reason above
- Add missing feature or fix bug
- Run tests to verify test passes.
- Repeat and fix until test passes WITHOUT changing the test

**Every test MUST:**

1. Assert on the ACTUAL OBSERVABLE BEHAVIOR (UI state, view contents, return values)
2. Fail if the feature is broken
3. Test the full flow, not just side effects like config files

## Specs Structure

The `specs/` directory contains the product specification, split by concern and by CLI vs IDE extension:

- **`CLI-*.md`** — CLI specification and plan
- **`IDE-EXTENSION-*.md`** — Shared extension spec + VSCode-specific plan
- **`ZED-EXTENSION-PLAN.md`** — Zed-specific extension plan
- **`LSP-SPEC.md`** — Nap Language Server specification (F# binary, LSP 3.17 over stdio)
- **`LSP-PLAN.md`** — LSP implementation phases and TODO
- **`*-OPENAPI-GENERATION-*.md`** — OpenAPI generation, split by CLI and extension
- **`FILE-FORMATS-SPEC.md`** — Shared `.nap`, `.napenv`, `.naplist` format specs
- **`SCRIPTING-SPEC.md`** — F# scripting model (NapContext, NapRunner)
- **`HTTP-FILES-SPEC.md`** — .http file compatibility (converter + direct run)
- **`HTTP-FILES-PLAN.md`** — .http converter implementation phases

Plan files end with a TODO checklist. Specs describe _what_, plans describe _how and when_.

Extensions target **VSCode and Zed** as primary IDEs (Neovim future). All extensions shell out to the Nap CLI — no IDE re-implements HTTP logic. A portable **Nap Language Server (LSP)** provides completions, diagnostics, and hover across all IDEs.

You are working with many other agents. Make sure there is effective cooperation

- Register on TMC immediately
- Don't edit files that are locked; lock files when editing
- COMMUNICATE REGULARLY AND COORDINATE WITH OTHERS THROUGH MESSAGES

## Critical Docs

### Zed SDK

[Zed Extension Development](https://zed.dev/docs/extensions/developing-extensions)
[Zed Language Extensions](https://zed.dev/docs/extensions/languages)
[Zed Slash Commands](https://zed.dev/docs/extensions/slash-commands)

### Vscode SDK

[VSCode Extension API](https://code.visualstudio.com/api/)
[VSCode Extension Testing API](https://code.visualstudio.com/api/extension-guides/testing)
[VSCODE Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model)
[Language Model Tool API](https://code.visualstudio.com/api/extension-guides/ai/tools)
[AI extensibility in VS Cod](https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview)
[AI language models in VS Code](https://code.visualstudio.com/docs/copilot/customization/language-models)

### Website

Minimize CSS classes
CSS Budget: 1.5k LOC