// Specs: vscode-layout
// Shared HTML utility functions for webview panels
// Used by both responsePanel and playlistPanel

import type { AssertionResult, RunResult } from './types';
import {
  JSON_INDENT_SIZE,
  NO_REQUEST_HEADERS,
  SECTION_LABEL_ASSERTIONS,
  SECTION_LABEL_BODY,
  SECTION_LABEL_ERROR,
  SECTION_LABEL_OUTPUT,
  SECTION_LABEL_REQUEST,
  SECTION_LABEL_REQUEST_BODY,
  SECTION_LABEL_REQUEST_HEADERS,
  SECTION_LABEL_RESPONSE,
  SECTION_LABEL_RESPONSE_HEADERS,
} from './constants';

export const escapeHtml = (text: string): string =>
  text
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;');

const jsonSpan = (cls: string, content: string): string =>
    `<span class="json-${cls}">${escapeHtml(content)}</span>`,
  highlightJsonPrimitive = (value: unknown): string | undefined => {
    if (value === null) {
      return jsonSpan('null', 'null');
    }
    if (typeof value === 'boolean') {
      return jsonSpan('bool', String(value));
    }
    if (typeof value === 'number') {
      return jsonSpan('number', String(value));
    }
    if (typeof value === 'string') {
      return jsonSpan('string', `"${escapeHtml(value)}"`);
    }
    return undefined;
  },
  highlightJsonArray = (items: readonly unknown[], indent: number): string => {
    if (items.length === 0) {
      return '[]';
    }
    const pad = ' '.repeat(indent),
      innerPad = ' '.repeat(indent + JSON_INDENT_SIZE),
      rendered = items
        .map((item) => `${innerPad}${highlightJson(item, indent + JSON_INDENT_SIZE)}`)
        .join(',\n');
    return `[\n${rendered}\n${pad}]`;
  },
  highlightJsonObject = (value: Record<string, unknown>, indent: number): string => {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '{}';
    }
    const pad = ' '.repeat(indent),
      innerPad = ' '.repeat(indent + JSON_INDENT_SIZE),
      props = entries
        .map(
          ([k, v]) =>
            `${innerPad}${jsonSpan('key', `"${escapeHtml(k)}"`)}: ${highlightJson(v, indent + JSON_INDENT_SIZE)}`,
        )
        .join(',\n');
    return `{\n${props}\n${pad}}`;
  };

export function highlightJson(value: unknown, indent: number): string {
  const primitive = highlightJsonPrimitive(value);
  if (primitive !== undefined) {
    return primitive;
  }
  if (Array.isArray(value)) {
    return highlightJsonArray(value, indent);
  }
  if (typeof value === 'object' && value !== null) {
    return highlightJsonObject(value as Record<string, unknown>, indent);
  }
  return escapeHtml(typeof value === 'undefined' ? 'undefined' : JSON.stringify(value));
}

export const formatBodyHtml = (body: string): string => {
  try {
    const parsed: unknown = JSON.parse(body);
    return highlightJson(parsed, 0);
  } catch {
    return escapeHtml(body);
  }
};

// ---------------------------------------------------------------------------
// Shared result section builders — used by responsePanel and playlistPanel
// ---------------------------------------------------------------------------

export const buildCollapsibleSection = ({
  title,
  content,
  open,
}: {
  readonly title: string;
  readonly content: string;
  readonly open: boolean;
}): string =>
  `<details class="section"${open ? ' open' : ''}>
    <summary><h3>${title}</h3><span class="chevron">&#x25B6;</span></summary>
    <div class="section-content">${content}</div>
  </details>`;

export const buildHeadersTableRows = (
  headers: Readonly<Record<string, string>> | undefined,
): string => {
  if (!headers) {
    return '';
  }
  return Object.entries(headers)
    .map(
      ([k, v]) => `<tr><td class="header-key">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`,
    )
    .join('\n');
};

const buildAssertionRowsHtml = (assertions: readonly AssertionResult[]): string => {
  if (assertions.length === 0) {
    return '';
  }
  return assertions
    .map((a) => {
      const icon = a.passed ? '&#x2713;' : '&#x2717;',
        cls = a.passed ? 'pass' : 'fail',
        detail = a.passed
          ? ''
          : `<div class="assert-detail">expected: ${escapeHtml(a.expected)} | actual: ${escapeHtml(a.actual)}</div>`;
      return `<div class="assert-row ${cls}">${icon} ${escapeHtml(a.target)}${detail}</div>`;
    })
    .join('\n');
};

const buildRequestUrlHtml = (result: RunResult): string =>
  result.requestUrl !== undefined && result.requestUrl !== ''
    ? `<div class="request-url"><span class="request-method">${escapeHtml(result.requestMethod ?? '')}</span> ${escapeHtml(result.requestUrl)}</div>`
    : '';

export const buildErrorHtml = (error: string | undefined): string =>
  error !== undefined && error !== ''
    ? buildCollapsibleSection({
        title: SECTION_LABEL_ERROR,
        content: `<pre class="error-text">${escapeHtml(error)}</pre>`,
        open: true,
      })
    : '';

