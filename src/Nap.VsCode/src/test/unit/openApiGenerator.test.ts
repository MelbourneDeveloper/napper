import * as assert from "assert";
import {
  generateFromOpenApi,
  type GenerationResult,
  type GeneratedFile,
} from "../../openApiGenerator";
import {
  NAP_EXTENSION,
  NAPLIST_EXTENSION,
  NAPENV_EXTENSION,
  SECTION_META,
  SECTION_REQUEST,
  SECTION_REQUEST_HEADERS,
  SECTION_REQUEST_BODY,
  SECTION_ASSERT,
  SECTION_VARS,
  SECTION_STEPS,
  NAP_TRIPLE_QUOTE,
  HEADER_CONTENT_TYPE,
  HEADER_ACCEPT,
  CONTENT_TYPE_JSON,
  ASSERT_STATUS_PREFIX,
  ASSERT_BODY_EXISTS_SUFFIX,
  ASSERT_BODY_PREFIX,
  NAP_KEY_NAME,
  NAP_KEY_GENERATED,
  NAP_VALUE_TRUE,
  BASE_URL_VAR,
  BASE_URL_KEY,
  DEFAULT_BASE_URL,
  VARS_PLACEHOLDER,
  OPENAPI_INVALID_SPEC,
  OPENAPI_NO_ENDPOINTS,
  OPENAPI_PARSE_ERROR,
} from "../../constants";

// --- Minimal valid OpenAPI 3.x spec ---

