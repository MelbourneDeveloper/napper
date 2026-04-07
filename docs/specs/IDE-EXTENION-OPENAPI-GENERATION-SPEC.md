# `vscode-openapi` — OpenAPI Test Generation — IDE Extension

> Extension-side integration for OpenAPI import and AI-assisted enrichment.

---

## `vscode-openapi-import` — Import Command

The `Nap: Import from OpenAPI` command (`nap.importOpenApi`):

1. User picks a spec file (JSON / YAML) or pastes a URL
2. User picks an output folder
3. Generator runs, writes files
4. Opens the generated `.naplist` in the editor
5. Shows success notification with file count

### Menu placement

The import command appears in:
- The Nap explorer panel title bar (cloud-download icon)
- The Command Palette

---

## `vscode-openapi-ai` — AI-Assisted Enrichment (Copilot)

> AI enrichment is an **optional layer** on top of the deterministic generator. The generator always works without Copilot. When Copilot is available and the user opts in, the output is enriched.

### How it works

1. The deterministic generator produces the base `GenerationResult`
2. If the user chooses "Generate with AI enhancement" and Copilot is available:
   - The enricher sends batched prompts to the VS Code Language Model API (`vscode.lm`)
   - Each prompt covers a batch of operations (grouped by tag) to stay within rate limits
   - The LLM responses are parsed and merged into the generation result
3. The enriched files are written to disk

### What AI enriches

| Area | Without AI | With AI |
|------|-----------|---------|
| Assertions | `status = 200`, `body.field exists` for required fields | Semantic assertions: format checks, value range checks, relationship assertions between fields |
| Request body examples | Schema-derived defaults (`"example"`, `0`, `true`) | Contextually realistic values: real-looking emails, names, dates, UUIDs |
| Error case tests | One per documented error status code with placeholder input | Targeted invalid inputs that would actually trigger each error |
| Playlist ordering | File-sort order | Logical flow: auth first, create before read, CRUD lifecycle |
| Validation scripts | None | `.fsx` scripts for complex nested object / array validation |

### Architecture

The AI enrichment is split into two modules:

**`openApiAiEnhancer.ts`** — pure functions, no VS Code SDK dependency:
- Input: `GenerationResult` + parsed `OpenApiSpec` + LLM response strings
- Output: enriched `GenerationResult`
- Fully testable without VS Code

**Extension integration layer** (in `extension.ts`):
- Checks `vscode.lm.selectChatModels()` for Copilot availability
- Presents choice: "Generate" vs "Generate with AI"
- Sends prompts, collects responses, passes to enhancer
- Shows progress notification during AI processing

### Prompt design

Prompts return parseable JSON. Each covers one enrichment aspect for a batch of operations:

- **Assertion enrichment**: Given response schemas, return assertion lines per operation
- **Test data enrichment**: Given request body schemas, return realistic example bodies
- **Error case enrichment**: Given operations with error responses, return test inputs per error code

### Future AI integration

The VS Code Language Model API integration is the first step. Future paid features may include:
- A standalone Nap agent that generates and maintains test suites outside VS Code
- Continuous test generation that watches spec changes and updates tests
- AI-driven test prioritization based on API change impact analysis

---

## Current Implementation State

### What exists today

**`src/Napper.VsCode/src/openApiGenerator.ts`** (380 lines) — pure TypeScript, no VS Code SDK:
- `generateFromOpenApi(jsonText: string): Result<GenerationResult, string>`
- Supports OpenAPI 3.x and Swagger 2.x (JSON only)
- Extracts base URL from `servers[]` or `host`/`basePath`/`schemes`
- Converts path params `{param}` to `{{param}}`
- Generates example request bodies from schemas (recursive)
- Creates `[assert]` with success status code only
- Adds Content-Type/Accept headers for POST/PUT/PATCH
- Outputs numbered `.nap` files, one `.naplist`, one `.napenv`
- All string literals defined as constants in `constants.ts`

**`src/Napper.VsCode/src/extension.ts`** (lines 412-472) — VS Code integration:
- File picker for spec file
- Output folder picker
- Writes generated files to disk

**`src/Napper.VsCode/src/constants.ts`** (lines 201-241) — all OpenAPI constants

### What is missing

| Gap | Priority | Notes |
|-----|----------|-------|
| Unit tests for openApiGenerator.ts | Critical | 380 lines of pure functions with zero tests |
| `$ref` resolution | High | Most real-world specs use `$ref` extensively |
| YAML support | High | YAML is the dominant format for OpenAPI specs |
| Response body assertions | High | Only generates `status = code` today |
| Tag-based folder organization | High | Currently flat-numbered, should group by tag |
| Query parameter handling | Medium | Not added to URL or `[vars]` |
| Auth scheme handling | Medium | No security scheme detection |
| `[vars]` block for path params | Medium | Params are in URL but no `[vars]` section |
| `generated = true` meta flag | Medium | Spec calls for it, not implemented |
| Error case generation | Medium | Only happy-path tests generated |
| Smarter example values (format/enum) | Medium | Everything is `"example"` or `0` |
| URL-based spec loading | Low | File picker only today |
| `--diff` mode | Low | No re-generation support |
| AI enrichment (Copilot) | Low | Foundation first, then AI layer |

---

## Implementation Phases

### Phase A: Testing Foundation

Write comprehensive unit tests for `openApiGenerator.ts`. Test fixtures for valid OAS3, valid Swagger 2, edge cases, error cases. All pure functions, no VS Code dependency needed.

### Phase B: AI-Assisted Enrichment

- `openApiAiEnhancer.ts` module (pure functions)
- VS Code Language Model API integration
- Batch prompt design and response parsing
- UI toggle: "Generate" vs "Generate with AI"
- Enhanced assertions, test data, playlist ordering

---

## TODO

### Phase A: Testing Foundation
- [ ] Unit tests for `openApiGenerator.ts`
- [ ] Test fixtures for valid OAS3
- [ ] Test fixtures for valid Swagger 2
- [ ] Edge case and error case tests

### Phase B: AI-Assisted Enrichment
- [ ] `openApiAiEnhancer.ts` module (pure functions)
- [ ] VS Code Language Model API integration
- [ ] Batch prompt design and response parsing
- [ ] UI toggle: "Generate" vs "Generate with AI"
- [ ] Enhanced assertions, test data, playlist ordering
