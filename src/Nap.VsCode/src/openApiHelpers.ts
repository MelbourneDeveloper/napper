// OpenAPI helper types and pure utility functions
// Extracted from openApiGenerator.ts to stay under 450 LOC

import { type Result, ok, err } from "./types";
import {
  HTTPS_SCHEME,
  DEFAULT_BASE_URL,
  PARAM_IN_BODY,
  PARAM_IN_QUERY,
  SCHEMA_TYPE_STRING,
  SCHEMA_TYPE_NUMBER,
  SCHEMA_TYPE_INTEGER,
  SCHEMA_TYPE_BOOLEAN,
  SCHEMA_TYPE_ARRAY,
  SCHEMA_TYPE_OBJECT,
  SCHEMA_EXAMPLE_STRING,
  CONTENT_TYPE_JSON,
  AUTH_BEARER_PREFIX,
  AUTH_BASIC_PREFIX,
  SECURITY_TYPE_HTTP,
  SECURITY_SCHEME_BEARER,
  SECURITY_SCHEME_BASIC,
  SECURITY_TYPE_API_KEY,
  SECURITY_LOCATION_HEADER,
  OPENAPI_INVALID_SPEC,
  OPENAPI_PARSE_ERROR,
  HTTP_STATUS_OK,
  HTTP_STATUS_REDIRECT_MIN,
  JSON_INDENT_SIZE,
  PAD_DIGITS_DEFAULT,
  PAD_DIGITS_LARGE,
  PAD_LARGE_THRESHOLD,
} from "./constants";

// --- OpenAPI spec types (minimal, all optional) ---

export interface OpenApiSchema {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, OpenApiSchema>>;
  readonly items?: OpenApiSchema;
  readonly example?: unknown;
  readonly required?: readonly string[];
}

export interface OpenApiMediaType {
  readonly schema?: OpenApiSchema;
  readonly example?: unknown;
}

export interface OpenApiRequestBody {
  readonly content?: Readonly<Record<string, OpenApiMediaType>>;
}

export interface OpenApiParameter {
  readonly name: string;
  readonly in: string;
  readonly schema?: OpenApiSchema;
  readonly example?: unknown;
}

export interface OpenApiResponse {
  readonly description?: string;
  readonly content?: Readonly<Record<string, OpenApiMediaType>>;
  readonly schema?: OpenApiSchema;
}

export interface OpenApiOperation {
  readonly summary?: string;
  readonly description?: string;
  readonly operationId?: string;
  readonly tags?: readonly string[];
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: OpenApiRequestBody;
  readonly responses?: Readonly<Record<string, OpenApiResponse>>;
  readonly security?: ReadonlyArray<
    Readonly<Record<string, readonly string[]>>
  >;
}

export interface OpenApiPathItem {
  readonly get?: OpenApiOperation;
  readonly post?: OpenApiOperation;
  readonly put?: OpenApiOperation;
  readonly patch?: OpenApiOperation;
  readonly delete?: OpenApiOperation;
  readonly head?: OpenApiOperation;
  readonly options?: OpenApiOperation;
  readonly parameters?: readonly OpenApiParameter[];
}

export interface OpenApiSecurityScheme {
  readonly type: string;
  readonly scheme?: string;
  readonly in?: string;
  readonly name?: string;
}

export interface OpenApiSpec {
  readonly openapi?: string;
  readonly swagger?: string;
  readonly info?: {
    readonly title?: string;
    readonly description?: string;
  };
  readonly servers?: ReadonlyArray<{ readonly url: string }>;
  readonly host?: string;
  readonly basePath?: string;
  readonly schemes?: readonly string[];
  readonly paths?: Readonly<Record<string, OpenApiPathItem>>;
  readonly security?: ReadonlyArray<
    Readonly<Record<string, readonly string[]>>
  >;
  readonly components?: {
    readonly securitySchemes?: Readonly<
      Record<string, OpenApiSecurityScheme>
    >;
  };
  readonly securityDefinitions?: Readonly<
    Record<string, OpenApiSecurityScheme>
  >;
}

// --- Internal descriptor types ---

export interface AuthHeader {
  readonly headerName: string;
  readonly headerValue: string;
  readonly varName: string;
}

export interface EndpointDescriptor {
  readonly method: string;
  readonly urlPath: string;
  readonly operation: OpenApiOperation;
  readonly queryParams: readonly string[];
  readonly authHeaders: readonly AuthHeader[];
}

export interface TagGroup {
  readonly tag: string | undefined;
  readonly endpoints: readonly EndpointDescriptor[];
}

// --- Pure text helpers ---

export const convertPathParams = (urlPath: string): string => {
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
  if (current.length > 0) {
    parts.push(current.toLowerCase());
  }
  return parts;
};