const MINIMAL_OAS3_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Test API" },
  servers: [{ url: "https://api.test.com/v1" }],
  paths: {
    "/users": {
      get: {
        summary: "List users",
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

// --- Minimal valid Swagger 2.x spec ---

const MINIMAL_SWAGGER2_SPEC = JSON.stringify({
  swagger: "2.0",
  info: { title: "Legacy API" },
  host: "legacy.test.com",
  basePath: "/api",
  schemes: ["https"],
  paths: {
    "/items": {
      get: {
        summary: "List items",
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

// --- Multi-method spec ---

const MULTI_METHOD_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "CRUD API" },
  servers: [{ url: "https://crud.test.com" }],
  paths: {
    "/pets": {
      get: {
        summary: "List pets",
        responses: { "200": { description: "OK" } },
      },
      post: {
        summary: "Create pet",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  age: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/pets/{petId}": {
      get: {
        operationId: "getPetById",
        responses: { "200": { description: "OK" } },
      },
      delete: {
        summary: "Delete pet",
        responses: { "204": { description: "Deleted" } },
      },
    },
  },
});

// --- Spec with request body example ---

const SPEC_WITH_EXAMPLE = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Example API" },
  servers: [{ url: "https://example.test.com" }],
  paths: {
    "/users": {
      post: {
        summary: "Create user",
        requestBody: {
          content: {
            "application/json": {
              example: { name: "Alice", email: "alice@example.com" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
  },
});

// --- Spec with Swagger 2 body parameter ---

const SWAGGER2_BODY_PARAM_SPEC = JSON.stringify({
  swagger: "2.0",
  info: { title: "Swagger Body API" },
  host: "body.test.com",
  schemes: ["https"],
  paths: {
    "/things": {
      post: {
        summary: "Create thing",
        parameters: [
          {
            name: "body",
            in: "body",
            schema: {
              type: "object",
              properties: {
                label: { type: "string" },
                count: { type: "number" },
                active: { type: "boolean" },
              },
            },
          },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

// --- Spec with nested schema types ---

const NESTED_SCHEMA_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Nested API" },
  servers: [{ url: "https://nested.test.com" }],
  paths: {
    "/complex": {
      post: {
        summary: "Complex body",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  tags: { type: "array", items: { type: "string" } },
                  metadata: {
                    type: "object",
                    properties: {
                      key: { type: "string" },
                      value: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

// --- Spec with no servers (fallback URL) ---

const NO_SERVERS_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "No Servers API" },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

// --- Helpers ---

const unwrap = (jsonText: string): GenerationResult => {
  const result = generateFromOpenApi(jsonText);
  assert.strictEqual(result.ok, true, "expected generation to succeed");
  return result.value;
};

const firstFile = (gen: GenerationResult): GeneratedFile => {
  const file = gen.napFiles[0];
  assert.ok(file, "expected at least one generated nap file");
  return file;
};

const fileAt = (gen: GenerationResult, index: number): GeneratedFile => {
  const file = gen.napFiles[index];
  assert.ok(file, `expected nap file at index ${index}`);
  return file;
};

// --- Error cases ---

suite("openApiGenerator — error handling", () => {
  test("rejects invalid JSON", () => {
    const result = generateFromOpenApi("not json{{{");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, OPENAPI_PARSE_ERROR);
  });

  test("rejects spec without paths", () => {
    const result = generateFromOpenApi(JSON.stringify({ openapi: "3.0.0" }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, OPENAPI_INVALID_SPEC);
  });

  test("rejects spec with empty paths", () => {
    const result = generateFromOpenApi(
      JSON.stringify({ openapi: "3.0.0", paths: {} })
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, OPENAPI_NO_ENDPOINTS);
  });

  test("rejects non-object input", () => {
    const result = generateFromOpenApi(JSON.stringify("just a string"));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, OPENAPI_INVALID_SPEC);
  });

  test("rejects null input", () => {
    const result = generateFromOpenApi("null");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, OPENAPI_INVALID_SPEC);
  });

  test("rejects paths with no operations", () => {
    const result = generateFromOpenApi(
      JSON.stringify({
        openapi: "3.0.0",
        paths: { "/empty": {} },
      })
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, OPENAPI_NO_ENDPOINTS);
  });
});

// --- OpenAPI 3.x generation ---

suite("openApiGenerator — OpenAPI 3.x", () => {
  test("generates correct number of .nap files", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    assert.strictEqual(gen.napFiles.length, 1);
  });

  test("nap file has .nap extension", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const file = firstFile(gen);
    assert.ok(
      file.fileName.endsWith(NAP_EXTENSION),
      "file must end with .nap"
    );
  });

  test("nap file contains [meta] section with name", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const content = firstFile(gen).content;
    assert.ok(content.includes(SECTION_META), "must have [meta] section");
    assert.ok(
      content.includes(`${NAP_KEY_NAME} = List users`),
      "must have name from summary"
    );
  });

  test("nap file contains [request] section with GET method", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const content = firstFile(gen).content;
    assert.ok(content.includes(SECTION_REQUEST), "must have [request] section");
    assert.ok(
      content.includes(`GET ${BASE_URL_VAR}/users`),
      "must have GET method and URL"
    );
  });

  test("nap file contains [assert] section with status 200", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const content = firstFile(gen).content;
    assert.ok(content.includes(SECTION_ASSERT), "must have [assert] section");
    assert.ok(
      content.includes(`${ASSERT_STATUS_PREFIX}200`),
      "must assert status = 200"
    );
  });

  test("extracts base URL from servers array", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    assert.ok(
      gen.environment.content.includes("https://api.test.com/v1"),
      "env must contain server URL"
    );
  });

  test("environment file has .napenv extension", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    assert.strictEqual(gen.environment.fileName, NAPENV_EXTENSION);
  });

  test("environment file contains baseUrl key", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    assert.ok(
      gen.environment.content.includes(BASE_URL_KEY),
      "env must have baseUrl key"
    );
  });

  test("playlist file has .naplist extension", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    assert.ok(
      gen.playlist.fileName.endsWith(NAPLIST_EXTENSION),
      "playlist must end with .naplist"
    );
  });

  test("playlist contains [meta] and [steps] sections", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const content = gen.playlist.content;
    assert.ok(content.includes(SECTION_META), "playlist must have [meta]");
    assert.ok(content.includes(SECTION_STEPS), "playlist must have [steps]");
  });

  test("playlist references all generated nap files", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    for (const napFile of gen.napFiles) {
      assert.ok(
        gen.playlist.content.includes(napFile.fileName),
        `playlist must reference ${napFile.fileName}`
      );
    }
  });

  test("playlist name derived from spec title", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    assert.ok(
      gen.playlist.content.includes("Test API"),
      "playlist must have spec title as name"
    );
  });
});

// --- Swagger 2.x generation ---

suite("openApiGenerator — Swagger 2.x", () => {
  test("extracts base URL from host + basePath + scheme", () => {
    const gen = unwrap(MINIMAL_SWAGGER2_SPEC);
    assert.ok(
      gen.environment.content.includes("https://legacy.test.com/api"),
      "env must contain scheme://host/basePath URL"
    );
  });

  test("generates .nap file from Swagger 2 spec", () => {
    const gen = unwrap(MINIMAL_SWAGGER2_SPEC);
    assert.strictEqual(gen.napFiles.length, 1);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(`GET ${BASE_URL_VAR}/items`),
      "must have correct method and path"
    );
  });
});

// --- Multi-method and path param specs ---

suite("openApiGenerator — multiple endpoints", () => {
  test("generates one nap file per operation", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    assert.strictEqual(
      gen.napFiles.length,
      4,
      "should generate 4 files for 4 operations"
    );
  });

  test("files are numbered sequentially", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    assert.ok(
      fileAt(gen, 0).fileName.startsWith("01_"),
      "first file must start with 01_"
    );
    assert.ok(
      fileAt(gen, 1).fileName.startsWith("02_"),
      "second file must start with 02_"
    );
    assert.ok(
      fileAt(gen, 3).fileName.startsWith("04_"),
      "fourth file must start with 04_"
    );
  });

  test("path params converted from {param} to {{param}}", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    const petByIdFile = gen.napFiles.find((f) =>
      f.content.includes("getPetById")
    );
    assert.ok(petByIdFile, "must have getPetById file");
    assert.ok(
      petByIdFile.content.includes("{{petId}}"),
      "must convert {petId} to {{petId}}"
    );
    assert.ok(
      !petByIdFile.content.includes("/pets/{petId}"),
      "must not have original OpenAPI single-brace path /pets/{petId}"
    );
  });

  test("POST operations get status 201 assertion", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    const postFile = gen.napFiles.find((f) =>
      f.content.includes("Create pet")
    );
    assert.ok(postFile, "must have Create pet file");
    assert.ok(
      postFile.content.includes(`${ASSERT_STATUS_PREFIX}201`),
      "must assert status = 201"
    );
  });

  test("DELETE operations get status 204 assertion", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    const deleteFile = gen.napFiles.find((f) =>
      f.content.includes("Delete pet")
    );
    assert.ok(deleteFile, "must have Delete pet file");
    assert.ok(
      deleteFile.content.includes(`${ASSERT_STATUS_PREFIX}204`),
      "must assert status = 204"
    );
  });

  test("uses operationId for file name when no summary", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    const opIdFile = gen.napFiles.find((f) =>
      f.fileName.includes("getPetById")
    );
    assert.ok(opIdFile, "must use operationId in filename");
  });

  test("playlist references all 4 generated files", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    for (const napFile of gen.napFiles) {
      assert.ok(
        gen.playlist.content.includes(napFile.fileName),
        `playlist must reference ${napFile.fileName}`
      );
    }
  });
});

