interface Branding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  instituteName?: string;
}

interface ReportData {
  studentName: string;
  targetExam?: string;
  generatedDate: string;
  dateRange?: { startDate?: string; endDate?: string };
  qualificationBand: {
    band: string | null;
    avgScore: number;
    confidence: string;
    testCount: number;
  };
  bandThresholds: { strongPass: number; pass: number; borderline: number };
  cohortPercentile: { percentile: number; cohortSize: number };
  componentScores: Array<{
    component: string;
    avgPercentage: number;
    testCount: number;
    trend: number;
    sections: Array<{ sectionName: string; avgPercentage: number }>;
  }>;
  scoreTrend: Array<{
    testTitle: string;
    date: string;
    percentage: number;
  }>;
  weakestTopics?: Array<{ topicName: string; accuracy: number }>;
  timeAnalysis?: {
    averageTimePerQuestion: number;
    fastestQuestionTime: number;
    slowestQuestionTime: number;
  };
}

function bandColor(band: string | null): string {
  switch (band) {
    case "Strong Pass":
      return "#16a34a";
    case "Pass":
      return "#2563eb";
    case "Borderline":
      return "#d97706";
    case "Below":
      return "#dc2626";
    default:
      return "#6b7280";
  }
}

function svgBarChart(
  components: Array<{ label: string; value: number; trend: number }>,
  primary: string
): string {
  const barWidth = 60;
  const gap = 20;
  const maxHeight = 200;
  const chartWidth = components.length * (barWidth + gap);

  const bars = components
    .map((c, i) => {
      const x = i * (barWidth + gap) + gap;
      const height = (c.value / 100) * maxHeight;
      const y = maxHeight - height + 30;
      const trendStr =
        c.trend > 0
          ? `&#9650;+${c.trend}`
          : c.trend < 0
            ? `&#9660;${c.trend}`
            : "&#8212;";
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="${primary}" rx="4"/>
        <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" font-size="13" font-weight="bold" fill="#1f2937">${c.value}%</text>
        <text x="${x + barWidth / 2}" y="${maxHeight + 48}" text-anchor="middle" font-size="10" fill="#4b5563">${c.label}</text>
        <text x="${x + barWidth / 2}" y="${maxHeight + 62}" text-anchor="middle" font-size="9" fill="${c.trend >= 0 ? "#16a34a" : "#dc2626"}">${trendStr}</text>
      `;
    })
    .join("");

  return `<svg viewBox="0 0 ${chartWidth + gap} ${maxHeight + 80}" width="${chartWidth + gap}" height="${maxHeight + 80}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${gap}" y1="${maxHeight + 30}" x2="${chartWidth}" y2="${maxHeight + 30}" stroke="#e5e7eb" stroke-width="1"/>
    ${bars}
  </svg>`;
}

function svgTrendLine(
  data: Array<{ label: string; value: number }>,
  passThreshold: number,
  primary: string
): string {
  if (data.length < 2) return "";
  const w = 500,
    h = 200,
    pad = 40;
  const xStep = (w - 2 * pad) / (data.length - 1);

  const points = data
    .map((d, i) => `${pad + i * xStep},${h - pad - ((d.value / 100) * (h - 2 * pad))}`)
    .join(" ");

  const thresholdY = h - pad - ((passThreshold / 100) * (h - 2 * pad));

  return `<svg viewBox="0 0 ${w} ${h + 40}" width="${w}" height="${h + 40}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${pad}" y1="${thresholdY}" x2="${w - pad}" y2="${thresholdY}" stroke="#dc2626" stroke-dasharray="5,5" stroke-width="1"/>
    <text x="${w - pad + 4}" y="${thresholdY + 4}" font-size="9" fill="#dc2626">Pass (${passThreshold}%)</text>
    <polyline points="${points}" fill="none" stroke="${primary}" stroke-width="2"/>
    ${data
      .map(
        (d, i) =>
          `<circle cx="${pad + i * xStep}" cy="${h - pad - ((d.value / 100) * (h - 2 * pad))}" r="4" fill="${primary}"/>`
      )
      .join("")}
    ${data
      .map(
        (d, i) =>
          `<text x="${pad + i * xStep}" y="${h + 4}" text-anchor="middle" font-size="8" fill="#6b7280" transform="rotate(-30 ${pad + i * xStep} ${h + 4})">${d.label}</text>`
      )
      .join("")}
  </svg>`;
}

export function generateElevenPlusMockAnalysis(
  data: ReportData,
  branding: Branding
): string {
  const primary = branding.primaryColor || "#2563eb";
  const institute = branding.instituteName || "PaperCraft Institute";
  const logo = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="Logo" style="max-height:60px;"/>`
    : "";

  const bColor = bandColor(data.qualificationBand.band);
  const componentBars = data.componentScores.map((c) => ({
    label: c.component,
    value: c.avgPercentage,
    trend: c.trend,
  }));

  const trendData = data.scoreTrend.map((s) => ({
    label: s.date,
    value: s.percentage,
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  @page { margin: 20mm 15mm 25mm 15mm; size: A4; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; padding: 0; font-size: 12px; line-height: 1.5; }
  .page { page-break-after: always; padding: 20px 0; min-height: 800px; }
  .page:last-child { page-break-after: avoid; }
  .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; min-height: 800px; }
  .cover h1 { font-size: 26px; color: ${primary}; }
  .cover h2 { font-size: 18px; color: #6b7280; font-weight: normal; }
  h3 { color: ${primary}; font-size: 16px; border-bottom: 2px solid ${primary}; padding-bottom: 4px; }
  .band-badge { display: inline-block; padding: 12px 24px; border-radius: 12px; font-size: 22px; font-weight: bold; color: white; margin: 16px 0; }
  .info-row { display: flex; gap: 24px; margin: 12px 0; }
  .info-card { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
  .info-card .value { font-size: 20px; font-weight: bold; color: ${primary}; }
  .info-card .label { font-size: 11px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: ${primary}; color: white; padding: 8px; text-align: left; font-size: 11px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
  .chart-container { text-align: center; margin: 16px 0; }
  .callout { background: #eff6ff; border-left: 4px solid ${primary}; padding: 8px 12px; margin: 8px 0; border-radius: 0 4px 4px 0; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9px; color: #9ca3af; padding: 8px; border-top: 1px solid #e5e7eb; }
</style>
</head>
<body>
<!-- Page 1: Cover -->
<div class="page cover">
  ${logo}
  <h1>11+ Mock Test Analysis Report</h1>
  <h2>${data.studentName}</h2>
  <div style="margin-top:24px; color:#6b7280; font-size:14px;">
    ${data.targetExam ? `<p>Target Exam: ${data.targetExam}</p>` : ""}
    <p>Generated: ${data.generatedDate}</p>
  </div>
</div>

<!-- Page 2: Qualification Band -->
<div class="page">
  <h3>Qualification Band Prediction</h3>
  <div style="text-align:center; margin:24px 0;">
    <div class="band-badge" style="background:${bColor}">
      ${data.qualificationBand.band || "Insufficient Data"}
    </div>
    <p style="color:#6b7280;">Based on rolling average of last ${data.qualificationBand.testCount} mock tests</p>
  </div>
  <div class="info-row">
    <div class="info-card">
      <div class="value">${data.qualificationBand.avgScore}%</div>
      <div class="label">Rolling Average</div>
    </div>
    <div class="info-card">
      <div class="value">${data.qualificationBand.confidence}</div>
      <div class="label">Confidence</div>
    </div>
    <div class="info-card">
      <div class="value">${data.cohortPercentile.percentile}th</div>
      <div class="label">Cohort Percentile (of ${data.cohortPercentile.cohortSize})</div>
    </div>
  </div>
  <div class="callout">
    <strong>Band Cutoffs:</strong>
    Strong Pass &ge; ${data.bandThresholds.strongPass}% &bull;
    Pass &ge; ${data.bandThresholds.pass}% &bull;
    Borderline &ge; ${data.bandThresholds.borderline}% &bull;
    Below &lt; ${data.bandThresholds.borderline}%
  </div>
</div>

<!-- Page 3: Component Scores -->
<div class="page">
  <h3>Component Scores</h3>
  <div class="chart-container">
    ${svgBarChart(componentBars, primary)}
  </div>
  ${data.componentScores
    .map(
      (c) => `
    <div style="margin:8px 0;">
      <strong>${c.component}</strong> (${c.testCount} tests)
      ${c.sections
        .map((s) => `<span style="margin-left:12px;color:#6b7280;">${s.sectionName}: ${s.avgPercentage}%</span>`)
        .join("")}
    </div>`
    )
    .join("")}
</div>

<!-- Page 4: Score Trends -->
<div class="page">
  <h3>Score Trends</h3>
  <div class="chart-container">
    ${svgTrendLine(trendData, data.bandThresholds.pass, primary)}
  </div>
  <table>
    <tr><th>Test</th><th>Date</th><th>Score</th></tr>
    ${data.scoreTrend
      .map((s) => `<tr><td>${s.testTitle}</td><td>${s.date}</td><td>${s.percentage}%</td></tr>`)
      .join("")}
  </table>
</div>

<!-- Page 5: Recommendations -->
<div class="page">
  <h3>Areas for Focus</h3>
  ${
    data.weakestTopics && data.weakestTopics.length > 0
      ? `
  <h4>Weakest Topics</h4>
  <table>
    <tr><th>Topic</th><th>Accuracy</th></tr>
    ${data.weakestTopics
      .slice(0, 5)
      .map((t) => `<tr><td>${t.topicName}</td><td>${t.accuracy}%</td></tr>`)
      .join("")}
  </table>`
      : "<p>Not enough data for topic analysis.</p>"
  }
  ${
    data.timeAnalysis
      ? `
  <h4>Time Management</h4>
  <div class="info-row">
    <div class="info-card">
      <div class="value">${data.timeAnalysis.averageTimePerQuestion}s</div>
      <div class="label">Avg Time / Question</div>
    </div>
    <div class="info-card">
      <div class="value">${data.timeAnalysis.fastestQuestionTime}s</div>
      <div class="label">Fastest</div>
    </div>
    <div class="info-card">
      <div class="value">${data.timeAnalysis.slowestQuestionTime}s</div>
      <div class="label">Slowest</div>
    </div>
  </div>`
      : ""
  }
</div>

<div class="footer">${institute} &bull; Confidential</div>
</body>
</html>`;
}
