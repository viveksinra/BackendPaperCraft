interface Branding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  instituteName?: string;
}

interface ReportData {
  studentName: string;
  yearGroup?: string;
  school?: string;
  dateRange?: { startDate?: string; endDate?: string };
  generatedDate: string;
  overallStats: {
    totalTestsTaken: number;
    averagePercentage: number;
    bestPercentage: number;
    worstPercentage: number;
    improvementRate: number;
    percentileInClass: number;
    percentileInOrg: number;
  };
  subjectBreakdown: Array<{
    subjectName: string;
    averagePercentage: number;
    classAvg?: number;
    trend: number;
  }>;
  testPerformance: Array<{
    testTitle: string;
    completedAt: string;
    score: number;
    totalMarks: number;
    percentage: number;
    rank?: number | null;
    classAvg?: number;
  }>;
  topicPerformance?: Array<{
    topicName: string;
    accuracy: number;
    totalQuestions: number;
  }>;
  classRanking?: { rank: number; total: number };
}

function svgRadarChart(
  subjects: Array<{ name: string; value: number; classAvg?: number }>,
  primaryColor: string
): string {
  if (subjects.length < 3) return "";
  const cx = 150,
    cy = 150,
    r = 120;
  const n = subjects.length;
  const angleStep = (2 * Math.PI) / n;

  // Grid lines
  let gridLines = "";
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (r * ring) / 4;
    const points = Array.from({ length: n }, (_, i) => {
      const angle = i * angleStep - Math.PI / 2;
      return `${cx + rr * Math.cos(angle)},${cy + rr * Math.sin(angle)}`;
    }).join(" ");
    gridLines += `<polygon points="${points}" fill="none" stroke="#e5e7eb" stroke-width="1"/>`;
  }

  // Axis lines
  let axisLines = "";
  for (let i = 0; i < n; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
  }

  // Student data polygon
  const studentPoints = subjects
    .map((s, i) => {
      const val = Math.min(100, Math.max(0, s.value));
      const rr = (r * val) / 100;
      const angle = i * angleStep - Math.PI / 2;
      return `${cx + rr * Math.cos(angle)},${cy + rr * Math.sin(angle)}`;
    })
    .join(" ");

  // Labels
  let labels = "";
  for (let i = 0; i < n; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const lx = cx + (r + 25) * Math.cos(angle);
    const ly = cy + (r + 25) * Math.sin(angle);
    const anchor =
      Math.abs(Math.cos(angle)) < 0.1
        ? "middle"
        : Math.cos(angle) > 0
          ? "start"
          : "end";
    labels += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" font-size="11" fill="#374151">${subjects[i].name}</text>`;
  }

  return `<svg viewBox="0 0 300 300" width="300" height="300" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}${axisLines}
    <polygon points="${studentPoints}" fill="${primaryColor}33" stroke="${primaryColor}" stroke-width="2"/>
    ${labels}
  </svg>`;
}

function trendArrow(trend: number): string {
  if (trend > 0) return `<span style="color:#16a34a">&#9650; +${trend}%</span>`;
  if (trend < 0) return `<span style="color:#dc2626">&#9660; ${trend}%</span>`;
  return `<span style="color:#6b7280">&#8212; 0%</span>`;
}

