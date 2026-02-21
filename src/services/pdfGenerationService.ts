import fs from "fs";
import path from "path";
import puppeteer, { Browser } from "puppeteer";
import mongoose from "mongoose";
import { PaperModel, PaperDocument, PdfType } from "../models/paper";
import { PaperTemplateModel, PaperTemplateDocument } from "../models/paperTemplate";
import { uploadPdfToS3 } from "../utils/s3";

// ─── CSS (loaded once) ───────────────────────────────────────────────────────

const pdfStylesPath = path.join(__dirname, "..", "templates", "pdf-styles.css");
let cachedStyles = "";
function getPdfStyles(): string {
  if (!cachedStyles) {
    cachedStyles = fs.readFileSync(pdfStylesPath, "utf-8");
  }
  return cachedStyles;
}

// ─── Browser Pool ────────────────────────────────────────────────────────────

let browser: Browser | null = null;
let pdfCount = 0;
const MAX_PDFS_PER_BROWSER = 50;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected || pdfCount >= MAX_PDFS_PER_BROWSER) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    pdfCount = 0;
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
    browser = null;
  }
}

// ─── HTML Builders ───────────────────────────────────────────────────────────

interface BuildOptions {
  paper: PaperDocument;
  template: PaperTemplateDocument;
  companyBranding?: { logoUrl?: string; primaryColor?: string };
}

function cssVars(template: PaperTemplateDocument): string {
  const fmt = template.layout?.formatting;
  const vars = [
    `--font-family: ${fmt?.fontFamily || "Arial"}, sans-serif`,
    `--font-size: ${fmt?.fontSize || 12}pt`,
    `--line-spacing: ${fmt?.lineSpacing || 1.5}`,
    `--paper-size: ${fmt?.paperSize || "A4"}`,
    `--margin-top: ${fmt?.margins?.top ?? 20}mm`,
    `--margin-right: ${fmt?.margins?.right ?? 15}mm`,
    `--margin-bottom: ${fmt?.margins?.bottom ?? 20}mm`,
    `--margin-left: ${fmt?.margins?.left ?? 15}mm`,
  ];
  return `:root { ${vars.join("; ")} }`;
}

function buildHeader(template: PaperTemplateDocument, branding?: { logoUrl?: string }): string {
  const h = template.layout?.header;
  if (!h) return "";
  const logoHtml = h.showLogo && branding?.logoUrl
    ? `<img class="logo" src="${branding.logoUrl}" alt="Logo" />`
    : "";
  const fields = (h.studentInfoFields || ["Name", "Date"]).map(
    (f) => `<div class="field"><label>${f}:</label><span class="blank"></span></div>`
  ).join("");
  return `
    <div class="paper-header logo-${h.logoPosition || "left"}">
      ${logoHtml}
      <div class="header-text">
        <div class="title">${h.title || ""}</div>
        <div class="subtitle">${h.subtitle || ""}</div>
      </div>
    </div>
    <div class="student-info">${fields}</div>
  `;
}

function buildInstructions(template: PaperTemplateDocument): string {
  const inst = template.layout?.instructions;
  if (!inst?.show || !inst.text) return "";
  return `<div class="instructions"><h3>Instructions</h3><p>${inst.text}</p></div>`;
}

function buildFooter(template: PaperTemplateDocument): string {
  const f = template.layout?.footer;
  if (!f) return "";
  return `
    <div class="paper-footer">
      <span>${f.copyrightText || ""}</span>
      ${f.showPageNumbers ? '<span class="page-number"></span>' : ""}
    </div>
  `;
}

function renderQuestion(q: Record<string, unknown>, num: number, marks: number): string {
  const content = (q.content || {}) as Record<string, unknown>;
  const type = q.type as string;
  const text = (content.text || content.questionText || "") as string;
  let html = `<div class="question avoid-break">`;
  html += `<span class="question-number">Q${num}.</span>`;
  html += `<span class="question-marks">[${marks} mark${marks !== 1 ? "s" : ""}]</span>`;
  html += `<div class="question-text">${text}</div>`;

  if (type === "mcq" || type === "multiple_choice") {
    const options = (content.options || []) as Array<{ text?: string; label?: string }>;
    html += `<ul class="mcq-options">`;
    const letters = ["A", "B", "C", "D", "E", "F"];
    options.forEach((opt, i) => {
      html += `<li><span class="option-letter">${letters[i] || String(i + 1)}.</span>${opt.text || opt.label || ""}</li>`;
    });
    html += `</ul>`;
  } else if (type === "true_false") {
    html += `<ul class="mcq-options">
      <li><span class="option-letter">A.</span>True</li>
      <li><span class="option-letter">B.</span>False</li>
    </ul>`;
  } else if (type === "comprehension") {
    const passage = (content.passage || "") as string;
    if (passage) {
      html += `<div class="passage">${passage}</div>`;
    }
    const subQs = (content.subQuestions || []) as Array<Record<string, unknown>>;
    subQs.forEach((sub, i) => {
      html += `<div class="question-text">${String.fromCharCode(97 + i)}) ${(sub.text || "") as string}</div>`;
    });
  } else if (type === "match_the_column") {
    const colA = (content.columnA || []) as string[];
    const colB = (content.columnB || []) as string[];
    html += `<div class="match-columns">
      <div><div class="col-header">Column A</div>${colA.map((a, i) => `<div>${i + 1}. ${a}</div>`).join("")}</div>
      <div><div class="col-header">Column B</div>${colB.map((b, i) => `<div>${String.fromCharCode(97 + i)}. ${b}</div>`).join("")}</div>
    </div>`;
  }

  html += `</div>`;
  return html;
}

