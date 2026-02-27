// Playlist results webview panel — shows all step results from a .naplist run
// Opens IMMEDIATELY with pending rows, updates progressively via postMessage

import * as vscode from "vscode";
import * as path from "path";
import type { RunResult } from "./types";
import {
  PLAYLIST_PANEL_TITLE,
  PLAYLIST_PANEL_VIEW_TYPE,
  MSG_ADD_RESULT,
  MSG_RUN_COMPLETE,
  MSG_RUN_ERROR,
  MSG_SAVE_REPORT,
} from "./constants";
import { escapeHtml, formatBodyHtml } from "./htmlUtils";

const buildStepAssertionsHtml = (result: RunResult): string => {
  if (result.assertions.length === 0) {return "";}

  const rows = result.assertions
    .map((a) => {
      const icon = a.passed ? "&#x2713;" : "&#x2717;";
      const cls = a.passed ? "pass" : "fail";
      const detail = a.passed
        ? ""
        : `<span class="assert-detail">expected: ${escapeHtml(a.expected)} | actual: ${escapeHtml(a.actual)}</span>`;
      return `<div class="assert-row ${cls}">${icon} ${escapeHtml(a.target)}${detail}</div>`;
    })
    .join("\n");

  return `<div class="step-assertions">${rows}</div>`;
};

const buildStepHeadersHtml = (
  headers: Readonly<Record<string, string>> | undefined
): string => {
  if (!headers) {return "";}

  const rows = Object.entries(headers)
    .map(
      ([k, v]) =>
        `<tr><td class="header-key">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`
    )
    .join("\n");

  return `<div class="step-headers"><h4>Response Headers</h4><table>${rows}</table></div>`;
};

const buildStepLogHtml = (
  log: readonly string[] | undefined
): string => {
  if (!log || log.length === 0) {return "";}

  const lines = log
    .map((line) => escapeHtml(line))
    .join("\n");

  return `<div class="step-log"><h4>Output</h4><pre class="log-output">${lines}</pre></div>`;
};

const buildStepMetadata = (result: RunResult): {
  readonly icon: string;
  readonly statusCls: string;
  readonly fileName: string;
  readonly statusCode: number | string;
  readonly duration: string;
  readonly assertionSummary: string;
} => {
  const assertionCount = result.assertions.length;
  const passedCount = result.assertions.filter((a) => a.passed).length;
  return {
    icon: result.passed ? "&#x2713;" : "&#x2717;",
    statusCls: result.passed ? "pass" : "fail",
    fileName: path.basename(result.file),
    statusCode: result.statusCode ?? "",
    duration: result.duration !== undefined ? `${result.duration.toFixed(0)}ms` : "",
    assertionSummary: assertionCount > 0 ? `${passedCount}/${assertionCount}` : "",
  };
};

const buildStepErrorHtml = (error: string | undefined): string =>
  error !== undefined && error !== ""
    ? `<div class="step-error"><pre>${escapeHtml(error)}</pre></div>`
    : "";

const buildStepBodyHtml = (body: string | undefined): string =>
  body !== undefined && body !== ""
    ? `<div class="step-body"><h4>Body</h4><pre class="body">${formatBodyHtml(body)}</pre></div>`
    : "";

const buildStepDetailSection = (result: RunResult): string =>
  `${buildStepErrorHtml(result.error)}
        ${buildStepLogHtml(result.log)}
        ${buildStepAssertionsHtml(result)}
        ${buildStepHeadersHtml(result.headers)}
        ${buildStepBodyHtml(result.body)}`;

