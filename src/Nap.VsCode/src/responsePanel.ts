// Response webview panel — shows HTTP response after running a .nap file
// Uses minimal vanilla HTML/CSS — no framework dependency

import * as vscode from "vscode";
import type { RunResult } from "./types";
import {
  HTTP_STATUS_CLIENT_ERROR_MIN,
  NO_REQUEST_HEADERS,
  RESPONSE_PANEL_TITLE,
  RESPONSE_PANEL_VIEW_TYPE,
  SECTION_LABEL_ASSERTIONS,
  SECTION_LABEL_BODY,
  SECTION_LABEL_ERROR,
  SECTION_LABEL_OUTPUT,
  SECTION_LABEL_REQUEST_HEADERS,
  SECTION_LABEL_RESPONSE_HEADERS,
} from "./constants";
import { escapeHtml, formatBodyHtml } from "./htmlUtils";

const buildCollapsibleSection = (title: string, content: string, open: boolean): string =>
  `<details class="section"${open ? " open" : ""}>
    <summary><h3>${title}</h3><span class="chevron">&#x25B6;</span></summary>
    <div class="section-content">${content}</div>
  </details>`,

 buildHeadersTable = (
  headers: Readonly<Record<string, string>> | undefined
): string => {
  if (!headers) {return "";}

  return Object.entries(headers)
    .map(
      ([k, v]) =>
        `<tr><td class="header-key">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`
    )
    .join("\n");
},

 buildAssertionsHtml = (result: RunResult): string => {
  if (result.assertions.length === 0) {return "";}

  const rows = result.assertions
    .map((a) => {
      const icon = a.passed ? "&#x2713;" : "&#x2717;",
       cls = a.passed ? "pass" : "fail",
       detail = a.passed
        ? ""
        : `<div class="assert-detail">expected: ${escapeHtml(a.expected)}<br/>actual: ${escapeHtml(a.actual)}</div>`;
      return `<div class="assert-row ${cls}">${icon} ${escapeHtml(a.target)}${detail}</div>`;
    })
    .join("\n");

  return buildCollapsibleSection(SECTION_LABEL_ASSERTIONS, rows, true);
},

 buildRequestHeadersHtml = (
  headers: Readonly<Record<string, string>> | undefined
): string => {
  const rows = buildHeadersTable(headers),
   content = rows === ""
    ? `<span class="empty-hint">${NO_REQUEST_HEADERS}</span>`
    : `<table>${rows}</table>`;
  return buildCollapsibleSection(SECTION_LABEL_REQUEST_HEADERS, content, false);
},

 buildHeadersHtml = (
  headers: Readonly<Record<string, string>> | undefined
): string => {
  const rows = buildHeadersTable(headers);
  if (rows === "") {return "";}
  return buildCollapsibleSection(SECTION_LABEL_RESPONSE_HEADERS, `<table>${rows}</table>`, false);
},

 buildLogHtml = (
  log: readonly string[] | undefined
): string => {
  if (!log || log.length === 0) {return "";}

  const lines = log
    .map((line) => escapeHtml(line))
    .join("\n");

  return buildCollapsibleSection(SECTION_LABEL_OUTPUT, `<pre class="log-output">${lines}</pre>`, true);
},

 buildStatusLine = (result: RunResult): string => {
  if (result.statusCode === undefined) {return "";}

  const statusClass =
    result.statusCode < HTTP_STATUS_CLIENT_ERROR_MIN
      ? "status-ok"
      : "status-error";

  return `<span class="${statusClass}">${result.statusCode}</span>`;
},

 buildBodyHtml = (body: string | undefined): string =>
  body !== undefined && body !== ""
    ? buildCollapsibleSection(SECTION_LABEL_BODY, `<pre class="body">${formatBodyHtml(body)}</pre>`, true)
    : "",

 buildErrorHtml = (error: string | undefined): string =>
  error !== undefined && error !== ""
    ? `<details class="section error" open>
    <summary><h3>${SECTION_LABEL_ERROR}</h3><span class="chevron">&#x25B6;</span></summary>
    <div class="section-content"><pre>${escapeHtml(error)}</pre></div>
  </details>`
    : "",

 RESPONSE_STYLES = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; margin: 0; }
  h2 { margin: 0 0 12px 0; font-size: 14px; }
  h3 { margin: 0; font-size: 13px; color: var(--vscode-descriptionForeground); display: inline; }
  .summary { display: flex; gap: 16px; align-items: baseline; margin-bottom: 16px; padding: 8px 12px; background: var(--vscode-editorWidget-background); border-radius: 4px; }
  .status-ok { color: var(--vscode-testing-iconPassed); font-weight: bold; font-size: 18px; }
  .status-error { color: var(--vscode-testing-iconFailed); font-weight: bold; font-size: 18px; }
  .duration { color: var(--vscode-descriptionForeground); }
  details.section { margin-bottom: 16px; }
  details.section > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; padding: 4px 0; user-select: none; }
  details.section > summary::-webkit-details-marker { display: none; }
  details.section > summary .chevron { font-size: 10px; color: var(--vscode-descriptionForeground); transition: transform 0.15s; }
  details.section[open] > summary .chevron { transform: rotate(90deg); }
  .section-content { padding-top: 6px; }
  .body { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; overflow-x: auto; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 8px; border-bottom: 1px solid var(--vscode-widget-border); font-size: 12px; }
  .header-key { font-weight: bold; white-space: nowrap; width: 1%; }
  .assert-row { padding: 4px 0; font-size: 12px; }
  .assert-row.pass { color: var(--vscode-testing-iconPassed); }
  .assert-row.fail { color: var(--vscode-testing-iconFailed); }
  .assert-detail { margin-left: 20px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .error pre { color: var(--vscode-testing-iconFailed); }
  .log-output { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; overflow-x: auto; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; word-break: break-word; color: var(--vscode-terminal-foreground, var(--vscode-foreground)); }
  .passed-badge { color: var(--vscode-testing-iconPassed); font-weight: bold; }
  .failed-badge { color: var(--vscode-testing-iconFailed); font-weight: bold; }
  .json-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); }
  .json-string { color: var(--vscode-debugTokenExpression-string, #ce9178); }
  .json-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
  .json-bool { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
  .json-null { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
  .empty-hint { color: var(--vscode-descriptionForeground); font-size: 12px; font-style: italic; }
  .request-url { font-size: 12px; color: var(--vscode-textLink-foreground); word-break: break-all; margin-bottom: 16px; }
  .request-method { font-weight: bold; color: var(--vscode-foreground); }
`,

 buildRequestUrlHtml = (result: RunResult): string =>
  result.requestUrl !== undefined && result.requestUrl !== ""
    ? `<div class="request-url"><span class="request-method">${escapeHtml(result.requestMethod ?? "")}</span> ${escapeHtml(result.requestUrl)}</div>`
    : "",

 buildResponseBody = (result: RunResult): string => {
  const durationLine =
    result.duration !== undefined ? `${result.duration.toFixed(0)}ms` : "";

  return `
  <h2>${escapeHtml(result.file)}</h2>
  <div class="summary">
    ${buildStatusLine(result)}
    <span class="duration">${durationLine}</span>
    <span class="${result.passed ? "passed-badge" : "failed-badge"}">${result.passed ? "PASSED" : "FAILED"}</span>
  </div>
  ${buildRequestUrlHtml(result)}
  ${buildErrorHtml(result.error)}
  ${buildLogHtml(result.log)}
  ${buildAssertionsHtml(result)}
  ${buildRequestHeadersHtml(result.requestHeaders)}
  ${buildHeadersHtml(result.headers)}
  ${buildBodyHtml(result.body)}`;
},

 buildHtml = (result: RunResult): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>${RESPONSE_STYLES}</style>
</head>
<body>${buildResponseBody(result)}</body>
</html>`;

export class ResponsePanel implements vscode.Disposable {
  private _panel: vscode.WebviewPanel | undefined;

  show(result: RunResult, viewColumn: vscode.ViewColumn): void {
    if (this._panel) {
      this._panel.webview.html = buildHtml(result);
      this._panel.reveal(viewColumn);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      RESPONSE_PANEL_VIEW_TYPE,
      RESPONSE_PANEL_TITLE,
      viewColumn,
      { enableScripts: false, retainContextWhenHidden: true }
    );

    this._panel.webview.html = buildHtml(result);

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });
  }

  dispose(): void {
    this._panel?.dispose();
  }
}