export function buildQuestionPaperHtml(opts: BuildOptions): string {
  const { paper, template, companyBranding } = opts;
  const styles = getPdfStyles();
  const sectionCfg = template.layout?.sections;
  const pageBreak = sectionCfg?.pageBreakBetweenSections ?? false;

  let sectionsHtml = "";
  paper.sections.forEach((section, si) => {
    if (si > 0 && pageBreak) sectionsHtml += '<div class="page-break"></div>';
    const numStyle = sectionCfg?.numberingStyle || "numeric";
    const sectionLabel = numStyle === "alpha"
      ? String.fromCharCode(65 + si)
      : numStyle === "roman"
        ? toRoman(si + 1)
        : String(si + 1);

    if (sectionCfg?.showSectionHeaders !== false) {
      sectionsHtml += `<div class="section-header">Section ${sectionLabel}: ${section.name}</div>`;
    }
    if (section.instructions) {
      sectionsHtml += `<div class="instructions"><p>${section.instructions}</p></div>`;
    }

    sectionsHtml += `<div class="section">`;
    for (const q of section.questions) {
      const qData = (q.questionId as unknown as Record<string, unknown>) ?? {};
      sectionsHtml += renderQuestion(qData, q.questionNumber, q.marks);
    }
    sectionsHtml += `</div>`;
  });

  return wrapHtml(styles, cssVars(template), [
    buildHeader(template, companyBranding),
    buildInstructions(template),
    sectionsHtml,
    buildFooter(template),
  ].join(""));
}

export function buildAnswerSheetHtml(opts: BuildOptions): string {
  const { paper, template, companyBranding } = opts;
  const styles = getPdfStyles();

  let sectionsHtml = "";
  paper.sections.forEach((section) => {
    sectionsHtml += `<div class="section-header">Section: ${section.name}</div><div class="section">`;
    for (const q of section.questions) {
      const qData = (q.questionId as unknown as Record<string, unknown>) ?? {};
      const type = (qData.type || "") as string;

      if (type === "mcq" || type === "multiple_choice" || type === "true_false") {
        const letters = type === "true_false" ? ["A", "B"] : ["A", "B", "C", "D"];
        sectionsHtml += `<div class="bubble-grid">
          <span class="q-num">${q.questionNumber}</span>
          ${letters.map((l) => `<div class="bubble">${l}</div>`).join("")}
        </div>`;
      } else if (type === "long_answer" || type === "essay") {
        sectionsHtml += `<div><strong>${q.questionNumber}.</strong></div>
          <div class="lined-box large">${Array(6).fill('<div class="line"></div>').join("")}</div>`;
      } else {
        sectionsHtml += `<div><strong>${q.questionNumber}.</strong></div>
          <div class="lined-box">${Array(3).fill('<div class="line"></div>').join("")}</div>`;
      }
    }
    sectionsHtml += `</div>`;
  });

  return wrapHtml(styles, cssVars(template), [
    buildHeader(template, companyBranding),
    '<h2 style="text-align: center; margin-bottom: 20px;">Answer Sheet</h2>',
    sectionsHtml,
    buildFooter(template),
  ].join(""));
}