const buildCompletedStepRow = (result: RunResult, index: number): string => {
  const meta = buildStepMetadata(result);

  return `
    <div class="step" data-index="${index}">
      <div class="step-summary ${meta.statusCls}" onclick="toggleStep(${index})">
        <span class="step-icon">${meta.icon}</span>
        <span class="step-name">${escapeHtml(meta.fileName)}</span>
        <span class="step-status-code">${meta.statusCode}</span>
        <span class="step-assertions-badge">${meta.assertionSummary}</span>
        <span class="step-duration">${meta.duration}</span>
        <span class="step-chevron" id="chevron-${index}">&#x25B6;</span>
      </div>
      <div class="step-detail" id="detail-${index}" style="display:none;">
        ${buildStepDetailSection(result)}
      </div>
    </div>`;
};

const buildPendingStepRow = (stepFileName: string, index: number): string => `
    <div class="step" data-index="${index}" id="step-${index}">
      <div class="step-summary pending">
        <span class="step-icon spinner">&#x25CB;</span>
        <span class="step-name">${escapeHtml(stepFileName)}</span>
        <span class="step-status-code"></span>
        <span class="step-assertions-badge"></span>
        <span class="step-duration"></span>
        <span class="step-chevron" id="chevron-${index}">&#x25B6;</span>
      </div>
      <div class="step-detail" id="detail-${index}" style="display:none;"></div>
    </div>`;