// --- Request body generation ---

suite("openApiGenerator — request bodies", () => {
  test("POST with headers includes Content-Type and Accept", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    const postFile = gen.napFiles.find((f) =>
      f.content.includes("Create pet")
    );
    assert.ok(postFile, "must have Create pet file");
    assert.ok(
      postFile.content.includes(SECTION_REQUEST_HEADERS),
      "POST must have [request.headers]"
    );
    assert.ok(
      postFile.content.includes(`${HEADER_CONTENT_TYPE} = ${CONTENT_TYPE_JSON}`),
      "POST must have Content-Type header"
    );
    assert.ok(
      postFile.content.includes(`${HEADER_ACCEPT} = ${CONTENT_TYPE_JSON}`),
      "POST must have Accept header"
    );
  });

  test("GET requests do not get request headers section", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const file = firstFile(gen);
    assert.ok(
      !file.content.includes(SECTION_REQUEST_HEADERS),
      "GET must not have [request.headers]"
    );
  });

  test("uses example value when provided", () => {
    const gen = unwrap(SPEC_WITH_EXAMPLE);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(SECTION_REQUEST_BODY),
      "must have [request.body]"
    );
    assert.ok(
      file.content.includes("Alice"),
      "must use example name value"
    );
    assert.ok(
      file.content.includes("alice@example.com"),
      "must use example email value"
    );
  });

  test("generates body from schema when no example", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    const postFile = gen.napFiles.find((f) =>
      f.content.includes("Create pet")
    );
    assert.ok(postFile, "must have Create pet file");
    assert.ok(
      postFile.content.includes(SECTION_REQUEST_BODY),
      "must have [request.body]"
    );
    assert.ok(
      postFile.content.includes(NAP_TRIPLE_QUOTE),
      "body must be wrapped in triple quotes"
    );
  });

  test("Swagger 2 body param generates request body", () => {
    const gen = unwrap(SWAGGER2_BODY_PARAM_SPEC);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(SECTION_REQUEST_BODY),
      "Swagger 2 body param must produce [request.body]"
    );
  });

  test("nested schema generates nested example values", () => {
    const gen = unwrap(NESTED_SCHEMA_SPEC);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(SECTION_REQUEST_BODY),
      "must have [request.body]"
    );
    assert.ok(
      file.content.includes("tags"),
      "must generate tags array field"
    );
    assert.ok(
      file.content.includes("metadata"),
      "must generate metadata object field"
    );
  });
});