export const buildLogHtml = (log: readonly string[] | undefined): string => {
  if (!log || log.length === 0) {
    return '';
  }
  const lines = log.map((line) => escapeHtml(line)).join('\n');
  return buildCollapsibleSection({
    title: SECTION_LABEL_OUTPUT,
    content: `<pre class="log-output">${lines}</pre>`,
    open: true,
  });
};

const buildRequestBodyHtml = (result: RunResult): string => {
  if (result.requestBody === undefined || result.requestBody === '') {
    return '';
  }
  const formatted = formatBodyHtml(result.requestBody),
    contentTypeHint =
      result.requestBodyContentType !== undefined && result.requestBodyContentType !== ''
        ? `<div class="content-type-hint">${escapeHtml(result.requestBodyContentType)}</div>`
        : '';
  return `<div class="subsection"><h4 class="subsection-title">${SECTION_LABEL_REQUEST_BODY}</h4>${contentTypeHint}<pre class="body">${formatted}</pre></div>`;
};

export const buildRequestGroupHtml = (result: RunResult): string => {
  const urlHtml = buildRequestUrlHtml(result),
    headersRows = buildHeadersTableRows(result.requestHeaders),
    headersHtml =
      headersRows !== ''
        ? `<div class="subsection"><h4 class="subsection-title">${SECTION_LABEL_REQUEST_HEADERS}</h4><table>${headersRows}</table></div>`
        : `<span class="empty-hint">${NO_REQUEST_HEADERS}</span>`,
    bodyHtml = buildRequestBodyHtml(result);

  return buildCollapsibleSection({
    title: SECTION_LABEL_REQUEST,
    content: `${urlHtml}${headersHtml}${bodyHtml}`,
    open: false,
  });
};

const buildResponseSubsection = (title: string, content: string): string =>
  `<div class="subsection"><h4 class="subsection-title">${title}</h4>${content}</div>`;

const buildResponseParts = (result: RunResult): readonly string[] => {
  const parts: string[] = [],
    assertionsHtml = buildAssertionRowsHtml(result.assertions);

  if (assertionsHtml !== '') {
    parts.push(buildResponseSubsection(SECTION_LABEL_ASSERTIONS, assertionsHtml));
  }

  const headersRows = buildHeadersTableRows(result.headers);
  if (headersRows !== '') {
    parts.push(
      buildResponseSubsection(SECTION_LABEL_RESPONSE_HEADERS, `<table>${headersRows}</table>`),
    );
  }

  if (result.body !== undefined && result.body !== '') {
    parts.push(
      buildResponseSubsection(
        SECTION_LABEL_BODY,
        `<pre class="body">${formatBodyHtml(result.body)}</pre>`,
      ),
    );
  }

  return parts;
};

export const buildResponseGroupHtml = (result: RunResult): string => {
  const parts = buildResponseParts(result);
  if (parts.length === 0) {
    return '';
  }
  return buildCollapsibleSection({
    title: SECTION_LABEL_RESPONSE,
    content: parts.join('\n'),
    open: true,
  });
};

export const buildResultDetailHtml = (result: RunResult): string =>
  `${buildErrorHtml(result.error)}
  ${buildLogHtml(result.log)}
  ${buildRequestGroupHtml(result)}
  ${buildResponseGroupHtml(result)}`;

export const SHARED_SECTION_STYLES = `
  details.section { margin-bottom: 16px; }
  details.section > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; padding: 4px 0; user-select: none; }
  details.section > summary::-webkit-details-marker { display: none; }
  details.section > summary .chevron { font-size: 10px; color: var(--vscode-descriptionForeground); transition: transform 0.15s; }
  details.section[open] > summary .chevron { transform: rotate(90deg); }
  .section-content { padding-top: 6px; }
  .subsection { margin-top: 8px; }
  .subsection-title { margin: 8px 0 4px 0; font-size: 12px; color: var(--vscode-descriptionForeground); }
  .body { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; overflow-x: auto; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 8px; border-bottom: 1px solid var(--vscode-widget-border); font-size: 12px; }
  .header-key { font-weight: bold; white-space: nowrap; width: 1%; }
  .assert-row { padding: 4px 0; font-size: 12px; }
  .assert-row.pass { color: var(--vscode-testing-iconPassed); }
  .assert-row.fail { color: var(--vscode-testing-iconFailed); }
  .assert-detail { margin-left: 20px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .error-text { color: var(--vscode-testing-iconFailed); }
  .log-output { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; overflow-x: auto; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; word-break: break-word; color: var(--vscode-terminal-foreground, var(--vscode-foreground)); }
  .request-url { font-size: 12px; color: var(--vscode-textLink-foreground); word-break: break-all; margin-bottom: 8px; }
  .request-method { font-weight: bold; color: var(--vscode-foreground); }
  .empty-hint { color: var(--vscode-descriptionForeground); font-size: 12px; font-style: italic; }
  .content-type-hint { color: var(--vscode-descriptionForeground); font-size: 11px; font-style: italic; margin-bottom: 4px; }
  .json-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); }
  .json-string { color: var(--vscode-debugTokenExpression-string, #ce9178); }
  .json-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
  .json-bool { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
  .json-null { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }`;