export const pathToSlug = (method: string, urlPath: string): string => {
  const parts = splitOnDelimiters(urlPath);
  return parts.length > 0
    ? `${method.toLowerCase()}-${parts.join("-")}`
    : method.toLowerCase();
};

export const titleToSlug = (title: string): string => {
  const parts = splitOnDelimiters(title);
  return parts.length > 0 ? parts.join("-") : "api-tests";
};

// --- Schema example generation ---
// exampleByType and sub-helpers are defined before generateExampleValue
// so that the const arrow functions are available when called.
// generateExampleValue uses function declaration (hoisted) so the
// recursive calls from exampleForArray/exampleForObject resolve correctly.

const buildPrimitiveExamples = (): ReadonlyMap<string, unknown> => {
  const m = new Map<string, unknown>();
  m.set(SCHEMA_TYPE_STRING, SCHEMA_EXAMPLE_STRING);
  m.set(SCHEMA_TYPE_NUMBER, 0);
  m.set(SCHEMA_TYPE_INTEGER, 0);
  m.set(SCHEMA_TYPE_BOOLEAN, true);
  return m;
};

const PRIMITIVE_EXAMPLES = buildPrimitiveExamples();

const exampleForArray = (schema: OpenApiSchema): unknown =>
  schema.items !== undefined ? [generateExampleValue(schema.items)] : [];

const exampleForObject = (schema: OpenApiSchema): unknown => {
  const obj: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    obj[key] = generateExampleValue(prop);
  }
  return obj;
};

const exampleByType = (schema: OpenApiSchema): unknown => {
  if (schema.type === undefined) {
    return null;
  }
  const primitive = PRIMITIVE_EXAMPLES.get(schema.type);
  if (primitive !== undefined) {
    return primitive;
  }
  if (schema.type === SCHEMA_TYPE_ARRAY) {
    return exampleForArray(schema);
  }
  if (schema.type === SCHEMA_TYPE_OBJECT && schema.properties !== undefined) {
    return exampleForObject(schema);
  }
  return null;
};

export function generateExampleValue(schema: OpenApiSchema): unknown {
  if (schema.example !== undefined) {
    return schema.example;
  }
  return exampleByType(schema);
}

// --- Request body extraction ---

const extractOas3Body = (
  content: OpenApiMediaType
): string | undefined => {
  if (content.example !== undefined) {
    return JSON.stringify(content.example, null, JSON_INDENT_SIZE);
  }
  if (content.schema !== undefined) {
    return JSON.stringify(
      generateExampleValue(content.schema),
      null,
      JSON_INDENT_SIZE,
    );
  }
  return undefined;
};

const extractSwagger2Body = (
  param: OpenApiParameter
): string | undefined => {
  if (param.schema === undefined) {
    return undefined;
  }
  if (param.example !== undefined) {
    return JSON.stringify(param.example, null, JSON_INDENT_SIZE);
  }
  return JSON.stringify(
    generateExampleValue(param.schema),
    null,
    JSON_INDENT_SIZE,
  );
};

export const extractRequestBody = (
  operation: OpenApiOperation
): string | undefined => {
  const jsonContent = operation.requestBody?.content?.[CONTENT_TYPE_JSON];
  if (jsonContent !== undefined) {
    return extractOas3Body(jsonContent);
  }
  const bodyParam = operation.parameters?.find(
    (p) => p.in === PARAM_IN_BODY,
  );
  if (bodyParam !== undefined) {
    return extractSwagger2Body(bodyParam);
  }
  return undefined;
};

// --- Status code helpers ---

export const findSuccessStatusCode = (
  responses: Readonly<Record<string, OpenApiResponse>> | undefined
): number => {
  if (responses === undefined) {
    return HTTP_STATUS_OK;
  }
  const codes = Object.keys(responses)
    .map(Number)
    .filter(
      (n) =>
        !isNaN(n) && n >= HTTP_STATUS_OK && n < HTTP_STATUS_REDIRECT_MIN,
    )
    .sort((a, b) => a - b);
  const firstCode = codes[0];
  return firstCode ?? HTTP_STATUS_OK;
};

// --- Response schema extraction ---

export const extractResponseSchema = (
  responses: Readonly<Record<string, OpenApiResponse>> | undefined
): OpenApiSchema | undefined => {
  if (responses === undefined) {
    return undefined;
  }
  const successCode = String(findSuccessStatusCode(responses));
  const response = responses[successCode];
  if (response === undefined) {
    return undefined;
  }
  const jsonMedia = response.content?.[CONTENT_TYPE_JSON];
  if (jsonMedia?.schema !== undefined) {
    return jsonMedia.schema;
  }
  return response.schema;
};

// --- Path/query param extraction ---

const processPathChar = (
  char: string,
  state: { inside: boolean; current: string; params: string[] }
): void => {
  if (char === "{") {
    state.inside = true;
    state.current = "";
  } else if (char === "}" && state.inside) {
    state.inside = false;
    if (state.current.length > 0) {
      state.params.push(state.current);
    }
  } else if (state.inside) {
    state.current += char;
  }
};