// --- Base URL fallback ---

suite("openApiGenerator — base URL fallback", () => {
  test("falls back to default URL when no servers or host", () => {
    const gen = unwrap(NO_SERVERS_SPEC);
    assert.ok(
      gen.environment.content.includes(DEFAULT_BASE_URL),
      "must fall back to default base URL"
    );
  });

  test("Swagger 2 without schemes defaults to https", () => {
    const spec = JSON.stringify({
      swagger: "2.0",
      info: { title: "No Scheme" },
      host: "noscheme.test.com",
      paths: {
        "/ping": {
          get: {
            summary: "Ping",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    });
    const gen = unwrap(spec);
    assert.ok(
      gen.environment.content.includes("https://noscheme.test.com"),
      "must default to https scheme"
    );
  });
});

// --- Edge cases ---

suite("openApiGenerator — edge cases", () => {
  test("operation with no responses defaults to status 200", () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "No Responses" },
      paths: {
        "/void": {
          post: {
            summary: "Fire and forget",
          },
        },
      },
    });
    const gen = unwrap(spec);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(`${ASSERT_STATUS_PREFIX}200`),
      "must default to status = 200 when no responses"
    );
  });

  test("operation with only 4xx responses defaults to status 200", () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Error Only" },
      paths: {
        "/error": {
          get: {
            summary: "Always errors",
            responses: { "404": { description: "Not Found" } },
          },
        },
      },
    });
    const gen = unwrap(spec);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(`${ASSERT_STATUS_PREFIX}200`),
      "must default to 200 when no 2xx responses"
    );
  });

  test("spec with description populates meta description", () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Described API" },
      paths: {
        "/described": {
          get: {
            summary: "Described endpoint",
            description: "This does something important",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    });
    const gen = unwrap(spec);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes("This does something important"),
      "must include operation description in meta"
    );
  });

  test("spec with no title uses default playlist name", () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: {},
      paths: {
        "/test": {
          get: {
            summary: "Test",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    });
    const gen = unwrap(spec);
    assert.ok(
      gen.playlist.content.includes("API Tests"),
      "must use default title when none provided"
    );
  });

  test("multiple success codes picks lowest 2xx", () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Multi Success" },
      paths: {
        "/multi": {
          post: {
            summary: "Multi success",
            responses: {
              "202": { description: "Accepted" },
              "201": { description: "Created" },
              "200": { description: "OK" },
            },
          },
        },
      },
    });
    const gen = unwrap(spec);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(`${ASSERT_STATUS_PREFIX}200`),
      "must pick lowest 2xx status code (200)"
    );
  });

  test("HEAD and OPTIONS methods are supported", () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "HEAD OPTIONS" },
      paths: {
        "/resource": {
          head: {
            summary: "Head check",
            responses: { "200": { description: "OK" } },
          },
          options: {
            summary: "CORS preflight",
            responses: { "204": { description: "No Content" } },
          },
        },
      },
    });
    const gen = unwrap(spec);
    assert.strictEqual(gen.napFiles.length, 2, "must generate 2 files");
    const headFile = gen.napFiles.find((f) => f.content.includes("HEAD "));
    const optionsFile = gen.napFiles.find((f) =>
      f.content.includes("OPTIONS ")
    );
    assert.ok(headFile, "must have HEAD endpoint");
    assert.ok(optionsFile, "must have OPTIONS endpoint");
  });

  test("large spec with 100+ endpoints pads file numbers to 3 digits", () => {
    const paths: Record<string, unknown> = {};
    for (let i = 0; i < 101; i++) {
      paths[`/endpoint${i}`] = {
        get: {
          summary: `Endpoint ${i}`,
          responses: { "200": { description: "OK" } },
        },
      };
    }
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Large API" },
      paths,
    });
    const gen = unwrap(spec);
    assert.strictEqual(gen.napFiles.length, 101);
    const file = firstFile(gen);
    assert.ok(
      file.fileName.startsWith("001_"),
      "must pad to 3 digits for 100+ endpoints"
    );
  });
});

