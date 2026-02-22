interface Branding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  instituteName?: string;
}

interface ReportData {
  className: string;
  dateRange?: { startDate?: string; endDate?: string };
  generatedDate: string;
  overview: {
    studentCount: number;
    testCount: number;
    overallAverageScore: number;
    improvementTrend: number;
  };
  scoreStats?: {
    avg: number;
    median: number;
    highest: number;
    lowest: number;
    stdDev: number;
  };
  scoreDistribution?: Array<{ bucket: string; count: number }>;
  topPerformers?: Array<{
    name: string;
    score: number;
    percentage: number;
  }>;
  bottomPerformers?: Array<{
    name: string;
    score: number;
    percentage: number;
  }>;
  topicSummary?: Array<{
    topicName: string;
    classAccuracy: number;
  }>;
}

function svgHistogram(
  buckets: Array<{ bucket: string; count: number }>,
  primary: string
): string {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const barWidth = 40;
  const gap = 4;
  const maxHeight = 150;
  const chartWidth = buckets.length * (barWidth + gap) + gap;

  const bars = buckets
    .map((b, i) => {
      const x = i * (barWidth + gap) + gap;
      const height = (b.count / maxCount) * maxHeight;
      const y = maxHeight - height + 20;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="${primary}" rx="2"/>
        <text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#1f2937">${b.count}</text>
        <text x="${x + barWidth / 2}" y="${maxHeight + 34}" text-anchor="middle" font-size="8" fill="#6b7280">${b.bucket}</text>
      `;
    })
    .join("");

  return `<svg viewBox="0 0 ${chartWidth} ${maxHeight + 50}" width="${chartWidth}" height="${maxHeight + 50}" xmlns="http://www.w3.org/2000/svg">
    ${bars}
  </svg>`;
}

export function generateClassSummaryReport(
  data: ReportData,
  branding: Branding
): string {
  const primary = branding.primaryColor || "#2563eb";
  const institute = branding.instituteName || "PaperCraft Institute";
  const logo = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="Logo" style="max-height:60px;"/>`
    : "";

  const dateRangeStr = data.dateRange
    ? `${data.dateRange.startDate || "All time"} to ${data.dateRange.endDate || "Present"}`
    : "All time";

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
  .cover h1 { font-size: 28px; color: ${primary}; }
  .cover h2 { font-size: 20px; color: #6b7280; font-weight: normal; }
  h3 { color: ${primary}; font-size: 16px; border-bottom: 2px solid ${primary}; padding-bottom: 4px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .kpi-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
  .kpi-card .value { font-size: 22px; font-weight: bold; color: ${primary}; }
  .kpi-card .label { font-size: 11px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: ${primary}; color: white; padding: 8px; text-align: left; font-size: 11px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
  tr:nth-child(even) { background: #f9fafb; }
  .chart-container { text-align: center; margin: 16px 0; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9px; color: #9ca3af; padding: 8px; border-top: 1px solid #e5e7eb; }
</style>
</head>
<body>
<!-- Page 1: Cover -->
<div class="page cover">
  ${logo}
  <h1>Class Summary Report</h1>
  <h2>${data.className}</h2>
  <div style="margin-top:24px; color:#6b7280;">
    <p>Period: ${dateRangeStr}</p>
    <p>Generated: ${data.generatedDate}</p>
  </div>
</div>

<!-- Page 2: Overview -->
<div class="page">
  <h3>Class Overview</h3>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="value">${data.overview.studentCount}</div>
      <div class="label">Students</div>
    </div>
    <div class="kpi-card">
      <div class="value">${data.overview.testCount}</div>
      <div class="label">Tests</div>
    </div>
    <div class="kpi-card">
      <div class="value">${data.overview.overallAverageScore}%</div>
      <div class="label">Class Average</div>
    </div>
    <div class="kpi-card">
      <div class="value">${data.overview.improvementTrend >= 0 ? "+" : ""}${data.overview.improvementTrend}%</div>
      <div class="label">Improvement</div>
    </div>
  </div>

  ${
    data.scoreStats
      ? `
  <h3>Score Statistics</h3>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Average</td><td>${data.scoreStats.avg}%</td></tr>
    <tr><td>Median</td><td>${data.scoreStats.median}%</td></tr>
    <tr><td>Highest</td><td>${data.scoreStats.highest}%</td></tr>
    <tr><td>Lowest</td><td>${data.scoreStats.lowest}%</td></tr>
    <tr><td>Std Deviation</td><td>${data.scoreStats.stdDev}</td></tr>
  </table>`
      : ""
  }
</div>

${
  data.scoreDistribution
    ? `
<!-- Page 3: Score Distribution -->
<div class="page">
  <h3>Score Distribution</h3>
  <div class="chart-container">
    ${svgHistogram(data.scoreDistribution, primary)}
  </div>

  <div class="two-col">
    <div>
      <h3>Top Performers</h3>
      <table>
        <tr><th>#</th><th>Name</th><th>Score</th></tr>
        ${(data.topPerformers || [])
          .map(
            (s, i) =>
              `<tr><td>${i + 1}</td><td>${s.name}</td><td>${s.percentage}%</td></tr>`
          )
          .join("")}
      </table>
    </div>
    <div>
      <h3>Needs Support</h3>
      <table>
        <tr><th>#</th><th>Name</th><th>Score</th></tr>
        ${(data.bottomPerformers || [])
          .map(
            (s, i) =>
              `<tr><td>${i + 1}</td><td>${s.name}</td><td>${s.percentage}%</td></tr>`
          )
          .join("")}
      </table>
    </div>
  </div>
</div>`
    : ""
}

${
  data.topicSummary && data.topicSummary.length > 0
    ? `
<!-- Page 4: Topic Performance -->
<div class="page">
  <h3>Topic Performance Summary</h3>
  <table>
    <tr><th>Topic</th><th>Class Accuracy</th></tr>
    ${data.topicSummary
      .sort((a, b) => a.classAccuracy - b.classAccuracy)
      .map(
        (t) =>
          `<tr><td>${t.topicName}</td><td>${t.classAccuracy}%</td></tr>`
      )
      .join("")}
  </table>
</div>`
    : ""
}

<div class="footer">${institute} &bull; Confidential</div>
</body>
</html>`;
}
