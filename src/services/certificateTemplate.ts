// ─── Certificate HTML Template ─────────────────────────────────────────────

export function generateCertificateHtml(data: {
  studentName: string;
  courseName: string;
  teacherName: string;
  instituteName: string;
  completionDate: Date;
  totalLessons: number;
  totalDurationMinutes: number;
  certificateNumber: string;
}): string {
  const formattedDate = data.completionDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hours = Math.floor(data.totalDurationMinutes / 60);
  const mins = data.totalDurationMinutes % 60;
  const durationText = hours > 0
    ? `${hours} hour${hours > 1 ? "s" : ""}${mins > 0 ? ` ${mins} min` : ""}`
    : `${mins} minutes`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 297mm;
      height: 210mm;
      font-family: 'Georgia', 'Times New Roman', serif;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .certificate {
      width: 277mm;
      height: 190mm;
      border: 3px solid #1a365d;
      padding: 20mm;
      position: relative;
      background: linear-gradient(135deg, #fefefe 0%, #f7fafc 100%);
    }
    .certificate::before {
      content: '';
      position: absolute;
      top: 5mm;
      left: 5mm;
      right: 5mm;
      bottom: 5mm;
      border: 1px solid #bee3f8;
      pointer-events: none;
    }
    .header {
      text-align: center;
      margin-bottom: 8mm;
    }
    .institute-name {
      font-size: 14pt;
      color: #2d3748;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .title {
      font-size: 32pt;
      color: #1a365d;
      margin: 6mm 0 3mm;
      letter-spacing: 3px;
    }
    .subtitle {
      font-size: 12pt;
      color: #718096;
      letter-spacing: 1px;
    }
    .recipient {
      text-align: center;
      margin: 8mm 0;
    }
    .presented-to {
      font-size: 11pt;
      color: #718096;
      margin-bottom: 3mm;
    }
    .student-name {
      font-size: 26pt;
      color: #2d3748;
      border-bottom: 2px solid #1a365d;
      display: inline-block;
      padding: 0 10mm 2mm;
    }
    .details {
      text-align: center;
      margin: 6mm 0;
    }
    .course-name {
      font-size: 16pt;
      color: #1a365d;
      font-weight: bold;
      margin: 3mm 0;
    }
    .course-info {
      font-size: 10pt;
      color: #718096;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 10mm;
    }
    .footer-item {
      text-align: center;
    }
    .footer-label {
      font-size: 8pt;
      color: #a0aec0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .footer-value {
      font-size: 10pt;
      color: #2d3748;
      margin-top: 1mm;
    }
    .cert-number {
      font-size: 8pt;
      color: #a0aec0;
      position: absolute;
      bottom: 8mm;
      right: 25mm;
    }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="header">
      <div class="institute-name">${escapeHtml(data.instituteName)}</div>
      <div class="title">Certificate of Completion</div>
      <div class="subtitle">This is to certify that</div>
    </div>
    <div class="recipient">
      <div class="student-name">${escapeHtml(data.studentName)}</div>
    </div>
    <div class="details">
      <div class="presented-to">has successfully completed the course</div>
      <div class="course-name">${escapeHtml(data.courseName)}</div>
      <div class="course-info">${data.totalLessons} lessons &bull; ${durationText}</div>
    </div>
    <div class="footer">
      <div class="footer-item">
        <div class="footer-value">${formattedDate}</div>
        <div class="footer-label">Date of Completion</div>
      </div>
      <div class="footer-item">
        <div class="footer-value">${escapeHtml(data.teacherName)}</div>
        <div class="footer-label">Instructor</div>
      </div>
    </div>
    <div class="cert-number">Certificate No: ${escapeHtml(data.certificateNumber)}</div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