export const extractPathParamNames = (
  urlPath: string
): readonly string[] => {
  const state = { inside: false, current: "", params: [] as string[] };
  for (const char of urlPath) {
    processPathChar(char, state);
  }
  return state.params;
};

export const extractQueryParams = (
  operation: OpenApiOperation
): readonly string[] => {
  if (operation.parameters === undefined) {
    return [];
  }
  return operation.parameters
    .filter((p) => p.in === PARAM_IN_QUERY)
    .map((p) => p.name);
};

// --- Auth header resolution ---

const resolveBearerHeader = (): AuthHeader => ({
  headerName: "Authorization",
  headerValue: `${AUTH_BEARER_PREFIX}{{token}}`,
  varName: "token",
});

const resolveBasicHeader = (): AuthHeader => ({
  headerName: "Authorization",
  headerValue: `${AUTH_BASIC_PREFIX}{{basicAuth}}`,
  varName: "basicAuth",
});

const resolveApiKeyHeader = (
  name: string
): AuthHeader => ({
  headerName: name,
  headerValue: "{{apiKey}}",
  varName: "apiKey",
});

const isHttpBearer = (s: OpenApiSecurityScheme): boolean =>
  s.type === SECURITY_TYPE_HTTP && s.scheme === SECURITY_SCHEME_BEARER;

const isHttpBasic = (s: OpenApiSecurityScheme): boolean =>
  s.type === SECURITY_TYPE_HTTP && s.scheme === SECURITY_SCHEME_BASIC;

const isApiKeyHeader = (s: OpenApiSecurityScheme): boolean =>
  s.type === SECURITY_TYPE_API_KEY &&
  s.in === SECURITY_LOCATION_HEADER &&
  s.name !== undefined &&
  s.name !== "";

const resolveSchemeHeader = (
  scheme: OpenApiSecurityScheme
): AuthHeader | undefined => {
  if (isHttpBearer(scheme)) {
    return resolveBearerHeader();
  }
  if (isHttpBasic(scheme)) {
    return resolveBasicHeader();
  }
  if (isApiKeyHeader(scheme)) {
    return resolveApiKeyHeader(scheme.name ?? "");
  }
  return undefined;
};

const resolveHeadersFromReqs = (
  secReqs: ReadonlyArray<Readonly<Record<string, readonly string[]>>>,
  schemes: Readonly<Record<string, OpenApiSecurityScheme>>
): readonly AuthHeader[] => {
  const headers: AuthHeader[] = [];
  for (const req of secReqs) {
    for (const schemeName of Object.keys(req)) {
      const scheme = schemes[schemeName];
      if (scheme === undefined) {
        continue;
      }
      const header = resolveSchemeHeader(scheme);
      if (header !== undefined) {
        headers.push(header);
      }
    }
  }
  return headers;
};

export const resolveAuthHeaders = (
  spec: OpenApiSpec,
  operation: OpenApiOperation
): readonly AuthHeader[] => {
  const schemes =
    spec.components?.securitySchemes ?? spec.securityDefinitions;
  if (schemes === undefined) {
    return [];
  }
  const secReqs = operation.security ?? spec.security;
  if (secReqs === undefined) {
    return [];
  }
  return resolveHeadersFromReqs(secReqs, schemes);
};

// --- Base URL extraction ---

export const extractBaseUrl = (spec: OpenApiSpec): string => {
  const firstServer = spec.servers?.[0];
  if (firstServer !== undefined) {
    return firstServer.url;
  }
  if (spec.host !== undefined && spec.host !== "") {
    const firstScheme = spec.schemes?.[0];
    const scheme = firstScheme ?? HTTPS_SCHEME;
    return `${scheme}://${spec.host}${spec.basePath ?? ""}`;
  }
  return DEFAULT_BASE_URL;
};

// --- Validation ---

export const validateSpec = (
  raw: unknown
): Result<OpenApiSpec, string> => {
  if (typeof raw !== "object" || raw === null) {
    return err(OPENAPI_INVALID_SPEC);
  }
  if (!("paths" in raw)) {
    return err(OPENAPI_INVALID_SPEC);
  }
  return ok(raw as OpenApiSpec);
};

export const safeJsonParse = (
  text: string
): Result<unknown, string> => {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    return err(OPENAPI_PARSE_ERROR);
  }
};

// --- Shared utilities ---

export const methodHasBody = (method: string): boolean =>
  method === "post" || method === "put" || method === "patch";

export const padIndex = (index: number, total: number): string => {
  const digits =
    total >= PAD_LARGE_THRESHOLD ? PAD_DIGITS_LARGE : PAD_DIGITS_DEFAULT;
  return String(index + 1).padStart(digits, "0");
};