export function buildSolutionPaperHtml(opts: BuildOptions): string {
  const { paper, template, companyBranding } = opts;
  const styles = getPdfStyles();

  let sectionsHtml = "";
  paper.sections.forEach((section) => {
    sectionsHtml += `<div class="section-header">Section: ${section.name}</div><div class="section">`;
    for (const q of section.questions) {
      const qData = (q.questionId as unknown as Record<string, unknown>) ?? {};
      const content = (qData.content || {}) as Record<string, unknown>;
      const text = ((content.text || content.questionText || "") as string).slice(0, 100);
      const answer = (content.correctAnswer || content.answer || "") as string;
      const explanation = (content.explanation || content.solution || "") as string;

      sectionsHtml += `<div class="solution-item">
        <div><strong>Q${q.questionNumber}.</strong> ${text}${text.length >= 100 ? "..." : ""}</div>
        <div class="correct-answer">Answer: ${answer}</div>
        ${explanation ? `<div class="explanation">${explanation}</div>` : ""}
        <div class="marking-notes">Marks: ${q.marks}</div>
      </div>`;
    }
    sectionsHtml += `</div>`;
  });

  return wrapHtml(styles, cssVars(template), [
    buildHeader(template, companyBranding),
    '<h2 style="text-align: center; margin-bottom: 20px;">Solution Paper</h2>',
    sectionsHtml,
    buildFooter(template),
  ].join(""));
}

export function applyWatermark(html: string, watermarkText: string): string {
  if (!watermarkText) return html;
  const overlay = `<div class="watermark-overlay">${watermarkText}</div>`;
  return html.replace("</body>", `${overlay}</body>`);
}

export function applyBranding(
  html: string,
  branding?: { logoUrl?: string; primaryColor?: string }
): string {
  if (!branding) return html;
  if (branding.primaryColor) {
    html = html.replace(
      "</style>",
      `\n.paper-header .title { color: ${branding.primaryColor}; }\n</style>`
    );
  }
  return html;
}

// ─── Puppeteer Rendering ─────────────────────────────────────────────────────

export async function renderHtmlToPdf(
  html: string,
  options?: { format?: "A4" | "Letter"; margin?: { top: string; right: string; bottom: string; left: string } }
): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: options?.format || "A4",
      printBackground: true,
      margin: options?.margin || { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    });
    pdfCount++;
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

// ─── Generate Paper PDFs (full pipeline) ─────────────────────────────────────

export async function generatePaperPdfs(paperId: string): Promise<Array<{ type: PdfType; s3Key: string; fileSize: number }>> {
  const paper = await PaperModel.findById(paperId)
    .populate("sections.questions.questionId");
  if (!paper) throw new Error(`Paper ${paperId} not found`);

  const template = await PaperTemplateModel.findById(paper.templateId);
  if (!template) throw new Error(`Template ${paper.templateId} not found`);

  const companyId = paper.companyId.toString();
  const timestamp = Date.now();
  const results: Array<{ type: PdfType; s3Key: string; fileSize: number; fileName: string }> = [];
  const buildOpts: BuildOptions = { paper, template };

  // 1. Question Paper
  let html = buildQuestionPaperHtml(buildOpts);
  if (template.layout?.footer?.showWatermark && template.layout?.footer?.watermarkText) {
    html = applyWatermark(html, template.layout.footer.watermarkText);
  }
  let pdfBuffer = await renderHtmlToPdf(html, {
    format: template.layout?.formatting?.paperSize as "A4" | "Letter" || "A4",
  });
  let s3Key = `papers/${companyId}/${paperId}/question_paper_${timestamp}.pdf`;
  await uploadPdfToS3(pdfBuffer, s3Key);
  results.push({ type: "question_paper", s3Key, fileSize: pdfBuffer.length, fileName: `${paper.title}_Question_Paper.pdf` });

  // 2. Answer Sheet
  html = buildAnswerSheetHtml(buildOpts);
  pdfBuffer = await renderHtmlToPdf(html);
  s3Key = `papers/${companyId}/${paperId}/answer_sheet_${timestamp}.pdf`;
  await uploadPdfToS3(pdfBuffer, s3Key);
  results.push({ type: "answer_sheet", s3Key, fileSize: pdfBuffer.length, fileName: `${paper.title}_Answer_Sheet.pdf` });

  // 3. Solution Paper
  html = buildSolutionPaperHtml(buildOpts);
  pdfBuffer = await renderHtmlToPdf(html);
  s3Key = `papers/${companyId}/${paperId}/solution_paper_${timestamp}.pdf`;
  await uploadPdfToS3(pdfBuffer, s3Key);
  results.push({ type: "solution_paper", s3Key, fileSize: pdfBuffer.length, fileName: `${paper.title}_Solution_Paper.pdf` });

  // Update paper with PDF metadata
  paper.pdfs = results.map((r) => ({
    type: r.type,
    fileName: r.fileName,
    s3Key: r.s3Key,
    fileSize: r.fileSize,
    generatedAt: new Date(),
  }));
  await paper.save();

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wrapHtml(styles: string, cssVarsStr: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${cssVarsStr}\n${styles}</style></head><body>${body}</body></html>`;
}

function toRoman(num: number): string {
  const romanNumerals: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  for (const [value, numeral] of romanNumerals) {
    while (num >= value) {
      result += numeral;
      num -= value;
    }
  }
  return result;
}