const STYLES = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; margin: 0; }
  h2 { margin: 0 0 12px 0; font-size: 16px; }
  h3 { margin: 12px 0 6px 0; font-size: 13px; color: var(--vscode-descriptionForeground); }
  h4 { margin: 8px 0 4px 0; font-size: 12px; color: var(--vscode-descriptionForeground); }
  .playlist-summary { display: flex; gap: 16px; align-items: baseline; margin-bottom: 16px; padding: 10px 14px; background: var(--vscode-editorWidget-background); border-radius: 4px; }
  .summary-passed { color: var(--vscode-testing-iconPassed); font-weight: bold; font-size: 16px; }
  .summary-failed { color: var(--vscode-testing-iconFailed); font-weight: bold; font-size: 16px; }
  .summary-total { color: var(--vscode-descriptionForeground); font-size: 13px; }
  .summary-duration { color: var(--vscode-descriptionForeground); font-size: 13px; }
  .summary-badge { font-weight: bold; font-size: 14px; }
  .summary-badge.all-passed { color: var(--vscode-testing-iconPassed); }
  .summary-badge.has-failures { color: var(--vscode-testing-iconFailed); }
  .summary-badge.running { color: var(--vscode-descriptionForeground); }
  .step { border-bottom: 1px solid var(--vscode-widget-border); }
  .step-summary { display: flex; align-items: center; gap: 12px; padding: 8px 6px; cursor: pointer; }
  .step-summary:hover { background: var(--vscode-list-hoverBackground); }
  .step-icon { font-size: 14px; width: 18px; text-align: center; }
  .step-summary.pass .step-icon { color: var(--vscode-testing-iconPassed); }
  .step-summary.fail .step-icon { color: var(--vscode-testing-iconFailed); }
  .step-summary.pending .step-icon { color: var(--vscode-descriptionForeground); }
  .step-summary.running .step-icon { color: var(--vscode-progressBar-background); animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .step-name { flex: 1; font-weight: 500; }
  .step-status-code { color: var(--vscode-descriptionForeground); font-size: 12px; min-width: 30px; }
  .step-assertions-badge { color: var(--vscode-descriptionForeground); font-size: 11px; min-width: 30px; }
  .step-duration { color: var(--vscode-descriptionForeground); font-size: 12px; min-width: 50px; text-align: right; }
  .step-chevron { color: var(--vscode-descriptionForeground); font-size: 10px; transition: transform 0.15s; }
  .step-chevron.open { transform: rotate(90deg); }
  .step-detail { padding: 8px 12px 12px 30px; background: var(--vscode-editorWidget-background); }
  .step-error pre { color: var(--vscode-testing-iconFailed); margin: 4px 0; font-size: 12px; }
  .assert-row { padding: 2px 0; font-size: 12px; }
  .assert-row.pass { color: var(--vscode-testing-iconPassed); }
  .assert-row.fail { color: var(--vscode-testing-iconFailed); }
  .assert-detail { margin-left: 8px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .step-assertions { margin-bottom: 8px; }
  .step-headers table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .step-headers td { padding: 3px 6px; border-bottom: 1px solid var(--vscode-widget-border); font-size: 11px; }
  .step-headers .header-key { font-weight: bold; white-space: nowrap; width: 1%; }
  .step-log { margin-bottom: 8px; }
  .log-output { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow-x: auto; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; word-break: break-word; color: var(--vscode-terminal-foreground, var(--vscode-foreground)); }
  .step-body { margin-top: 8px; }
  .body { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow-x: auto; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; word-break: break-word; }
  .json-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); }
  .json-string { color: var(--vscode-debugTokenExpression-string, #ce9178); }
  .json-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
  .json-bool { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
  .json-null { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
  .report-btn { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; margin-left: auto; font-size: 12px; font-weight: 500; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; border-radius: 4px; cursor: pointer; white-space: nowrap; }
  .report-btn:hover { background: var(--vscode-button-hoverBackground); }
  .report-btn svg { width: 14px; height: 14px; fill: currentColor; }
`;

const TOGGLE_STEP_FN = `
    function toggleStep(index) {
      const detail = document.getElementById('detail-' + index);
      const chevron = document.getElementById('chevron-' + index);
      if (!detail || !chevron) return;
      const isHidden = detail.style.display === 'none';
      detail.style.display = isHidden ? 'block' : 'none';
      if (isHidden) { chevron.classList.add('open'); }
      else { chevron.classList.remove('open'); }
    }`;

const buildMessageHandler = (): string => `
    window.addEventListener('message', function(event) {
      const msg = event.data;
      if (msg.type === '${MSG_ADD_RESULT}') {
        updateStepRow(msg.index, msg.html);
      } else if (msg.type === '${MSG_RUN_COMPLETE}') {
        updateSummary(msg.summaryHtml);
      } else if (msg.type === '${MSG_RUN_ERROR}') {
        updateSummary(msg.summaryHtml);
      }
    });`;

const HELPER_FNS = `
    function updateStepRow(index, html) {
      const stepEl = document.getElementById('step-' + index);
      if (stepEl) { stepEl.outerHTML = html; }
    }
    function updateSummary(html) {
      const summaryEl = document.getElementById('summary');
      if (summaryEl) { summaryEl.outerHTML = html; }
    }
    function saveReport() {
      vscodeApi.postMessage({ type: '${MSG_SAVE_REPORT}' });
    }`;

const buildStreamingScript = (): string => `
  <script>
    const vscodeApi = acquireVsCodeApi();
    ${TOGGLE_STEP_FN}
    ${buildMessageHandler()}
    ${HELPER_FNS}
  </script>`;

const buildStreamingBody = (
  playlistName: string,
  stepsHtml: string,
  stepCount: number
): string => `
  <h2>${escapeHtml(playlistName)}</h2>
  <div class="playlist-summary" id="summary">
    <span class="summary-badge running">RUNNING</span>
    <span class="summary-total">${stepCount} steps</span>
    <span class="summary-duration" id="summary-duration"></span>
  </div>
  <div class="steps-list" id="steps-list">
    ${stepsHtml}
  </div>`;

const wrapInHtmlShell = (bodyContent: string, scriptContent: string): string =>
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>${STYLES}</style>
</head>
<body>
  ${bodyContent}
  ${scriptContent}
</body>
</html>`;

const buildStreamingHtml = (
  playlistFile: string,
  stepFileNames: readonly string[]
): string => {
  const playlistName = path.basename(playlistFile, path.extname(playlistFile));
  const stepsHtml = stepFileNames.map((name, i) => buildPendingStepRow(name, i)).join("\n");
  const body = buildStreamingBody(playlistName, stepsHtml, stepFileNames.length);
  return wrapInHtmlShell(body, buildStreamingScript());
};

const buildSummaryHtml = (results: readonly RunResult[]): string => {
  const totalCount = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = totalCount - passedCount;
  const totalDuration = results.reduce(
    (acc, r) => acc + (r.duration ?? 0),
    0
  );
  const allPassed = totalCount > 0 && failedCount === 0;

  return `<div class="playlist-summary" id="summary">
    <span class="summary-badge ${allPassed ? "all-passed" : "has-failures"}">${allPassed ? "PASSED" : "FAILED"}</span>
    <span class="summary-passed">${passedCount} passed</span>
    ${failedCount > 0 ? `<span class="summary-failed">${failedCount} failed</span>` : ""}
    <span class="summary-total">${totalCount} steps</span>
    <span class="summary-duration">${totalDuration.toFixed(0)}ms</span>
    <button class="report-btn" onclick="saveReport()"><svg viewBox="0 0 16 16"><path d="M4 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm1 2v2h6V3H5zm0 4v1h6V7H5zm0 3v1h4v-1H5z"/></svg>Save Report</button>
  </div>`;
};

const buildErrorSummaryHtml = (error: string): string =>
  `<div class="playlist-summary" id="summary">
    <span class="summary-badge has-failures">ERROR</span>
    <span class="summary-failed">${escapeHtml(error)}</span>
  </div>`;

interface CreatePanelOptions {
  readonly viewColumn: vscode.ViewColumn;
  readonly html: string;
  readonly onMessage: (msg: { type: string }) => void;
  readonly onDispose: () => void;
}

const createNewPanel = (opts: CreatePanelOptions): vscode.WebviewPanel => {
  const panel = vscode.window.createWebviewPanel(
    PLAYLIST_PANEL_VIEW_TYPE,
    PLAYLIST_PANEL_TITLE,
    opts.viewColumn,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.webview.html = opts.html;
  panel.webview.onDidReceiveMessage(opts.onMessage);
  panel.onDidDispose(opts.onDispose);
  return panel;
};

export class PlaylistPanel implements vscode.Disposable {
  private _panel: vscode.WebviewPanel | undefined;
  private _onSaveReport: (() => void) | undefined;

  set onSaveReport(handler: () => void) {
    this._onSaveReport = handler;
  }

  private readonly _handleWebviewMessage = (msg: { type: string }): void => {
    if (msg.type === MSG_SAVE_REPORT && this._onSaveReport) {
      this._onSaveReport();
    }
  };

  showRunning(
    playlistFile: string,
    stepFileNames: readonly string[],
    viewColumn: vscode.ViewColumn
  ): void {
    const html = buildStreamingHtml(playlistFile, stepFileNames);

    if (this._panel) {
      this._panel.webview.html = html;
      this._panel.reveal(viewColumn);
      return;
    }

    this._panel = createNewPanel({
      viewColumn,
      html,
      onMessage: this._handleWebviewMessage,
      onDispose: () => { this._panel = undefined; },
    });
  }

  addResult(index: number, result: RunResult): void {
    if (!this._panel) {return;}
    const html = buildCompletedStepRow(result, index);
    this._panel.webview.postMessage({
      type: MSG_ADD_RESULT,
      index,
      html,
    });
  }

  showComplete(results: readonly RunResult[]): void {
    if (!this._panel) {return;}
    const summaryHtml = buildSummaryHtml(results);
    this._panel.webview.postMessage({
      type: MSG_RUN_COMPLETE,
      summaryHtml,
    });
  }

  showError(error: string): void {
    if (!this._panel) {return;}
    const summaryHtml = buildErrorSummaryHtml(error);
    this._panel.webview.postMessage({
      type: MSG_RUN_ERROR,
      summaryHtml,
    });
  }

  dispose(): void {
    this._panel?.dispose();
  }
}
