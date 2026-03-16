// Specs: vscode-editor, vscode-layout
// Response webview panel — shows HTTP response after running a .nap file
// Uses minimal vanilla HTML/CSS — no framework dependency

import * as vscode from "vscode";
import type { RunResult } from "./types";
import {
  HTTP_STATUS_CLIENT_ERROR_MIN,
  RESPONSE_PANEL_TITLE,
  RESPONSE_PANEL_VIEW_TYPE,
} from "./constants";
import { escapeHtml, buildResultDetailHtml, SHARED_SECTION_STYLES } from "./htmlUtils";

const RESPONSE_PANEL_STYLES = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; margin: 0; }
  h2 { margin: 0 0 12px 0; font-size: 14px; }
  h3 { margin: 0; font-size: 13px; color: var(--vscode-descriptionForeground); display: inline; }
  h4 { margin: 0; font-size: 12px; color: var(--vscode-descriptionForeground); }
  .summary { display: flex; gap: 16px; align-items: baseline; margin-bottom: 16px; padding: 8px 12px; background: var(--vscode-editorWidget-background); border-radius: 4px; }
  .status-ok { color: var(--vscode-testing-iconPassed); font-weight: bold; font-size: 18px; }
  .status-error { color: var(--vscode-testing-iconFailed); font-weight: bold; font-size: 18px; }
  .duration { color: var(--vscode-descriptionForeground); }
  .passed-badge { color: var(--vscode-testing-iconPassed); font-weight: bold; }
  .failed-badge { color: var(--vscode-testing-iconFailed); font-weight: bold; }`,

 buildStatusLine = (result: RunResult): string => {
  if (result.statusCode === undefined) {return "";}
  const statusClass =
    result.statusCode < HTTP_STATUS_CLIENT_ERROR_MIN
      ? "status-ok"
      : "status-error";
  return `<span class="${statusClass}">${result.statusCode}</span>`;
},

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
  ${buildResultDetailHtml(result)}`;
},

 buildHtml = (result: RunResult): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>${SHARED_SECTION_STYLES}${RESPONSE_PANEL_STYLES}</style>
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
