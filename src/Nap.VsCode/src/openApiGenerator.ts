// OpenAPI -> .nap file generator
// Pure functions -- no VS Code SDK dependency

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
  OPENAPI_DEFAULT_TITLE,
  OPENAPI_HTTP_METHODS,
  OPENAPI_NO_ENDPOINTS,
} from "./constants";
import {
  type OpenApiOperation,
  type OpenApiResponse,
  type OpenApiSpec,
  type OpenApiPathItem,
  type EndpointDescriptor,
  type TagGroup,
  type AuthHeader,
  convertPathParams,
  pathToSlug,
  titleToSlug,
  extractRequestBody,
  findSuccessStatusCode,
  extractResponseSchema,
  extractPathParamNames,
  extractQueryParams,
  resolveAuthHeaders,
  extractBaseUrl,
  validateSpec,
  safeJsonParse,
  methodHasBody,
  padIndex,
} from "./openApiHelpers";

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
  if (ep.operation.description !== undefined && ep.operation.description !== "") {
    lines.push(`${NAP_KEY_DESCRIPTION} = ${ep.operation.description}`);
  }
  return [...lines, ""];
};

const buildVarsLines = (ep: EndpointDescriptor): readonly string[] => {
  const pathParams = extractPathParamNames(ep.urlPath);
  const authVars = ep.authHeaders.map((a: AuthHeader) => a.varName);
  const allVars = [...pathParams, ...ep.queryParams, ...authVars];
  if (allVars.length === 0) {
    return [];
  }
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
  if (queryParams.length === 0) {
    return "";
  }
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
  if (!hasBody && !hasAuth) {
    return [];
  }
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
  if (!methodHasBody(ep.method)) {
    return [];
  }
  const body = extractRequestBody(ep.operation);
  if (body === undefined) {
    return [];
  }
  return [SECTION_REQUEST_BODY, NAP_TRIPLE_QUOTE, body, NAP_TRIPLE_QUOTE, ""];
};

const buildResponseBodyAssertions = (
  responses: Readonly<Record<string, OpenApiResponse>> | undefined
): readonly string[] => {
  const schema = extractResponseSchema(responses);
  if (schema?.properties === undefined) {
    return [];
  }
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

const toEndpoint = (
  spec: OpenApiSpec,
  method: string,
  entry: { readonly urlPath: string; readonly operation: OpenApiOperation }
): EndpointDescriptor => ({
  method,
  urlPath: entry.urlPath,
  operation: entry.operation,
  queryParams: extractQueryParams(entry.operation),
  authHeaders: resolveAuthHeaders(spec, entry.operation),
});

const collectEndpoints = (
  spec: OpenApiSpec,
  paths: Readonly<Record<string, OpenApiPathItem>>
): readonly EndpointDescriptor[] => {
  const endpoints: EndpointDescriptor[] = [];
  for (const [urlPath, pathItem] of Object.entries(paths)) {
    for (const method of OPENAPI_HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation !== undefined) {
        endpoints.push(toEndpoint(spec, method, { urlPath, operation }));
      }
    }
  }
  return endpoints;
};

const buildPlaylistContent = (
  title: string,
  napFileNames: readonly string[]
): string => {
  const lines = [
    SECTION_META,
    `${NAP_KEY_NAME} = ${title}`,
    "",
    SECTION_STEPS,
  ];
  for (const fileName of napFileNames) {
    lines.push(`./${fileName}`);
  }
  lines.push("");
  return lines.join("\n");
};

const buildEnvironmentContent = (baseUrl: string): string =>
  `${BASE_URL_KEY} = ${baseUrl}\n`;

// --- Tag grouping ---

const groupByTag = (
  endpoints: readonly EndpointDescriptor[]
): readonly TagGroup[] => {
  const groups = new Map<string | undefined, EndpointDescriptor[]>();
  for (const ep of endpoints) {
    const tag = ep.operation.tags?.[0];
    const existing = groups.get(tag);
    if (existing !== undefined) {
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
    const fileName =
      group.tag !== undefined && group.tag !== ""
        ? `${titleToSlug(group.tag)}/${baseName}`
        : baseName;
    return { fileName, content: buildNapContent(ep) };
  });

// --- Build result from validated spec ---

const collectNapFiles = (
  endpoints: readonly EndpointDescriptor[]
): readonly GeneratedFile[] => {
  const tagGroups = groupByTag(endpoints);
  const globalIndex = { value: 0 };
  const napFiles: GeneratedFile[] = [];
  for (const group of tagGroups) {
    const files = generateFilesForGroup(group, globalIndex, endpoints.length);
    for (const file of files) {
      napFiles.push(file);
    }
  }
  return napFiles;
};

const buildGenerationResult = (
  spec: OpenApiSpec,
  endpoints: readonly EndpointDescriptor[]
): GenerationResult => {
  const baseUrl = extractBaseUrl(spec);
  const title = spec.info?.title ?? OPENAPI_DEFAULT_TITLE;
  const napFiles = collectNapFiles(endpoints);
  const fileNames = napFiles.map((f) => f.fileName);
  const playlist: GeneratedFile = {
    fileName: `${titleToSlug(title)}${NAPLIST_EXTENSION}`,
    content: buildPlaylistContent(title, fileNames),
  };
  const environment: GeneratedFile = {
    fileName: NAPENV_EXTENSION,
    content: buildEnvironmentContent(baseUrl),
  };
  return { napFiles, playlist, environment };
};

// --- Main export ---

const parseAndValidate = (
  jsonText: string
): Result<OpenApiSpec, string> => {
  const parseResult = safeJsonParse(jsonText);
  if (!parseResult.ok) {
    return parseResult;
  }
  return validateSpec(parseResult.value);
};

export const generateFromOpenApi = (
  jsonText: string
): Result<GenerationResult, string> => {
  const specResult = parseAndValidate(jsonText);
  if (!specResult.ok) {
    return specResult;
  }
  const spec = specResult.value;
  if (spec.paths === undefined) {
    return err(OPENAPI_NO_ENDPOINTS);
  }
  const endpoints = collectEndpoints(spec, spec.paths);
  if (endpoints.length === 0) {
    return err(OPENAPI_NO_ENDPOINTS);
  }
  return ok(buildGenerationResult(spec, endpoints));
};