// --- Generated flag ---

suite("openApiGenerator — generated flag", () => {
  test("every nap file includes generated = true in meta", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    for (const napFile of gen.napFiles) {
      assert.ok(
        napFile.content.includes(`${NAP_KEY_GENERATED} = ${NAP_VALUE_TRUE}`),
        `${napFile.fileName} must have generated = true`
      );
    }
  });

  test("generated flag appears after name in meta section", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const content = firstFile(gen).content;
    const nameIdx = content.indexOf(`${NAP_KEY_NAME} =`);
    const genIdx = content.indexOf(`${NAP_KEY_GENERATED} =`);
    assert.ok(nameIdx >= 0, "must have name line");
    assert.ok(genIdx >= 0, "must have generated line");
    assert.ok(genIdx > nameIdx, "generated must come after name");
  });
});

// --- Vars block for path parameters ---

suite("openApiGenerator — vars block", () => {
  test("path with parameters generates [vars] section", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    const petByIdFile = gen.napFiles.find((f) =>
      f.content.includes("getPetById")
    );
    assert.ok(petByIdFile, "must have getPetById file");
    assert.ok(
      petByIdFile.content.includes(SECTION_VARS),
      "must have [vars] section for path with params"
    );
    assert.ok(
      petByIdFile.content.includes(`petId = "${VARS_PLACEHOLDER}"`),
      "must have petId var with placeholder"
    );
  });

  test("path without parameters has no [vars] section", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const file = firstFile(gen);
    assert.ok(
      !file.content.includes(SECTION_VARS),
      "path without params must not have [vars]"
    );
  });

  test("vars section appears between meta and request", () => {
    const gen = unwrap(MULTI_METHOD_SPEC);
    const petByIdFile = gen.napFiles.find((f) =>
      f.content.includes("getPetById")
    );
    assert.ok(petByIdFile, "must have getPetById file");
    const metaIdx = petByIdFile.content.indexOf(SECTION_META);
    const varsIdx = petByIdFile.content.indexOf(SECTION_VARS);
    const reqIdx = petByIdFile.content.indexOf(SECTION_REQUEST);
    assert.ok(varsIdx > metaIdx, "[vars] must come after [meta]");
    assert.ok(varsIdx < reqIdx, "[vars] must come before [request]");
  });

  test("multiple path params each get a var entry", () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Multi Param" },
      paths: {
        "/orgs/{orgId}/users/{userId}": {
          get: {
            summary: "Get org user",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    });
    const gen = unwrap(spec);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(`orgId = "${VARS_PLACEHOLDER}"`),
      "must have orgId var"
    );
    assert.ok(
      file.content.includes(`userId = "${VARS_PLACEHOLDER}"`),
      "must have userId var"
    );
  });
});

// --- Response body assertions ---

