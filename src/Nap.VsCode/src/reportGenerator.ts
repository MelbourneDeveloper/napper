// Specs: vscode-playlists
// Standalone HTML report generator for playlist results
// Pure function — no VS Code SDK dependency
// Generates a beautiful, self-contained HTML file

import * as path from "path";
import type { RunResult } from "./types";
import { escapeHtml, formatBodyHtml } from "./htmlUtils";
import { REPORT_STYLES } from "./reportStyles";
import {
  NAPPER_URL,
  NIMBLESITE_URL,
  PERCENTAGE_MULTIPLIER,
  REPORT_FOOTER_GENERATED_BY,
  REPORT_FOOTER_MADE_BY,
  SECTION_LABEL_REQUEST,
  SECTION_LABEL_REQUEST_BODY,
  SECTION_LABEL_REQUEST_HEADERS,
  SECTION_LABEL_RESPONSE,
  SECTION_LABEL_RESPONSE_HEADERS,
} from "./constants";

const buildReportAssertionRow = (a: {
  readonly passed: boolean;
  readonly target: string;
  readonly expected: string;
  readonly actual: string;
}): string => {
  const cls = a.passed ? "pass" : "fail",
   icon = a.passed ? "\u2713" : "\u2717",
   detail = a.passed
    ? ""
    : `<span class="assertion-detail">expected: ${escapeHtml(a.expected)} | actual: ${escapeHtml(a.actual)}</span>`;
  return `<div class="assertion-row ${cls}">
        <span class="assertion-icon">${icon}</span>
        <span class="assertion-target">${escapeHtml(a.target)}</span>
        ${detail}
      </div>`;
},

 buildReportAssertions = (result: RunResult): string => {
  if (result.assertions.length === 0) {return "";}

  const rows = result.assertions
    .map((a) => buildReportAssertionRow(a))
    .join("\n");

  return `<div class="detail-section">
    <div class="detail-section-title">Assertions</div>
    <div class="assertions-list">${rows}</div>
  </div>`;
},

 buildReportHeadersTable = (
  headers: Readonly<Record<string, string>> | undefined
): string => {
  if (!headers) {return "";}

  return Object.entries(headers)
    .map(
      ([k, v]) =>
        `<tr><td class="h-key">${escapeHtml(k)}</td><td class="h-val">${escapeHtml(v)}</td></tr>`
    )
    .join("\n");
},

 buildReportHeadersSection = (
  title: string,
  headers: Readonly<Record<string, string>> | undefined
): string => {
  const rows = buildReportHeadersTable(headers);
  if (!rows) {return "";}

  return `<div class="detail-section">
    <div class="detail-section-title">${title}</div>
    <table class="headers-table">
      <thead><tr><th>Header</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
},

 buildReportLog = (log: readonly string[] | undefined): string => {
  if (!log || log.length === 0) {return "";}

  const lines = log.map((line) => escapeHtml(line)).join("\n");

  return `<div class="detail-section">
    <div class="detail-section-title">Output</div>
    <pre class="log-output">${lines}</pre>
  </div>`;
},

 buildReportBody = (body: string | undefined): string => {
  if (body === undefined || body === "") {return "";}

  return `<div class="detail-section">
    <div class="detail-section-title">Response Body</div>
    <pre class="code-block">${formatBodyHtml(body)}</pre>
  </div>`;
},

 buildReportRequestUrl = (result: RunResult): string =>
  result.requestUrl !== undefined && result.requestUrl !== ""
    ? `<div class="request-url-line"><span class="request-method-tag">${escapeHtml(result.requestMethod ?? "")}</span> ${escapeHtml(result.requestUrl)}</div>`
    : "",

 buildReportRequestBody = (result: RunResult): string => {
  if (result.requestBody === undefined || result.requestBody === "") {return "";}
  const formatted = formatBodyHtml(result.requestBody),
   contentTypeHint = result.requestBodyContentType !== undefined && result.requestBodyContentType !== ""
    ? `<div class="content-type-hint">${escapeHtml(result.requestBodyContentType)}</div>`
    : "";
  return `<div class="detail-section">
    <div class="detail-section-title">${SECTION_LABEL_REQUEST_BODY}</div>
    ${contentTypeHint}
    <pre class="code-block">${formatted}</pre>
  </div>`;
},

 buildReportCollapsibleGroup = ({
  title,
  content,
  open,
}: {
  readonly title: string;
  readonly content: string;
  readonly open: boolean;
}): string =>
  `<details class="report-group"${open ? " open" : ""}>
    <summary class="report-group-summary"><span class="report-group-title">${title}</span><span class="report-group-chevron">&#x25B6;</span></summary>
    <div class="report-group-content">${content}</div>
  </details>`,

 buildReportRequestGroup = (result: RunResult): string => {
  const urlHtml = buildReportRequestUrl(result),
   headersHtml = buildReportHeadersSection(SECTION_LABEL_REQUEST_HEADERS, result.requestHeaders),
   bodyHtml = buildReportRequestBody(result),
   content = `${urlHtml}${headersHtml}${bodyHtml}`;

  return buildReportCollapsibleGroup({
    title: SECTION_LABEL_REQUEST,
    content: content !== "" ? content : '<span class="empty-hint">No request details</span>',
    open: false,
  });
},

 buildReportResponseGroup = (result: RunResult): string => {
  const parts: string[] = [];

  if (result.assertions.length > 0) {
    parts.push(buildReportAssertions(result));
  }

  const headersHtml = buildReportHeadersSection(SECTION_LABEL_RESPONSE_HEADERS, result.headers);
  if (headersHtml !== "") {
    parts.push(headersHtml);
  }

  const bodyHtml = buildReportBody(result.body);
  if (bodyHtml !== "") {
    parts.push(bodyHtml);
  }

  if (parts.length === 0) {return "";}

  return buildReportCollapsibleGroup({
    title: SECTION_LABEL_RESPONSE,
    content: parts.join("\n"),
    open: true,
  });
},

 buildStepCardBadges = (result: RunResult, cls: string, duration: string): string => {
  const httpBadge =
    result.statusCode !== undefined
      ? `<span class="badge http">${result.statusCode}</span>`
      : "",

   durationBadge = duration !== ""
    ? `<span class="badge duration">${duration}</span>`
    : "",

   statusBadge = `<span class="badge status-${cls}">${result.passed ? "PASSED" : "FAILED"}</span>`;

  return `${httpBadge}
        ${durationBadge}
        ${statusBadge}`;
},

 buildStepCardErrorHtml = (error: string | undefined): string =>
  error !== undefined && error !== ""
    ? `<div class="detail-section"><div class="detail-section-title">Error</div><pre class="error-box">${escapeHtml(error)}</pre></div>`
    : "",

 buildStepCardMetaHtml = (assertionText: string): string =>
  assertionText !== "" ? `<span class="step-meta-item">${assertionText}</span>` : "",

 buildStepCardHeader = (opts: {
  readonly result: RunResult;
  readonly index: number;
  readonly cls: string;
  readonly icon: string;
  readonly fileName: string;
  readonly assertionText: string;
  readonly duration: string;
}): string => `
    <div class="step-header" onclick="toggleStep(${opts.index})">
      <div class="step-indicator ${opts.cls}">${opts.icon}</div>
      <div class="step-info">
        <div class="step-name">${escapeHtml(opts.fileName)}</div>
        <div class="step-meta">${buildStepCardMetaHtml(opts.assertionText)}</div>
      </div>
      <div class="step-badges">
        ${buildStepCardBadges(opts.result, opts.cls, opts.duration)}
      </div>
      <span class="step-chevron">&#x25B6;</span>
    </div>`,

 buildStepCardProps = (result: RunResult): {
  readonly cls: string;
  readonly icon: string;
  readonly fileName: string;
  readonly duration: string;
  readonly assertionText: string;
} => {
  const passedAssertions = result.assertions.filter((a) => a.passed).length,
   totalAssertions = result.assertions.length;
  return {
    cls: result.passed ? "pass" : "fail",
    icon: result.passed ? "\u2713" : "\u2717",
    fileName: path.basename(result.file),
    duration: result.duration !== undefined ? `${result.duration.toFixed(0)}ms` : "",
    assertionText: totalAssertions > 0 ? `${passedAssertions}/${totalAssertions} assertions` : "",
  };
},

 buildStepCardDetail = (result: RunResult): string =>
  `${buildStepCardErrorHtml(result.error)}
      ${buildReportLog(result.log)}
      ${buildReportRequestGroup(result)}
      ${buildReportResponseGroup(result)}`,

 buildStepCard = (result: RunResult, index: number): string => {
  const props = buildStepCardProps(result),
   header = buildStepCardHeader({ result, index, ...props });
  return `<div class="step-card" data-index="${index}">
    ${header}
    <div class="step-detail">${buildStepCardDetail(result)}</div>
  </div>`;
},

 computeReportStats = (results: readonly RunResult[]): {
  readonly totalCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly totalDuration: number;
  readonly allPassed: boolean;
  readonly passRate: string;
} => {
  const totalCount = results.length,
   passedCount = results.filter((r) => r.passed).length,
   failedCount = totalCount - passedCount,
   totalDuration = results.reduce(
    (acc, r) => acc + (r.duration ?? 0),
    0
  ),
   allPassed = totalCount > 0 && failedCount === 0,
   passRate =
    totalCount > 0 ? ((passedCount / totalCount) * PERCENTAGE_MULTIPLIER).toFixed(0) : "0";
  return { totalCount, passedCount, failedCount, totalDuration, allPassed, passRate };
},

 buildReportStatusSection = (stats: {
  readonly allPassed: boolean;
  readonly statusCls: string;
  readonly statusText: string;
  readonly statusIcon: string;
}): string => `
    <div class="status-banner ${stats.statusCls}">
      <div class="status-icon">${stats.statusIcon}</div>
      <span>${stats.statusText}</span>
    </div>`,

 buildStatCard = (opts: {
  readonly label: string;
  readonly valueCls: string;
  readonly value: string;
  readonly sub: string;
}): string =>
  `<div class="stat-card"><div class="stat-label">${opts.label}</div><div class="stat-value ${opts.valueCls}">${opts.value}</div><div class="stat-sub">${opts.sub}</div></div>`,

 buildReportStatsGrid = (stats: ReturnType<typeof computeReportStats>): string => {
  const passRateCard = buildStatCard({ label: "Pass Rate", valueCls: stats.allPassed ? "pass" : "fail", value: `${stats.passRate}%`, sub: `${stats.passedCount} of ${stats.totalCount} steps` }),
   passedCard = buildStatCard({ label: "Passed", valueCls: "pass", value: `${stats.passedCount}`, sub: "steps succeeded" }),
   failedCls = stats.failedCount > 0 ? "fail" : "neutral",
   failedCard = buildStatCard({ label: "Failed", valueCls: failedCls, value: `${stats.failedCount}`, sub: "steps failed" }),
   durationVal = `${stats.totalDuration.toFixed(0)}<span style="font-size: 16px; font-weight: 400;">ms</span>`,
   durationCard = buildStatCard({ label: "Duration", valueCls: "neutral", value: durationVal, sub: "total execution time" });
  return `<div class="stats-grid">${passRateCard}${passedCard}${failedCard}${durationCard}</div>`;
},

 buildReportProgressBar = (passRate: string, allPassed: boolean): string => `
    <div class="progress-container">
      <div class="progress-bar-bg">
        <div class="progress-bar-fill ${allPassed ? "pass" : "mixed"}" style="width: ${passRate}%; --pass-pct: ${passRate}%;"></div>
      </div>
    </div>`,

 buildReportDashboard = (stats: ReturnType<typeof computeReportStats>, stepsHtml: string): string => {
  const statusCls = stats.allPassed ? "passed" : "failed",
   statusText = stats.allPassed ? "All Steps Passed" : "Some Steps Failed",
   statusIcon = stats.allPassed ? "\u2713" : "\u2717";

  return `<div class="dashboard">
    ${buildReportStatusSection({ allPassed: stats.allPassed, statusCls, statusText, statusIcon })}
    ${buildReportStatsGrid(stats)}
    ${buildReportProgressBar(stats.passRate, stats.allPassed)}
    <div class="section-title">Steps (${stats.totalCount})</div>
    <div class="steps-list">
      ${stepsHtml}
    </div>
  </div>`;
},

 buildReportFooter = (): string => `
  <div class="footer">
    ${REPORT_FOOTER_GENERATED_BY} <a href="${NAPPER_URL}">Napper</a> &middot; ${REPORT_FOOTER_MADE_BY} <a href="${NIMBLESITE_URL}">Nimblesite</a>
  </div>`,

 buildReportHeroHtml = (playlistName: string, timestamp: string): string => `
  <div class="hero">
    <div class="hero-content">
      <div class="hero-label">Playlist Report</div>
      <h1>${escapeHtml(playlistName)}</h1>
      <div class="hero-timestamp">${escapeHtml(timestamp)}</div>
    </div>
  </div>`,

 buildReportToggleScript = (): string => `
  <script>
    function toggleStep(index) {
      var card = document.querySelector('.step-card[data-index="' + index + '"]');
      if (!card) return;
      card.classList.toggle('open');
    }
  </script>`,

 buildReportHead = (playlistName: string): string => `<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Napper Report — ${escapeHtml(playlistName)}</title>
<style>${REPORT_STYLES}</style>
</head>`;

export const generatePlaylistReport = (
  playlistName: string,
  results: readonly RunResult[]
): string => {
  const stats = computeReportStats(results),
   stepsHtml = results.map((result, index) => buildStepCard(result, index)).join("\n"),
   hero = buildReportHeroHtml(playlistName, new Date().toLocaleString()),
   dashboard = buildReportDashboard(stats, stepsHtml);
  return `<!DOCTYPE html>
<html lang="en">
${buildReportHead(playlistName)}
<body>
  ${hero}
  ${dashboard}
  ${buildReportFooter()}
  ${buildReportToggleScript()}
</body>
</html>`;
};
