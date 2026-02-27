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
  NAP_KEY_DESCRIPTION,
  NAP_KEY_GENERATED,
  NAP_VALUE_TRUE,
  BASE_URL_VAR,
  BASE_URL_KEY,
  VARS_PLACEHOLDER,
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
  PARAM_IN_QUERY,
  AUTH_BEARER_PREFIX,
  AUTH_BASIC_PREFIX,
  SECURITY_TYPE_HTTP,
  SECURITY_SCHEME_BEARER,
  SECURITY_SCHEME_BASIC,
  SECURITY_TYPE_API_KEY,
  SECURITY_LOCATION_HEADER,
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

interface OpenApiResponse {
  readonly description?: string;
  readonly content?: Readonly<Record<string, OpenApiMediaType>>;
  readonly schema?: OpenApiSchema;
}

interface OpenApiOperation {
  readonly summary?: string;
  readonly description?: string;
  readonly operationId?: string;
  readonly tags?: readonly string[];
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: OpenApiRequestBody;
  readonly responses?: Readonly<Record<string, OpenApiResponse>>;
  readonly security?: ReadonlyArray<Readonly<Record<string, readonly string[]>>>;
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

interface OpenApiSecurityScheme {
  readonly type: string;
  readonly scheme?: string;
  readonly in?: string;
  readonly name?: string;
}

interface OpenApiSpec {
  readonly openapi?: string;
  readonly swagger?: string;
  readonly info?: { readonly title?: string; readonly description?: string };
  readonly servers?: ReadonlyArray<{ readonly url: string }>;
  readonly host?: string;
  readonly basePath?: string;
  readonly schemes?: readonly string[];
  readonly paths?: Readonly<Record<string, OpenApiPathItem>>;
  readonly security?: ReadonlyArray<Readonly<Record<string, readonly string[]>>>;
  readonly components?: {
    readonly securitySchemes?: Readonly<Record<string, OpenApiSecurityScheme>>;
  };
  readonly securityDefinitions?: Readonly<Record<string, OpenApiSecurityScheme>>;
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

interface AuthHeader {
  readonly headerName: string;
  readonly headerValue: string;
  readonly varName: string;
}

interface EndpointDescriptor {
  readonly method: string;
  readonly urlPath: string;
  readonly operation: OpenApiOperation;
  readonly queryParams: readonly string[];
  readonly authHeaders: readonly AuthHeader[];
}

// --- Pure helpers ---

const extractBaseUrl = (spec: OpenApiSpec): string => {
  const firstServer = spec.servers?.[0];
  if (firstServer) {
    return firstServer.url;
  }
  if (spec.host) {
    const firstScheme = spec.schemes?.[0];
    const scheme = firstScheme ?? HTTPS_SCHEME;
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
  if (current.length > 0) {parts.push(current.toLowerCase());}
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
  if (schema.example !== undefined) {return schema.example;}
  if (schema.type === SCHEMA_TYPE_STRING) {return SCHEMA_EXAMPLE_STRING;}
  if (schema.type === SCHEMA_TYPE_NUMBER) {return 0;}
  if (schema.type === SCHEMA_TYPE_INTEGER) {return 0;}
  if (schema.type === SCHEMA_TYPE_BOOLEAN) {return true;}
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
  responses: Readonly<Record<string, OpenApiResponse>> | undefined
): number => {
  if (!responses) { return 200; }
  const codes = Object.keys(responses)
    .map(Number)
    .filter((n) => !isNaN(n) && n >= 200 && n < 300)
    .sort((a, b) => a - b);
  const firstCode = codes[0];
  return firstCode ?? 200;
};

const extractResponseSchema = (
  responses: Readonly<Record<string, OpenApiResponse>> | undefined
): OpenApiSchema | undefined => {
  if (!responses) { return undefined; }
  const successCode = String(findSuccessStatusCode(responses));
  const response = responses[successCode];
  if (!response) { return undefined; }
  // OAS3: response.content["application/json"].schema
  const jsonMedia = response.content?.[CONTENT_TYPE_JSON];
  if (jsonMedia?.schema) { return jsonMedia.schema; }
  // Swagger 2: response.schema
  if (response.schema) { return response.schema; }
  return undefined;
};

const extractPathParamNames = (urlPath: string): readonly string[] => {
  const params: string[] = [];
  let inside = false;
  let current = "";
  for (const char of urlPath) {
    if (char === "{") {
      inside = true;
      current = "";
    } else if (char === "}" && inside) {
      inside = false;
      if (current.length > 0) { params.push(current); }
    } else if (inside) {
      current += char;
    }
  }
  return params;
};

const extractQueryParams = (
  operation: OpenApiOperation
): readonly string[] => {
  if (!operation.parameters) { return []; }
  const params: string[] = [];
  for (const p of operation.parameters) {
    if (p.in === PARAM_IN_QUERY) {
      params.push(p.name);
    }
  }
  return params;
};

const resolveAuthHeaders = (
  spec: OpenApiSpec,
  operation: OpenApiOperation
): readonly AuthHeader[] => {
  const schemes =
    spec.components?.securitySchemes ?? spec.securityDefinitions;
  if (!schemes) { return []; }
  const secReqs = operation.security ?? spec.security;
  if (!secReqs) { return []; }
  const headers: AuthHeader[] = [];
  for (const req of secReqs) {
    for (const schemeName of Object.keys(req)) {
      const scheme = schemes[schemeName];
      if (!scheme) { continue; }
      if (scheme.type === SECURITY_TYPE_HTTP && scheme.scheme === SECURITY_SCHEME_BEARER) {
        headers.push({
          headerName: "Authorization",
          headerValue: `${AUTH_BEARER_PREFIX}{{token}}`,
          varName: "token",
        });
      } else if (scheme.type === SECURITY_TYPE_HTTP && scheme.scheme === SECURITY_SCHEME_BASIC) {
        headers.push({
          headerName: "Authorization",
          headerValue: `${AUTH_BASIC_PREFIX}{{basicAuth}}`,
          varName: "basicAuth",
        });
      } else if (scheme.type === SECURITY_TYPE_API_KEY && scheme.in === SECURITY_LOCATION_HEADER && scheme.name) {
        headers.push({
          headerName: scheme.name,
          headerValue: `{{apiKey}}`,
          varName: "apiKey",
        });
      }
    }
  }
  return headers;
};

const methodHasBody = (method: string): boolean =>
  method === "post" || method === "put" || method === "patch";

// --- .nap content builders (each section) ---

const buildMetaLines = (ep: EndpointDescriptor): readonly string[] => {
  const name =
    ep.operation.summary ??
    ep.operation.operationId ??
    pathToSlug(ep.method, ep.urlPath);
  const lines = [
    SECTION_META,
    `${NAP_KEY_NAME} = ${name}`,
    `${NAP_KEY_GENERATED} = ${NAP_VALUE_TRUE}`,
  ];
  if (ep.operation.description) {
    lines.push(`${NAP_KEY_DESCRIPTION} = ${ep.operation.description}`);
  }
  return [...lines, ""];
};

const buildVarsLines = (ep: EndpointDescriptor): readonly string[] => {
  const pathParams = extractPathParamNames(ep.urlPath);
  const authVars = ep.authHeaders.map((a) => a.varName);
  const allVars = [...pathParams, ...ep.queryParams, ...authVars];
  if (allVars.length === 0) { return []; }
  const lines: string[] = [SECTION_VARS];
  const seen = new Set<string>();
  for (const v of allVars) {
    if (!seen.has(v)) {
      seen.add(v);
      lines.push(`${v} = "${VARS_PLACEHOLDER}"`);
    }
  }
  lines.push("");
  return lines;
};

const buildQueryString = (queryParams: readonly string[]): string => {
  if (queryParams.length === 0) { return ""; }
  const pairs = queryParams.map((p) => `${p}={{${p}}}`);
  return `?${pairs.join("&")}`;
};

const buildRequestLines = (ep: EndpointDescriptor): readonly string[] => [
  SECTION_REQUEST,
  `${ep.method.toUpperCase()} ${BASE_URL_VAR}${convertPathParams(ep.urlPath)}${buildQueryString(ep.queryParams)}`,
  "",
];

const buildHeaderLines = (ep: EndpointDescriptor): readonly string[] => {
  const lines: string[] = [];
  const hasBody = methodHasBody(ep.method);
  const hasAuth = ep.authHeaders.length > 0;
  if (!hasBody && !hasAuth) { return []; }
  lines.push(SECTION_REQUEST_HEADERS);
  if (hasBody) {
    lines.push(`${HEADER_CONTENT_TYPE} = ${CONTENT_TYPE_JSON}`);
    lines.push(`${HEADER_ACCEPT} = ${CONTENT_TYPE_JSON}`);
  }
  for (const auth of ep.authHeaders) {
    lines.push(`${auth.headerName} = ${auth.headerValue}`);
  }
  lines.push("");
  return lines;
};

const buildBodyLines = (ep: EndpointDescriptor): readonly string[] => {
  if (!methodHasBody(ep.method)) {return [];}
  const body = extractRequestBody(ep.operation);
  if (!body) {return [];}
  return [SECTION_REQUEST_BODY, NAP_TRIPLE_QUOTE, body, NAP_TRIPLE_QUOTE, ""];
};

const buildResponseBodyAssertions = (
  responses: Readonly<Record<string, OpenApiResponse>> | undefined
): readonly string[] => {
  const schema = extractResponseSchema(responses);
  if (!schema?.properties) { return []; }
  const lines: string[] = [];
  for (const key of Object.keys(schema.properties)) {
    lines.push(`${ASSERT_BODY_PREFIX}${key}${ASSERT_BODY_EXISTS_SUFFIX}`);
  }
  return lines;
};

const buildAssertLines = (op: OpenApiOperation): readonly string[] => [
  SECTION_ASSERT,
  `${ASSERT_STATUS_PREFIX}${findSuccessStatusCode(op.responses)}`,
  ...buildResponseBodyAssertions(op.responses),
  "",
];

const buildNapContent = (ep: EndpointDescriptor): string =>
  [
    ...buildMetaLines(ep),
    ...buildVarsLines(ep),
    ...buildRequestLines(ep),
    ...buildHeaderLines(ep),
    ...buildBodyLines(ep),
    ...buildAssertLines(ep.operation),
  ].join("\n");

// --- Collectors ---

const collectEndpoints = (
  spec: OpenApiSpec,
  paths: Readonly<Record<string, OpenApiPathItem>>
): readonly EndpointDescriptor[] => {
  const endpoints: EndpointDescriptor[] = [];
  for (const [urlPath, pathItem] of Object.entries(paths)) {
    for (const method of OPENAPI_HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation) {
        endpoints.push({
          method,
          urlPath,
          operation,
          queryParams: extractQueryParams(operation),
          authHeaders: resolveAuthHeaders(spec, operation),
        });
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

// --- Tag grouping ---

interface TagGroup {
  readonly tag: string | undefined;
  readonly endpoints: readonly EndpointDescriptor[];
}

const groupByTag = (
  endpoints: readonly EndpointDescriptor[]
): readonly TagGroup[] => {
  const groups = new Map<string | undefined, EndpointDescriptor[]>();
  for (const ep of endpoints) {
    const tag = ep.operation.tags?.[0];
    const existing = groups.get(tag);
    if (existing) {
      existing.push(ep);
    } else {
      groups.set(tag, [ep]);
    }
  }
  const result: TagGroup[] = [];
  for (const [tag, eps] of groups) {
    result.push({ tag, endpoints: eps });
  }
  return result;
};

const generateFilesForGroup = (
  group: TagGroup,
  globalIndex: { value: number },
  totalEndpoints: number
): readonly GeneratedFile[] =>
  group.endpoints.map((ep) => {
    const slug = ep.operation.operationId ?? pathToSlug(ep.method, ep.urlPath);
    const prefix = padIndex(globalIndex.value, totalEndpoints);
    globalIndex.value += 1;
    const baseName = `${prefix}_${slug}${NAP_EXTENSION}`;
    const fileName = group.tag
      ? `${titleToSlug(group.tag)}/${baseName}`
      : baseName;
    return { fileName, content: buildNapContent(ep) };
  });

// --- Main export ---

export const generateFromOpenApi = (
  jsonText: string
): Result<GenerationResult, string> => {
  const parseResult = safeJsonParse(jsonText);
  if (!parseResult.ok) { return parseResult; }

  const specResult = validateSpec(parseResult.value);
  if (!specResult.ok) { return specResult; }

  const spec = specResult.value;
  if (!spec.paths) { return err(OPENAPI_NO_ENDPOINTS); }

  const endpoints = collectEndpoints(spec, spec.paths);
  if (endpoints.length === 0) { return err(OPENAPI_NO_ENDPOINTS); }

  const baseUrl = extractBaseUrl(spec);
  const title = spec.info?.title ?? OPENAPI_DEFAULT_TITLE;

  const tagGroups = groupByTag(endpoints);
  const globalIndex = { value: 0 };
  const napFiles: GeneratedFile[] = [];
  for (const group of tagGroups) {
    const files = generateFilesForGroup(group, globalIndex, endpoints.length);
    for (const file of files) {
      napFiles.push(file);
    }
  }

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