const SPEC_WITH_RESPONSE_SCHEMA = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Response Schema API" },
  servers: [{ url: "https://schema.test.com" }],
  paths: {
    "/users/{userId}": {
      get: {
        summary: "Get user",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    name: { type: "string" },
                    email: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

const SWAGGER2_RESPONSE_SCHEMA_SPEC = JSON.stringify({
  swagger: "2.0",
  info: { title: "Swagger Response" },
  host: "swagger.test.com",
  schemes: ["https"],
  paths: {
    "/items": {
      get: {
        summary: "List items",
        responses: {
          "200": {
            description: "OK",
            schema: {
              type: "object",
              properties: {
                total: { type: "integer" },
                items: { type: "array" },
              },
            },
          },
        },
      },
    },
  },
});

suite("openApiGenerator — response body assertions", () => {
  test("OAS3 response schema generates body.field exists assertions", () => {
    const gen = unwrap(SPEC_WITH_RESPONSE_SCHEMA);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(`${ASSERT_BODY_PREFIX}id${ASSERT_BODY_EXISTS_SUFFIX}`),
      "must assert body.id exists"
    );
    assert.ok(
      file.content.includes(`${ASSERT_BODY_PREFIX}name${ASSERT_BODY_EXISTS_SUFFIX}`),
      "must assert body.name exists"
    );
    assert.ok(
      file.content.includes(`${ASSERT_BODY_PREFIX}email${ASSERT_BODY_EXISTS_SUFFIX}`),
      "must assert body.email exists"
    );
  });

  test("Swagger 2 response schema generates body assertions", () => {
    const gen = unwrap(SWAGGER2_RESPONSE_SCHEMA_SPEC);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(`${ASSERT_BODY_PREFIX}total${ASSERT_BODY_EXISTS_SUFFIX}`),
      "must assert body.total exists"
    );
    assert.ok(
      file.content.includes(`${ASSERT_BODY_PREFIX}items${ASSERT_BODY_EXISTS_SUFFIX}`),
      "must assert body.items exists"
    );
  });

  test("body assertions appear after status assertion", () => {
    const gen = unwrap(SPEC_WITH_RESPONSE_SCHEMA);
    const file = firstFile(gen);
    const statusIdx = file.content.indexOf(ASSERT_STATUS_PREFIX);
    const bodyIdx = file.content.indexOf(ASSERT_BODY_PREFIX);
    assert.ok(statusIdx >= 0, "must have status assertion");
    assert.ok(bodyIdx >= 0, "must have body assertion");
    assert.ok(bodyIdx > statusIdx, "body assertions must come after status");
  });

  test("no body assertions when response has no schema", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const file = firstFile(gen);
    assert.ok(
      !file.content.includes(ASSERT_BODY_PREFIX),
      "must not have body assertions when no response schema"
    );
  });

  test("response assertions combined with vars and generated flag", () => {
    const gen = unwrap(SPEC_WITH_RESPONSE_SCHEMA);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(`${NAP_KEY_GENERATED} = ${NAP_VALUE_TRUE}`),
      "must have generated flag"
    );
    assert.ok(
      file.content.includes(SECTION_VARS),
      "must have [vars] for path params"
    );
    assert.ok(
      file.content.includes(`${ASSERT_BODY_PREFIX}id${ASSERT_BODY_EXISTS_SUFFIX}`),
      "must have body assertions"
    );
    assert.ok(
      file.content.includes(`${ASSERT_STATUS_PREFIX}200`),
      "must have status assertion"
    );
  });
});

// --- Tag-based folder organization ---

