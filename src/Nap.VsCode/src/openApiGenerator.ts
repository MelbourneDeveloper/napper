// OpenAPI → .nap file generator
// Pure functions — no VS Code SDK dependency

import { type Result, ok, err } from "./types";
import {
  NAP_EXTENSION,
  NAPLIST_EXTENSION,
  NAPENV_EXTENSION,
  SECTION_META,
  SECTION_REQUEST,
  SECTION_REQUEST_HEADERS,
  SECTION_REQUEST_BODY,
  SECTION_ASSERT,
  SECTION_STEPS,
  NAP_TRIPLE_QUOTE,
  HEADER_CONTENT_TYPE,
  HEADER_ACCEPT,
  CONTENT_TYPE_JSON,
  ASSERT_STATUS_PREFIX,
  NAP_KEY_NAME,
  NAP_KEY_DESCRIPTION,
  BASE_URL_VAR,
  BASE_URL_KEY,
  HTTPS_SCHEME,
  DEFAULT_BASE_URL,
  OPENAPI_DEFAULT_TITLE,
  OPENAPI_HTTP_METHODS,
  PARAM_IN_BODY,
  SCHEMA_TYPE_STRING,
  SCHEMA_TYPE_NUMBER,
  SCHEMA_TYPE_INTEGER,
  SCHEMA_TYPE_BOOLEAN,
  SCHEMA_TYPE_ARRAY,
  SCHEMA_TYPE_OBJECT,
  SCHEMA_EXAMPLE_STRING,
  OPENAPI_INVALID_SPEC,
  OPENAPI_NO_ENDPOINTS,
  OPENAPI_PARSE_ERROR,
} from "./constants";

// --- OpenAPI spec types (minimal, all optional) ---

interface OpenApiSchema {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, OpenApiSchema>>;
  readonly items?: OpenApiSchema;
  readonly example?: unknown;
  readonly required?: readonly string[];
}

interface OpenApiMediaType {
  readonly schema?: OpenApiSchema;
  readonly example?: unknown;
}

interface OpenApiRequestBody {
  readonly content?: Readonly<Record<string, OpenApiMediaType>>;
}

interface OpenApiParameter {
  readonly name: string;
  readonly in: string;
  readonly schema?: OpenApiSchema;
  readonly example?: unknown;
}

interface OpenApiOperation {
  readonly summary?: string;
  readonly description?: string;
  readonly operationId?: string;
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: OpenApiRequestBody;
  readonly responses?: Readonly<Record<string, unknown>>;
}

interface OpenApiPathItem {
  readonly get?: OpenApiOperation;
  readonly post?: OpenApiOperation;
  readonly put?: OpenApiOperation;
  readonly patch?: OpenApiOperation;
  readonly delete?: OpenApiOperation;
  readonly head?: OpenApiOperation;
  readonly options?: OpenApiOperation;
  readonly parameters?: readonly OpenApiParameter[];
}

interface OpenApiSpec {
  readonly openapi?: string;
  readonly swagger?: string;
  readonly info?: { readonly title?: string; readonly description?: string };
  readonly servers?: readonly { readonly url: string }[];
  readonly host?: string;
  readonly basePath?: string;
  readonly schemes?: readonly string[];
  readonly paths?: Readonly<Record<string, OpenApiPathItem>>;
}

// --- Output types ---

export interface GeneratedFile {
  readonly fileName: string;
  readonly content: string;
}

export interface GenerationResult {
  readonly napFiles: readonly GeneratedFile[];
  readonly playlist: GeneratedFile;
  readonly environment: GeneratedFile;
}

// --- Internal descriptor ---

interface EndpointDescriptor {
  readonly method: string;
  readonly urlPath: string;
  readonly operation: OpenApiOperation;
}

// --- Pure helpers ---

const extractBaseUrl = (spec: OpenApiSpec): string => {
  if (spec.servers && spec.servers.length > 0) {
    return spec.servers[0].url;
  }
  if (spec.host) {
    const scheme =
      spec.schemes && spec.schemes.length > 0 ? spec.schemes[0] : HTTPS_SCHEME;
    return `${scheme}://${spec.host}${spec.basePath ?? ""}`;
  }
  return DEFAULT_BASE_URL;
};

