export function eodReportTemplate(data: {
  companyName: string;
  logoUrl?: string | null;
  date: string;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  stuckRuns: number;
  findingsSummary: Array<{ severity: string; count: number; verified: number }>;
  topAgents: Array<{ name: string; runs: number; successRate: number }>;
  generatedBy: string;
  generatedAt: string;
}): string {
  const logoHtml = data.logoUrl
    ? `<img src="${data.logoUrl}" alt="Company Logo" style="height: 48px; max-width: 200px; object-fit: contain;" />`
    : `<div style="font-size: 24px; font-weight: bold; color: #1a1a1a;">${escapeHtml(data.companyName)}</div>`;

  const findingsRows = data.findingsSummary
    .map(
      (f) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-transform: capitalize;">${escapeHtml(f.severity)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center; font-weight: 600;">${f.count}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center; color: #16a34a;">${f.verified}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center; color: #dc2626;">${f.count - f.verified}</td>
    </tr>
  `
    )
    .join("");

  const agentRows = data.topAgents
    .map(
      (a) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">${escapeHtml(a.name)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${a.runs}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${a.successRate.toFixed(1)}%</td>
    </tr>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>End of Day Report — ${escapeHtml(data.companyName)}</title>
  <style>
    @page { margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }
    .page {
      padding: 60px 48px;
      max-width: 100%;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #1a1a1a;
    }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .header-right { text-align: right; }
    .header-right h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .header-right .date { margin: 4px 0 0; color: #666; font-size: 13px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .stat-card .value {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 4px;
    }
    .stat-card .label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stat-card.success .value { color: #16a34a; }
    .stat-card.failed .value { color: #dc2626; }
    .stat-card.stuck .value { color: #ea580c; }
    .section { margin-bottom: 32px; }
    .section h2 {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e5e5;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      padding: 10px 12px;
      background: #f8f9fa;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      letter-spacing: 0.3px;
    }
    td { padding: 8px 12px; }
    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #e5e5e5;
      font-size: 11px;
      color: #999;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-left">
        ${logoHtml}
      </div>
      <div class="header-right">
        <h1>End of Day Report</h1>
        <p class="date">${escapeHtml(data.date)}</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="value">${data.totalRuns}</div>
        <div class="label">Total Runs</div>
      </div>
      <div class="stat-card success">
        <div class="value">${data.succeededRuns}</div>
        <div class="label">Succeeded</div>
      </div>
      <div class="stat-card failed">
        <div class="value">${data.failedRuns}</div>
        <div class="label">Failed</div>
      </div>
      <div class="stat-card stuck">
        <div class="value">${data.stuckRuns}</div>
        <div class="label">Stuck</div>
      </div>
    </div>

    <div class="section">
      <h2>Findings Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th style="text-align: center;">Total</th>
            <th style="text-align: center;">Verified</th>
            <th style="text-align: center;">Unverified</th>
          </tr>
        </thead>
        <tbody>
          ${findingsRows || '<tr><td colspan="4" style="text-align: center; color: #999; padding: 24px;">No findings recorded today</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>Top Agents</h2>
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th style="text-align: center;">Runs</th>
            <th style="text-align: center;">Success Rate</th>
          </tr>
        </thead>
        <tbody>
          ${agentRows || '<tr><td colspan="3" style="text-align: center; color: #999; padding: 24px;">No agent activity today</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <span>Generated by ${escapeHtml(data.generatedBy)}</span>
      <span>${escapeHtml(data.generatedAt)}</span>
    </div>
  </div>
</body>
</html>`;
}

export function importSummaryTemplate(data: {
  companyName: string;
  logoUrl?: string | null;
  date: string;
  importedAgents: Array<{
    name: string;
    source: string;
    status: string;
    skills: number;
    issues: number;
  }>;
  totalImported: number;
  successfulImports: number;
  failedImports: number;
  generatedBy: string;
  generatedAt: string;
}): string {
  const logoHtml = data.logoUrl
    ? `<img src="${data.logoUrl}" alt="Company Logo" style="height: 48px; max-width: 200px; object-fit: contain;" />`
    : `<div style="font-size: 24px; font-weight: bold; color: #1a1a1a;">${escapeHtml(data.companyName)}</div>`;

  const agentRows = data.importedAgents
    .map(
      (a) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">${escapeHtml(a.name)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-family: monospace; font-size: 12px;">${escapeHtml(a.source)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">
        <span style="display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; ${
          a.status === "success"
            ? "background: #dcfce7; color: #16a34a;"
            : a.status === "failed"
            ? "background: #fee2e2; color: #dc2626;"
            : "background: #fef3c7; color: #d97706;"
        }">${escapeHtml(a.status)}</span>
      </td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${a.skills}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${a.issues}</td>
    </tr>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Agent Import Summary — ${escapeHtml(data.companyName)}</title>
  <style>
    @page { margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }
    .page {
      padding: 60px 48px;
      max-width: 100%;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #1a1a1a;
    }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .header-right { text-align: right; }
    .header-right h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .header-right .date { margin: 4px 0 0; color: #666; font-size: 13px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .stat-card .value {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 4px;
    }
    .stat-card .label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stat-card.success .value { color: #16a34a; }
    .stat-card.failed .value { color: #dc2626; }
    .section { margin-bottom: 32px; }
    .section h2 {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e5e5;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      padding: 10px 12px;
      background: #f8f9fa;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      letter-spacing: 0.3px;
    }
    td { padding: 8px 12px; }
    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #e5e5e5;
      font-size: 11px;
      color: #999;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-left">
        ${logoHtml}
      </div>
      <div class="header-right">
        <h1>Agent Import Summary</h1>
        <p class="date">${escapeHtml(data.date)}</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="value">${data.totalImported}</div>
        <div class="label">Total Imported</div>
      </div>
      <div class="stat-card success">
        <div class="value">${data.successfulImports}</div>
        <div class="label">Successful</div>
      </div>
      <div class="stat-card failed">
        <div class="value">${data.failedImports}</div>
        <div class="label">Failed</div>
      </div>
    </div>

    <div class="section">
      <h2>Imported Agents</h2>
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Source</th>
            <th style="text-align: center;">Status</th>
            <th style="text-align: center;">Skills</th>
            <th style="text-align: center;">Issues</th>
          </tr>
        </thead>
        <tbody>
          ${agentRows || '<tr><td colspan="5" style="text-align: center; color: #999; padding: 24px;">No agents imported</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <span>Generated by ${escapeHtml(data.generatedBy)}</span>
      <span>${escapeHtml(data.generatedAt)}</span>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
