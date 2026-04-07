---
layout: layouts/docs.njk
title: OpenAPI Import
description: "Import OpenAPI and Swagger specs into Napper. Generate .nap test files, playlists, and environment files automatically from any OpenAPI 3.x or Swagger 2.0 spec."
keywords: "OpenAPI import, Swagger import, generate API tests, OpenAPI 3.0, OpenAPI 3.1, Swagger 2.0, test generation, nap files"
eleventyNavigation:
  key: OpenAPI Import
  order: 11
---

# OpenAPI Import

![Screenshot: VS Code Command Palette showing the Napper Import OpenAPI commands — Import from URL and Import from File](openapi-import-command-palette.png)

Napper can generate `.nap` test files, a `.naplist` playlist, and a `.napenv` environment file directly from any OpenAPI or Swagger specification. This gives you a working test suite for an entire API in seconds.

---

## Supported spec versions

| Format | Versions | Input type |
|--------|----------|------------|
| OpenAPI | 3.0.x, 3.1.x | JSON |
| Swagger | 2.0 | JSON |

YAML specs must be converted to JSON first (use [swagger2openapi](https://github.com/Mermade/oas-kit) or any online converter). The parser uses the official [Microsoft.OpenApi](https://github.com/microsoft/OpenAPI.NET) library — no regex, no custom parsing.

---

## Import from VS Code

![Screenshot: Napper OpenAPI import dialog in VS Code with a URL field pointing to the Petstore spec, and basic vs AI-enhanced generation options](openapi-import-url-dialog.png)

Two commands are available from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

### Import from URL

**Napper: Import OpenAPI from URL**

1. Open the Command Palette
2. Type **Napper: Import OpenAPI from URL**
3. Enter the URL to the spec — for example: `https://petstore3.swagger.io/api/v3/openapi.json`
4. Choose an output folder where the generated files will be saved
5. Choose **Basic** or **AI-enhanced** generation (see [AI Enhancement](#ai-enhancement-optional))

Napper downloads the spec, parses it, and writes the generated files to the output folder.

### Import from File

**Napper: Import OpenAPI from File**

1. Open the Command Palette
2. Type **Napper: Import OpenAPI from File**
3. Browse to a local `.json` spec file
4. Choose an output folder
5. Choose **Basic** or **AI-enhanced** generation

---

## Import from the CLI

```bash
# Generate from a local spec file
napper generate openapi ./petstore.json --output-dir ./tests

# Output a JSON summary (useful for scripting)
napper generate openapi ./spec.json --output-dir ./tests --output json
```

The `--output-dir` flag specifies where generated files are written. The directory is created if it does not exist.

---

## What gets generated

![Screenshot: VS Code Explorer panel showing the generated folder structure — subdirectories per API tag, .nap files per endpoint, a .naplist playlist, and a .napenv environment file](openapi-import-generated-files.png)

Given a spec for an API called "Petstore" with endpoints grouped under the tags `pets` and `store`, Napper generates:

```
tests/
├── pets/
│   ├── get-pets.nap
│   ├── post-pets.nap
│   ├── get-pets-petId.nap
│   ├── put-pets-petId.nap
│   └── delete-pets-petId.nap
├── store/
│   ├── get-store-inventory.nap
│   └── post-store-order.nap
├── petstore.naplist
└── .napenv
```

### One `.nap` file per operation

Each file contains a complete request with metadata, variables, headers, body (where applicable), and assertions:

```
[meta]
name = GET /pets/{petId}
description = Find pet by ID
generated = true

[vars]
petId = 1

[request]
GET {{baseUrl}}/pets/{{petId}}

[request.headers]
Accept = application/json
Authorization = Bearer {{bearerToken}}

[assert]
status = 200
body.id exists
body.name exists
```

Key details:
- Path parameters like `{petId}` are converted to Napper variables `{{petId}}` and declared in `[vars]`
- Query parameters are added to `[vars]` with placeholder values
- Auth headers (Bearer, Basic, API key) are added based on the spec's security schemes, with variables declared in `.napenv`
- Request bodies are generated from the schema with example values
- The `generated = true` flag in `[meta]` marks the file as auto-generated

### The `.naplist` playlist

A playlist referencing all generated files, ordered by HTTP method (GET → POST → PUT → PATCH → DELETE):

```
[meta]
name = Petstore API Tests

[steps]
./pets/get-pets.nap
./pets/post-pets.nap
./pets/get-pets-petId.nap
./pets/put-pets-petId.nap
./pets/delete-pets-petId.nap
./store/get-store-inventory.nap
./store/post-store-order.nap
```

### The `.napenv` environment file

Contains the base URL extracted from the spec and variable placeholders for auth:

```
baseUrl = https://petstore3.swagger.io/api/v3
bearerToken = YOUR_BEARER_TOKEN
```

Fill in the auth values in `.napenv.local` (which should be gitignored):

```
# .napenv.local
bearerToken = eyJhbGci...
```

---

## How base URL is extracted

Napper extracts the base URL from the spec in this order:

| Spec version | Source |
|-------------|--------|
| OpenAPI 3.x | First entry in `servers[].url` |
| Swagger 2.0 | Constructed from `schemes[0]` + `host` + `basePath` |

If neither is present, `baseUrl` is left empty in `.napenv` for you to fill in.

---

## How authentication is handled

Napper reads the spec's `securitySchemes` and adds the appropriate headers to each generated request:

| Scheme | Generated header | Variable |
|--------|-----------------|----------|
| `http: bearer` | `Authorization = Bearer {{bearerToken}}` | `bearerToken` |
| `http: basic` | `Authorization = Basic {{basicCredentials}}` | `basicCredentials` |
| `apiKey: header` | Header named by the spec (e.g. `X-Api-Key = {{xApiKey}}`) | derived from header name |

All auth variables are declared in `.napenv` with placeholder values. Replace them in `.napenv.local` to avoid committing secrets.

---

## How request bodies are generated

For operations with a request body, Napper inspects the schema and generates a JSON example:

| Schema type | Generated example |
|------------|------------------|
| `string` | `"string"` |
| `integer` | `0` |
| `number` | `0.0` |
| `boolean` | `false` |
| `array` | `[]` |
| `object` | Recursively generated from properties |
| `$ref` | Resolved and inlined |

`$ref` references (both inline and from `#/components/schemas`) are resolved before generation, so nested types work correctly.

---

## Customising generated files

The generated files are plain `.nap` files — edit them freely. Common customisations:

**Replace placeholder values with real test data:**
```
[vars]
petId = 42          # was: 1
petName = Fluffy    # add new variable
```

**Add more specific assertions:**
```
[assert]
status = 200
body.id = {{petId}}
body.name = Fluffy       # add value check
body.status = available  # add field value assertion
duration < 300ms         # add timing assertion
```

**Remove operations you do not want to test:**

Delete any `.nap` file and remove the corresponding line from the `.naplist`.

**Add pre/post scripts:**
```
[script]
pre = ./scripts/auth.fsx
post = ./scripts/validate-response.fsx
```

**Customise the environment:**

Edit `.napenv` to point at a different environment:
```
baseUrl = https://staging.petstore.example.com
```

---

## AI Enhancement (optional)

![Screenshot: AI-enhanced generation option in VS Code, showing richer assertions and realistic test data generated via GitHub Copilot](openapi-import-ai-enhanced.png)

When GitHub Copilot is available in VS Code, you can choose **AI-enhanced** generation. This enriches the basic output with:

- **Semantic assertions** beyond simple existence checks (e.g. `body.email contains @`, `body.status = active`)
- **Realistic test data** in request bodies instead of placeholder values
- **Logical playlist ordering** — authentication requests first, then CRUD operations in dependency order

If Copilot is not available or the AI step fails, Napper falls back to basic generation automatically and shows a notification.

---

## Running generated tests

Once generated, run the entire suite:

```bash
napper run ./tests/petstore.naplist
```

Run a single file:
```bash
napper run ./tests/pets/get-pets.nap
```

Run with a specific environment:
```bash
napper run ./tests/petstore.naplist --env staging
```

Output JUnit XML for CI/CD:
```bash
napper run ./tests/petstore.naplist --output junit > results.xml
```

---

## Troubleshooting

**"Failed to parse spec" error**

- Verify the spec is valid JSON. YAML is not supported yet — convert it first.
- Check that the spec is valid OpenAPI 3.x or Swagger 2.0 using the [Swagger Editor](https://editor.swagger.io/).
- Some specs with complex `$ref` chains may not resolve correctly. Open an issue on [GitHub](https://github.com/Nimblesite/napper/issues) with the spec attached.

**URL import fails with a network error**

- Confirm the URL is publicly accessible.
- If behind a proxy, set `HTTPS_PROXY` in your environment.
- Download the spec locally and use **Import from File** instead.

**Generated files have empty `baseUrl`**

- The spec does not declare a `servers` entry (OpenAPI 3.x) or `host`/`basePath` (Swagger 2.0).
- Edit `.napenv` to set `baseUrl` manually.

**Auth variables are missing**

- Not all specs declare security schemes at the operation level. If your API requires auth but none was generated, add the header manually to the relevant `.nap` files.

**Request bodies are empty or wrong**

- Some specs use `$ref` chains that are deeply nested. If a body was not generated or looks wrong, fill it in manually — the file is plain text.

**Output directory is not empty**

- Napper writes files into the output directory without deleting existing content. If you re-run generation, existing files are overwritten. Move any custom files out of the generated directory, or use a subdirectory for generated output.

---

## Next steps

- [Run your generated tests](/docs/quick-start/) from the CLI or VS Code
- [Customise assertions](/docs/assertions/) to verify more than status codes
- [Set up environments](/docs/environments/) for staging and production
- Add [F# or C# scripts](/docs/fsharp-scripting/) for dynamic auth and complex flows