const convertPathParams = (urlPath: string): string => {
  let result = "";
  for (const char of urlPath) {
    if (char === "{") {
      result += "{{";
    } else if (char === "}") {
      result += "}}";
    } else {
      result += char;
    }
  }
  return result;
};

const splitOnDelimiters = (text: string): readonly string[] => {
  const parts: string[] = [];
  let current = "";
  for (const char of text) {
    if (char === "/" || char === "{" || char === "}" || char === " ") {
      if (current.length > 0) {
        parts.push(current.toLowerCase());
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current.length > 0) parts.push(current.toLowerCase());
  return parts;
};

const pathToSlug = (method: string, urlPath: string): string => {
  const parts = splitOnDelimiters(urlPath);
  return parts.length > 0
    ? `${method.toLowerCase()}-${parts.join("-")}`
    : method.toLowerCase();
};

const titleToSlug = (title: string): string => {
  const parts = splitOnDelimiters(title);
  return parts.length > 0 ? parts.join("-") : "api-tests";
};

const generateExampleValue = (schema: OpenApiSchema): unknown => {
  if (schema.example !== undefined) return schema.example;
  if (schema.type === SCHEMA_TYPE_STRING) return SCHEMA_EXAMPLE_STRING;
  if (schema.type === SCHEMA_TYPE_NUMBER) return 0;
  if (schema.type === SCHEMA_TYPE_INTEGER) return 0;
  if (schema.type === SCHEMA_TYPE_BOOLEAN) return true;
  if (schema.type === SCHEMA_TYPE_ARRAY) {
    return schema.items ? [generateExampleValue(schema.items)] : [];
  }
  if (schema.type === SCHEMA_TYPE_OBJECT && schema.properties) {
    const obj: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      obj[key] = generateExampleValue(prop);
    }
    return obj;
  }
  return null;
};

const extractRequestBody = (
  operation: OpenApiOperation
): string | undefined => {
  // OpenAPI 3.x: requestBody.content["application/json"]
  const jsonContent = operation.requestBody?.content?.[CONTENT_TYPE_JSON];
  if (jsonContent) {
    if (jsonContent.example !== undefined) {
      return JSON.stringify(jsonContent.example, null, 2);
    }
    if (jsonContent.schema) {
      return JSON.stringify(generateExampleValue(jsonContent.schema), null, 2);
    }
  }
  // Swagger 2.x: parameter with in=body
  const bodyParam = operation.parameters?.find((p) => p.in === PARAM_IN_BODY);
  if (bodyParam?.schema) {
    if (bodyParam.example !== undefined) {
      return JSON.stringify(bodyParam.example, null, 2);
    }
    return JSON.stringify(generateExampleValue(bodyParam.schema), null, 2);
  }
  return undefined;
};

const findSuccessStatusCode = (
  responses: Readonly<Record<string, unknown>> | undefined
): number => {
  if (!responses) return 200;
  const codes = Object.keys(responses)
    .map(Number)
    .filter((n) => !isNaN(n) && n >= 200 && n < 300)
    .sort((a, b) => a - b);
  return codes.length > 0 ? codes[0] : 200;
};

const methodHasBody = (method: string): boolean =>
  method === "post" || method === "put" || method === "patch";

// --- .nap content builders (each section) ---

const buildMetaLines = (ep: EndpointDescriptor): readonly string[] => {
  const name =
    ep.operation.summary ??
    ep.operation.operationId ??
    pathToSlug(ep.method, ep.urlPath);
  const lines = [SECTION_META, `${NAP_KEY_NAME} = ${name}`];
  if (ep.operation.description) {
    lines.push(`${NAP_KEY_DESCRIPTION} = ${ep.operation.description}`);
  }
  return [...lines, ""];
};

const buildRequestLines = (ep: EndpointDescriptor): readonly string[] => [
  SECTION_REQUEST,
  `${ep.method.toUpperCase()} ${BASE_URL_VAR}${convertPathParams(ep.urlPath)}`,
  "",
];

const buildHeaderLines = (method: string): readonly string[] =>
  methodHasBody(method)
    ? [
        SECTION_REQUEST_HEADERS,
        `${HEADER_CONTENT_TYPE} = ${CONTENT_TYPE_JSON}`,
        `${HEADER_ACCEPT} = ${CONTENT_TYPE_JSON}`,
        "",
      ]
    : [];

const buildBodyLines = (ep: EndpointDescriptor): readonly string[] => {
  if (!methodHasBody(ep.method)) return [];
  const body = extractRequestBody(ep.operation);
  if (!body) return [];
  return [SECTION_REQUEST_BODY, NAP_TRIPLE_QUOTE, body, NAP_TRIPLE_QUOTE, ""];
};

const buildAssertLines = (op: OpenApiOperation): readonly string[] => [
  SECTION_ASSERT,
  `${ASSERT_STATUS_PREFIX}${findSuccessStatusCode(op.responses)}`,
  "",
];

const buildNapContent = (ep: EndpointDescriptor): string =>
  [
    ...buildMetaLines(ep),
    ...buildRequestLines(ep),
    ...buildHeaderLines(ep.method),
    ...buildBodyLines(ep),
    ...buildAssertLines(ep.operation),
  ].join("\n");

// --- Collectors ---

const collectEndpoints = (
  paths: Readonly<Record<string, OpenApiPathItem>>
): readonly EndpointDescriptor[] => {
  const endpoints: EndpointDescriptor[] = [];
  for (const [urlPath, pathItem] of Object.entries(paths)) {
    for (const method of OPENAPI_HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation) {
        endpoints.push({ method, urlPath, operation });
      }
    }
  }
  return endpoints;
};