export function generateStandardProgressReport(
  data: ReportData,
  branding: Branding
): string {
  const primary = branding.primaryColor || "#2563eb";
  const secondary = branding.secondaryColor || "#1e40af";
  const institute = branding.instituteName || "PaperCraft Institute";
  const logo = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="Logo" style="max-height:60px;"/>`
    : "";

  const dateRangeStr = data.dateRange
    ? `${data.dateRange.startDate || "All time"} to ${data.dateRange.endDate || "Present"}`
    : "All time";

  const recentTests = data.testPerformance.slice(-10).reverse();
  const radarData = data.subjectBreakdown.map((s) => ({
    name: s.subjectName,
    value: s.averagePercentage,
    classAvg: s.classAvg,
  }));

  // Strengths and weaknesses
  const sorted = [...data.subjectBreakdown].sort(
    (a, b) => b.averagePercentage - a.averagePercentage
  );
  const strengths = sorted.slice(0, 2).map((s) => s.subjectName);
  const weaknesses = sorted.slice(-2).map((s) => s.subjectName);

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
  .cover h1 { font-size: 28px; color: ${primary}; margin-bottom: 8px; }
  .cover h2 { font-size: 20px; color: #6b7280; font-weight: normal; }
  .cover .meta { margin-top: 40px; color: #6b7280; font-size: 14px; }
  h3 { color: ${primary}; font-size: 16px; border-bottom: 2px solid ${primary}; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: ${primary}; color: white; padding: 8px; text-align: left; font-size: 11px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
  tr:nth-child(even) { background: #f9fafb; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
  .kpi-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
  .kpi-card .value { font-size: 24px; font-weight: bold; color: ${primary}; }
  .kpi-card .label { font-size: 11px; color: #6b7280; }
  .callout { background: #eff6ff; border-left: 4px solid ${primary}; padding: 8px 12px; margin: 8px 0; border-radius: 0 4px 4px 0; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9px; color: #9ca3af; padding: 8px; border-top: 1px solid #e5e7eb; }
  .radar-container { text-align: center; margin: 16px 0; }
  .best { background-color: #dcfce7 !important; }
  .worst { background-color: #fee2e2 !important; }
</style>
</head>
<body>
<!-- Page 1: Cover -->
<div class="page cover">
  ${logo}
  <h1>Progress Report</h1>
  <h2>${data.studentName}</h2>
  <div class="meta">
    ${data.yearGroup ? `<p>Year Group: ${data.yearGroup}</p>` : ""}
    ${data.school ? `<p>School: ${data.school}</p>` : ""}
    <p>Period: ${dateRangeStr}</p>
    <p>Generated: ${data.generatedDate}</p>
  </div>
</div>

<!-- Page 2: Performance Summary -->
<div class="page">
  <h3>Performance Summary</h3>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="value">${data.overallStats.averagePercentage}%</div>
      <div class="label">Average Score ${trendArrow(data.overallStats.improvementRate)}</div>
    </div>
    <div class="kpi-card">
      <div class="value">${data.overallStats.totalTestsTaken}</div>
      <div class="label">Tests Taken</div>
    </div>
    <div class="kpi-card">
      <div class="value">${data.overallStats.improvementRate}%</div>
      <div class="label">Improvement Rate</div>
    </div>
    <div class="kpi-card">
      <div class="value">${data.overallStats.bestPercentage}%</div>
      <div class="label">Best Score</div>
    </div>
    <div class="kpi-card">
      <div class="value">${data.overallStats.worstPercentage}%</div>
      <div class="label">Lowest Score</div>
    </div>
    <div class="kpi-card">
      <div class="value">${data.classRanking ? `${data.classRanking.rank} / ${data.classRanking.total}` : "N/A"}</div>
      <div class="label">Class Ranking</div>
    </div>
  </div>
  <div class="callout">
    <strong>Percentile:</strong> ${data.overallStats.percentileInClass}th in class, ${data.overallStats.percentileInOrg}th in organisation
  </div>
</div>

<!-- Page 3: Subject Breakdown -->
<div class="page">
  <h3>Subject Breakdown</h3>
  <div class="radar-container">
    ${svgRadarChart(radarData, primary)}
  </div>
  <table>
    <tr><th>Subject</th><th>Student Avg</th><th>Class Avg</th><th>Trend</th></tr>
    ${data.subjectBreakdown
      .map(
        (s) =>
          `<tr><td>${s.subjectName}</td><td>${s.averagePercentage}%</td><td>${s.classAvg != null ? s.classAvg + "%" : "N/A"}</td><td>${trendArrow(s.trend)}</td></tr>`
      )
      .join("")}
  </table>
  ${strengths.length > 0 ? `<div class="callout"><strong>Strengths:</strong> ${strengths.join(", ")}</div>` : ""}
  ${weaknesses.length > 0 ? `<div class="callout"><strong>Areas for improvement:</strong> ${weaknesses.join(", ")}</div>` : ""}
</div>

<!-- Page 4: Recent Test Results -->
<div class="page">
  <h3>Recent Test Results</h3>
  <table>
    <tr><th>Test Name</th><th>Date</th><th>Score</th><th>%</th><th>Rank</th><th>Class Avg</th></tr>
    ${recentTests
      .map((t) => {
        const best =
          t.percentage === data.overallStats.bestPercentage ? "best" : "";
        const worst =
          t.percentage === data.overallStats.worstPercentage ? "worst" : "";
        return `<tr class="${best || worst}"><td>${t.testTitle}</td><td>${t.completedAt}</td><td>${t.score}/${t.totalMarks}</td><td>${t.percentage}%</td><td>${t.rank ?? "N/A"}</td><td>${t.classAvg != null ? t.classAvg + "%" : "N/A"}</td></tr>`;
      })
      .join("")}
  </table>
</div>

${
  data.topicPerformance && data.topicPerformance.length > 0
    ? `<!-- Page 5: Topic Analysis -->
<div class="page">
  <h3>Topic Analysis</h3>
  <table>
    <tr><th>Topic</th><th>Accuracy</th><th>Questions</th></tr>
    ${data.topicPerformance
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 15)
      .map(
        (t) =>
          `<tr><td>${t.topicName}</td><td>${t.accuracy}%</td><td>${t.totalQuestions}</td></tr>`
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
