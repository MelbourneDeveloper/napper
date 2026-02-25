// Standalone HTML report generator for playlist results
// Pure function — no VS Code SDK dependency
// Generates a beautiful, self-contained HTML file

import * as path from "path";
import { type RunResult } from "./types";
import { escapeHtml, highlightJson } from "./htmlUtils";
import { REPORT_STYLES } from "./reportStyles";

const buildReportAssertions = (result: RunResult): string => {
  if (result.assertions.length === 0) return "";

  const rows = result.assertions
    .map((a) => {
      const cls = a.passed ? "pass" : "fail";
      const icon = a.passed ? "\u2713" : "\u2717";
      const detail = a.passed
        ? ""
        : `<span class="assertion-detail">expected: ${escapeHtml(a.expected)} | actual: ${escapeHtml(a.actual)}</span>`;
      return `<div class="assertion-row ${cls}">
        <span class="assertion-icon">${icon}</span>
        <span class="assertion-target">${escapeHtml(a.target)}</span>
        ${detail}
      </div>`;
    })
    .join("\n");

  return `<div class="detail-section">
    <div class="detail-section-title">Assertions</div>
    <div class="assertions-list">${rows}</div>
  </div>`;
};

const buildReportHeaders = (
  headers: Readonly<Record<string, string>> | undefined
): string => {
  if (!headers) return "";

  const rows = Object.entries(headers)
    .map(
      ([k, v]) =>
        `<tr><td class="h-key">${escapeHtml(k)}</td><td class="h-val">${escapeHtml(v)}</td></tr>`
    )
    .join("\n");

  return `<div class="detail-section">
    <div class="detail-section-title">Response Headers</div>
    <table class="headers-table">
      <thead><tr><th>Header</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
};

const buildReportLog = (log: readonly string[] | undefined): string => {
  if (!log || log.length === 0) return "";

  const lines = log.map((line) => escapeHtml(line)).join("\n");

  return `<div class="detail-section">
    <div class="detail-section-title">Output</div>
    <pre class="log-output">${lines}</pre>
  </div>`;
};

const formatBodyForReport = (body: string): string => {
  try {
    const parsed: unknown = JSON.parse(body);
    return highlightJson(parsed, 0);
  } catch {
    return escapeHtml(body);
  }
};

const buildReportBody = (body: string | undefined): string => {
  if (!body) return "";

  return `<div class="detail-section">
    <div class="detail-section-title">Response Body</div>
    <pre class="code-block">${formatBodyForReport(body)}</pre>
  </div>`;
};

const buildStepCard = (result: RunResult, index: number): string => {
  const cls = result.passed ? "pass" : "fail";
  const icon = result.passed ? "\u2713" : "\u2717";
  const fileName = path.basename(result.file);
  const duration =
    result.duration !== undefined ? `${result.duration.toFixed(0)}ms` : "";

  const passedAssertions = result.assertions.filter((a) => a.passed).length;
  const totalAssertions = result.assertions.length;
  const assertionText =
    totalAssertions > 0
      ? `${passedAssertions}/${totalAssertions} assertions`
      : "";

  const httpBadge =
    result.statusCode !== undefined
      ? `<span class="badge http">${result.statusCode}</span>`
      : "";

  const durationBadge = duration
    ? `<span class="badge duration">${duration}</span>`
    : "";

  const statusBadge = `<span class="badge status-${cls}">${result.passed ? "PASSED" : "FAILED"}</span>`;

  const errorHtml = result.error
    ? `<div class="detail-section"><div class="detail-section-title">Error</div><pre class="error-box">${escapeHtml(result.error)}</pre></div>`
    : "";

  return `<div class="step-card" data-index="${index}">
    <div class="step-header" onclick="toggleStep(${index})">
      <div class="step-indicator ${cls}">${icon}</div>
      <div class="step-info">
        <div class="step-name">${escapeHtml(fileName)}</div>
        <div class="step-meta">
          ${assertionText ? `<span class="step-meta-item">${assertionText}</span>` : ""}
        </div>
      </div>
      <div class="step-badges">
        ${httpBadge}
        ${durationBadge}
        ${statusBadge}
      </div>
      <span class="step-chevron">&#x25B6;</span>
    </div>
    <div class="step-detail">
      ${errorHtml}
      ${buildReportLog(result.log)}
      ${buildReportAssertions(result)}
      ${buildReportHeaders(result.headers)}
      ${buildReportBody(result.body)}
    </div>
  </div>`;
};

export const generatePlaylistReport = (
  playlistName: string,
  results: readonly RunResult[]
): string => {
  const totalCount = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = totalCount - passedCount;
  const totalDuration = results.reduce(
    (acc, r) => acc + (r.duration ?? 0),
    0
  );
  const allPassed = totalCount > 0 && failedCount === 0;
  const passRate =
    totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(0) : "0";

  const timestamp = new Date().toLocaleString();

  const statusCls = allPassed ? "passed" : "failed";
  const statusText = allPassed ? "All Steps Passed" : "Some Steps Failed";
  const statusIcon = allPassed ? "\u2713" : "\u2717";

  const stepsHtml = results
    .map((result, index) => buildStepCard(result, index))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Napper Report — ${escapeHtml(playlistName)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="hero">
    <div class="hero-content">
      <div class="hero-label">Playlist Report</div>
      <h1>${escapeHtml(playlistName)}</h1>
      <div class="hero-timestamp">${escapeHtml(timestamp)}</div>
    </div>
  </div>

  <div class="dashboard">
    <div class="status-banner ${statusCls}">
      <div class="status-icon">${statusIcon}</div>
      <span>${statusText}</span>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Pass Rate</div>
        <div class="stat-value ${allPassed ? "pass" : "fail"}">${passRate}%</div>
        <div class="stat-sub">${passedCount} of ${totalCount} steps</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Passed</div>
        <div class="stat-value pass">${passedCount}</div>
        <div class="stat-sub">steps succeeded</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Failed</div>
        <div class="stat-value ${failedCount > 0 ? "fail" : "neutral"}">${failedCount}</div>
        <div class="stat-sub">steps failed</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Duration</div>
        <div class="stat-value neutral">${totalDuration.toFixed(0)}<span style="font-size: 16px; font-weight: 400;">ms</span></div>
        <div class="stat-sub">total execution time</div>
      </div>
    </div>

    <div class="progress-container">
      <div class="progress-bar-bg">
        <div class="progress-bar-fill ${allPassed ? "pass" : "mixed"}" style="width: ${passRate}%; --pass-pct: ${passRate}%;"></div>
      </div>
    </div>

    <div class="section-title">Steps (${totalCount})</div>
    <div class="steps-list">
      ${stepsHtml}
    </div>
  </div>

  <div class="footer">
    Generated by <a href="#">Napper</a>
  </div>

  <script>
    function toggleStep(index) {
      var card = document.querySelector('.step-card[data-index="' + index + '"]');
      if (!card) return;
      card.classList.toggle('open');
    }
  </script>
</body>
</html>`;
};