const padIndex = (index: number, total: number): string => {
  const digits = total >= 100 ? 3 : 2;
  return String(index + 1).padStart(digits, "0");
};

const buildPlaylistContent = (
  title: string,
  napFileNames: readonly string[]
): string => {
  const lines = [SECTION_META, `${NAP_KEY_NAME} = ${title}`, "", SECTION_STEPS];
  for (const fileName of napFileNames) {
    lines.push(`./${fileName}`);
  }
  lines.push("");
  return lines.join("\n");
};

const buildEnvironmentContent = (baseUrl: string): string =>
  `${BASE_URL_KEY} = ${baseUrl}\n`;

// --- Validation ---

const validateSpec = (raw: unknown): Result<OpenApiSpec, string> => {
  if (typeof raw !== "object" || raw === null) {
    return err(OPENAPI_INVALID_SPEC);
  }
  if (!("paths" in raw)) {
    return err(OPENAPI_INVALID_SPEC);
  }
  return ok(raw as OpenApiSpec);
};

const safeJsonParse = (text: string): Result<unknown, string> => {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    return err(OPENAPI_PARSE_ERROR);
  }
};

// --- Main export ---

export const generateFromOpenApi = (
  jsonText: string
): Result<GenerationResult, string> => {
  const parseResult = safeJsonParse(jsonText);
  if (!parseResult.ok) return parseResult;

  const specResult = validateSpec(parseResult.value);
  if (!specResult.ok) return specResult;

  const spec = specResult.value;
  if (!spec.paths) return err(OPENAPI_NO_ENDPOINTS);

  const endpoints = collectEndpoints(spec.paths);
  if (endpoints.length === 0) return err(OPENAPI_NO_ENDPOINTS);

  const baseUrl = extractBaseUrl(spec);
  const title = spec.info?.title ?? OPENAPI_DEFAULT_TITLE;

  const napFiles: readonly GeneratedFile[] = endpoints.map((ep, index) => {
    const slug = ep.operation.operationId ?? pathToSlug(ep.method, ep.urlPath);
    const fileName = `${padIndex(index, endpoints.length)}_${slug}${NAP_EXTENSION}`;
    return { fileName, content: buildNapContent(ep) };
  });

  const playlist: GeneratedFile = {
    fileName: `${titleToSlug(title)}${NAPLIST_EXTENSION}`,
    content: buildPlaylistContent(title, napFiles.map((f) => f.fileName)),
  };

  const environment: GeneratedFile = {
    fileName: NAPENV_EXTENSION,
    content: buildEnvironmentContent(baseUrl),
  };

  return ok({ napFiles, playlist, environment });
};
