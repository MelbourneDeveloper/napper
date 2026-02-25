// CSS styles for standalone HTML reports
// Extracted to keep reportGenerator.ts under 450 LOC

const REPORT_PASS_COLOR = "#10b981";
const REPORT_FAIL_COLOR = "#ef4444";
const REPORT_GRADIENT_START = "#0f172a";
const REPORT_GRADIENT_END = "#1e293b";
const REPORT_ACCENT = "#6366f1";
const REPORT_CARD_BG = "#ffffff";
const REPORT_BODY_BG = "#f8fafc";
const REPORT_TEXT_PRIMARY = "#0f172a";
const REPORT_TEXT_SECONDARY = "#64748b";
const REPORT_BORDER = "#e2e8f0";
const REPORT_CODE_BG = "#1e293b";
const REPORT_CODE_TEXT = "#e2e8f0";
const REPORT_PASS_BG = "#ecfdf5";
const REPORT_FAIL_BG = "#fef2f2";
const REPORT_PASS_BORDER = "#a7f3d0";
const REPORT_FAIL_BORDER = "#fecaca";

export const REPORT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: ${REPORT_BODY_BG};
    color: ${REPORT_TEXT_PRIMARY};
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .hero {
    background: linear-gradient(135deg, ${REPORT_GRADIENT_START} 0%, ${REPORT_GRADIENT_END} 50%, ${REPORT_ACCENT} 100%);
    padding: 48px 40px 56px;
    color: #fff;
    position: relative;
    overflow: hidden;
  }

  .hero::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -20%;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
    pointer-events: none;
  }

  .hero::after {
    content: '';
    position: absolute;
    bottom: -40%;
    left: -10%;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%);
    pointer-events: none;
  }

  .hero-content { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; }
  .hero-label { font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
  .hero h1 { font-size: 32px; font-weight: 700; margin-bottom: 6px; letter-spacing: -0.5px; }
  .hero-timestamp { font-size: 13px; color: rgba(255,255,255,0.45); font-weight: 400; }

  .dashboard {
    max-width: 1200px;
    margin: -32px auto 0;
    padding: 0 24px;
    position: relative;
    z-index: 2;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: ${REPORT_CARD_BG};
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04);
    border: 1px solid ${REPORT_BORDER};
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.06);
  }

  .stat-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: ${REPORT_TEXT_SECONDARY};
    margin-bottom: 8px;
  }

  .stat-value { font-size: 36px; font-weight: 700; letter-spacing: -1px; line-height: 1.1; }
  .stat-value.pass { color: ${REPORT_PASS_COLOR}; }
  .stat-value.fail { color: ${REPORT_FAIL_COLOR}; }
  .stat-value.neutral { color: ${REPORT_TEXT_PRIMARY}; }
  .stat-sub { font-size: 13px; color: ${REPORT_TEXT_SECONDARY}; margin-top: 4px; }

  .status-banner {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px 28px;
    border-radius: 12px;
    margin-bottom: 32px;
    font-weight: 600;
    font-size: 18px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }

  .status-banner.passed {
    background: ${REPORT_PASS_BG};
    border: 1px solid ${REPORT_PASS_BORDER};
    color: #065f46;
  }

  .status-banner.failed {
    background: ${REPORT_FAIL_BG};
    border: 1px solid ${REPORT_FAIL_BORDER};
    color: #991b1b;
  }

  .status-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }

  .status-banner.passed .status-icon { background: ${REPORT_PASS_COLOR}; color: #fff; }
  .status-banner.failed .status-icon { background: ${REPORT_FAIL_COLOR}; color: #fff; }

  .progress-container { margin-bottom: 32px; }

  .progress-bar-bg {
    height: 8px;
    background: ${REPORT_BORDER};
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .progress-bar-fill.pass { background: linear-gradient(90deg, ${REPORT_PASS_COLOR}, #34d399); }
  .progress-bar-fill.fail { background: linear-gradient(90deg, ${REPORT_FAIL_COLOR}, #f87171); }
  .progress-bar-fill.mixed {
    background: linear-gradient(90deg, ${REPORT_PASS_COLOR} 0%, ${REPORT_PASS_COLOR} var(--pass-pct), ${REPORT_FAIL_COLOR} var(--pass-pct), ${REPORT_FAIL_COLOR} 100%);
  }

  .section-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 16px;
    color: ${REPORT_TEXT_PRIMARY};
    letter-spacing: -0.3px;
  }

  .steps-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 48px; }

  .step-card {
    background: ${REPORT_CARD_BG};
    border-radius: 12px;
    border: 1px solid ${REPORT_BORDER};
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    overflow: hidden;
    transition: box-shadow 0.2s;
  }

  .step-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }

  .step-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 20px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }

  .step-header:hover { background: ${REPORT_BODY_BG}; }

  .step-indicator {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .step-indicator.pass { background: ${REPORT_PASS_BG}; color: ${REPORT_PASS_COLOR}; border: 2px solid ${REPORT_PASS_BORDER}; }
  .step-indicator.fail { background: ${REPORT_FAIL_BG}; color: ${REPORT_FAIL_COLOR}; border: 2px solid ${REPORT_FAIL_BORDER}; }

  .step-info { flex: 1; min-width: 0; }
  .step-name { font-weight: 600; font-size: 14px; color: ${REPORT_TEXT_PRIMARY}; }
  .step-meta { display: flex; gap: 16px; margin-top: 2px; }
  .step-meta-item { font-size: 12px; color: ${REPORT_TEXT_SECONDARY}; display: flex; align-items: center; gap: 4px; }

  .step-badges { display: flex; gap: 8px; align-items: center; }

  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 100px;
    letter-spacing: 0.3px;
  }

  .badge.status-pass { background: ${REPORT_PASS_BG}; color: #065f46; border: 1px solid ${REPORT_PASS_BORDER}; }
  .badge.status-fail { background: ${REPORT_FAIL_BG}; color: #991b1b; border: 1px solid ${REPORT_FAIL_BORDER}; }
  .badge.http { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
  .badge.duration { background: #f5f3ff; color: #5b21b6; border: 1px solid #ddd6fe; }

  .step-chevron {
    color: ${REPORT_TEXT_SECONDARY};
    font-size: 12px;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
  }

  .step-card.open .step-chevron { transform: rotate(90deg); }

  .step-detail {
    display: none;
    padding: 0 20px 20px;
    border-top: 1px solid ${REPORT_BORDER};
    animation: slideDown 0.25s ease;
  }

  .step-card.open .step-detail { display: block; }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .detail-section { margin-top: 16px; }
  .detail-section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: ${REPORT_TEXT_SECONDARY};
    margin-bottom: 8px;
  }

  .error-box {
    background: ${REPORT_FAIL_BG};
    border: 1px solid ${REPORT_FAIL_BORDER};
    border-radius: 8px;
    padding: 12px 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: #991b1b;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .assertions-list { display: flex; flex-direction: column; gap: 4px; }

  .assertion-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
  }

  .assertion-row.pass { background: ${REPORT_PASS_BG}; }
  .assertion-row.fail { background: ${REPORT_FAIL_BG}; }
  .assertion-icon { font-size: 14px; flex-shrink: 0; }
  .assertion-row.pass .assertion-icon { color: ${REPORT_PASS_COLOR}; }
  .assertion-row.fail .assertion-icon { color: ${REPORT_FAIL_COLOR}; }
  .assertion-target { font-weight: 500; }

  .assertion-detail {
    font-size: 12px;
    color: ${REPORT_TEXT_SECONDARY};
    margin-left: auto;
    font-family: 'JetBrains Mono', monospace;
  }

  .headers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid ${REPORT_BORDER};
  }

  .headers-table th {
    text-align: left;
    padding: 8px 12px;
    background: ${REPORT_BODY_BG};
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: ${REPORT_TEXT_SECONDARY};
    border-bottom: 1px solid ${REPORT_BORDER};
  }

  .headers-table td {
    padding: 8px 12px;
    border-bottom: 1px solid ${REPORT_BORDER};
  }

  .headers-table tr:last-child td { border-bottom: none; }
  .headers-table .h-key { font-weight: 500; white-space: nowrap; color: ${REPORT_TEXT_PRIMARY}; }
  .headers-table .h-val { color: ${REPORT_TEXT_SECONDARY}; word-break: break-all; font-family: 'JetBrains Mono', monospace; font-size: 12px; }

  .code-block {
    background: ${REPORT_CODE_BG};
    color: ${REPORT_CODE_TEXT};
    border-radius: 8px;
    padding: 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .json-key { color: #93c5fd; }
  .json-string { color: #fca5a5; }
  .json-number { color: #86efac; }
  .json-bool { color: #c4b5fd; }
  .json-null { color: #94a3b8; }

  .log-output {
    background: ${REPORT_CODE_BG};
    color: #a3e635;
    border-radius: 8px;
    padding: 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .footer {
    text-align: center;
    padding: 32px 24px;
    color: ${REPORT_TEXT_SECONDARY};
    font-size: 12px;
    border-top: 1px solid ${REPORT_BORDER};
  }

  .footer a { color: ${REPORT_ACCENT}; text-decoration: none; }
  .footer a:hover { text-decoration: underline; }

  @media print {
    .hero { padding: 24px; }
    .step-card { break-inside: avoid; }
    .step-detail { display: block !important; }
    .step-chevron { display: none; }
    .stat-card:hover { transform: none; }
  }

  @media (max-width: 640px) {
    .hero { padding: 32px 20px 40px; }
    .hero h1 { font-size: 24px; }
    .dashboard { padding: 0 16px; }
    .stats-grid { grid-template-columns: 1fr 1fr; }
    .stat-value { font-size: 28px; }
  }
`;