const TAGGED_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Tagged API" },
  servers: [{ url: "https://tagged.test.com" }],
  paths: {
    "/users": {
      get: {
        tags: ["users"],
        summary: "List users",
        responses: { "200": { description: "OK" } },
      },
      post: {
        tags: ["users"],
        summary: "Create user",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { name: { type: "string" } } },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/pets": {
      get: {
        tags: ["pets"],
        summary: "List pets",
        responses: { "200": { description: "OK" } },
      },
    },
    "/health": {
      get: {
        summary: "Health check",
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

suite("openApiGenerator — tag-based folders", () => {
  test("tagged operations get tag subdirectory prefix", () => {
    const gen = unwrap(TAGGED_SPEC);
    const userFiles = gen.napFiles.filter((f) =>
      f.fileName.startsWith("users/")
    );
    assert.strictEqual(
      userFiles.length,
      2,
      "must have 2 files in users/ directory"
    );
  });

  test("different tags create different subdirectories", () => {
    const gen = unwrap(TAGGED_SPEC);
    const petFiles = gen.napFiles.filter((f) =>
      f.fileName.startsWith("pets/")
    );
    assert.strictEqual(
      petFiles.length,
      1,
      "must have 1 file in pets/ directory"
    );
  });

  test("untagged operations stay in root directory", () => {
    const gen = unwrap(TAGGED_SPEC);
    const healthFile = gen.napFiles.find((f) =>
      f.content.includes("Health check")
    );
    assert.ok(healthFile, "must have health check file");
    assert.ok(
      !healthFile.fileName.includes("/"),
      "untagged file must not have subdirectory"
    );
  });

  test("playlist references files with subdirectory paths", () => {
    const gen = unwrap(TAGGED_SPEC);
    const content = gen.playlist.content;
    assert.ok(
      content.includes("./users/"),
      "playlist must reference users/ subdirectory"
    );
    assert.ok(
      content.includes("./pets/"),
      "playlist must reference pets/ subdirectory"
    );
  });

  test("spec without tags produces flat file structure", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const file = firstFile(gen);
    assert.ok(
      !file.fileName.includes("/"),
      "untagged spec must produce flat files"
    );
  });

  test("total file count matches total operations regardless of tags", () => {
    const gen = unwrap(TAGGED_SPEC);
    assert.strictEqual(
      gen.napFiles.length,
      4,
      "must generate one file per operation"
    );
  });
});

// --- Query parameter specs ---

const SPEC_WITH_QUERY_PARAMS = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Query Params API" },
  servers: [{ url: "https://query.test.com" }],
  paths: {
    "/search": {
      get: {
        summary: "Search items",
        parameters: [
          { name: "q", in: "query" },
          { name: "limit", in: "query" },
          { name: "offset", in: "query" },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

const SPEC_WITH_MIXED_PARAMS = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Mixed Params API" },
  servers: [{ url: "https://mixed.test.com" }],
  paths: {
    "/users/{userId}/posts": {
      get: {
        summary: "Get user posts",
        parameters: [
          { name: "userId", in: "path" },
          { name: "page", in: "query" },
          { name: "sort", in: "query" },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

suite("openApiGenerator — query parameters", () => {
  test("query params appended to URL as query string", () => {
    const gen = unwrap(SPEC_WITH_QUERY_PARAMS);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes("?q={{q}}&limit={{limit}}&offset={{offset}}"),
      "must append query params as ?key={{key}}&... to URL"
    );
  });

  test("query params added to [vars] section", () => {
    const gen = unwrap(SPEC_WITH_QUERY_PARAMS);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(SECTION_VARS),
      "must have [vars] for query params"
    );
    assert.ok(
      file.content.includes(`q = "${VARS_PLACEHOLDER}"`),
      "must have q var"
    );
    assert.ok(
      file.content.includes(`limit = "${VARS_PLACEHOLDER}"`),
      "must have limit var"
    );
    assert.ok(
      file.content.includes(`offset = "${VARS_PLACEHOLDER}"`),
      "must have offset var"
    );
  });

  test("mixed path and query params both appear in vars", () => {
    const gen = unwrap(SPEC_WITH_MIXED_PARAMS);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(`userId = "${VARS_PLACEHOLDER}"`),
      "must have path param userId var"
    );
    assert.ok(
      file.content.includes(`page = "${VARS_PLACEHOLDER}"`),
      "must have query param page var"
    );
    assert.ok(
      file.content.includes(`sort = "${VARS_PLACEHOLDER}"`),
      "must have query param sort var"
    );
  });

  test("path params converted and query params appended together", () => {
    const gen = unwrap(SPEC_WITH_MIXED_PARAMS);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes("{{userId}}/posts?page={{page}}&sort={{sort}}"),
      "must have converted path params and appended query string"
    );
  });

  test("no query string when no query params", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const file = firstFile(gen);
    assert.ok(
      !file.content.includes("?"),
      "must not have query string when no query params"
    );
  });
});

// --- Auth scheme specs ---

const SPEC_WITH_BEARER_AUTH = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Bearer Auth API" },
  servers: [{ url: "https://auth.test.com" }],
  paths: {
    "/protected": {
      get: {
        summary: "Protected resource",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
});

const SPEC_WITH_BASIC_AUTH = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Basic Auth API" },
  servers: [{ url: "https://basic.test.com" }],
  paths: {
    "/admin": {
      get: {
        summary: "Admin panel",
        security: [{ basicAuth: [] }],
        responses: { "200": { description: "OK" } },
      },
    },
  },
  components: {
    securitySchemes: {
      basicAuth: { type: "http", scheme: "basic" },
    },
  },
});

const SPEC_WITH_API_KEY = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "API Key API" },
  servers: [{ url: "https://apikey.test.com" }],
  paths: {
    "/data": {
      get: {
        summary: "Get data",
        security: [{ apiKeyAuth: [] }],
        responses: { "200": { description: "OK" } },
      },
    },
  },
  components: {
    securitySchemes: {
      apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
  },
});

const SPEC_WITH_GLOBAL_SECURITY = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Global Security API" },
  servers: [{ url: "https://global.test.com" }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/items": {
      get: {
        summary: "List items",
        responses: { "200": { description: "OK" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
});

const SWAGGER2_WITH_SECURITY = JSON.stringify({
  swagger: "2.0",
  info: { title: "Swagger Security" },
  host: "secure.test.com",
  schemes: ["https"],
  security: [{ bearerAuth: [] }],
  securityDefinitions: {
    bearerAuth: { type: "http", scheme: "bearer" },
  },
  paths: {
    "/secure": {
      get: {
        summary: "Secure endpoint",
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

suite("openApiGenerator — auth schemes", () => {
  test("bearer auth adds Authorization header", () => {
    const gen = unwrap(SPEC_WITH_BEARER_AUTH);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(SECTION_REQUEST_HEADERS),
      "must have [request.headers] for auth"
    );
    assert.ok(
      file.content.includes("Authorization = Bearer {{token}}"),
      "must have Authorization = Bearer {{token}} header"
    );
  });

  test("bearer auth adds token to [vars]", () => {
    const gen = unwrap(SPEC_WITH_BEARER_AUTH);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(SECTION_VARS),
      "must have [vars] for auth token"
    );
    assert.ok(
      file.content.includes(`token = "${VARS_PLACEHOLDER}"`),
      "must have token var"
    );
  });

  test("basic auth adds Authorization header", () => {
    const gen = unwrap(SPEC_WITH_BASIC_AUTH);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes("Authorization = Basic {{basicAuth}}"),
      "must have Authorization = Basic {{basicAuth}} header"
    );
    assert.ok(
      file.content.includes(`basicAuth = "${VARS_PLACEHOLDER}"`),
      "must have basicAuth var"
    );
  });

  test("API key auth adds custom header", () => {
    const gen = unwrap(SPEC_WITH_API_KEY);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes("X-API-Key = {{apiKey}}"),
      "must have X-API-Key = {{apiKey}} header"
    );
    assert.ok(
      file.content.includes(`apiKey = "${VARS_PLACEHOLDER}"`),
      "must have apiKey var"
    );
  });

  test("global security applies to all operations", () => {
    const gen = unwrap(SPEC_WITH_GLOBAL_SECURITY);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes("Authorization = Bearer {{token}}"),
      "global security must apply to operations"
    );
  });

  test("Swagger 2 securityDefinitions resolved", () => {
    const gen = unwrap(SWAGGER2_WITH_SECURITY);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes("Authorization = Bearer {{token}}"),
      "Swagger 2 security must resolve via securityDefinitions"
    );
  });

  test("no auth headers when no security defined", () => {
    const gen = unwrap(MINIMAL_OAS3_SPEC);
    const file = firstFile(gen);
    assert.ok(
      !file.content.includes("Authorization"),
      "must not have Authorization header when no security"
    );
  });

  test("auth vars not duplicated with path params", () => {
    const spec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Auth + Path" },
      servers: [{ url: "https://combo.test.com" }],
      paths: {
        "/users/{userId}": {
          get: {
            summary: "Get user",
            security: [{ bearerAuth: [] }],
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer" },
        },
      },
    });
    const gen = unwrap(spec);
    const file = firstFile(gen);
    assert.ok(
      file.content.includes(SECTION_VARS),
      "must have [vars] section"
    );
    assert.ok(
      file.content.includes(`userId = "${VARS_PLACEHOLDER}"`),
      "must have userId var"
    );
    assert.ok(
      file.content.includes(`token = "${VARS_PLACEHOLDER}"`),
      "must have token var"
    );
  });
});
