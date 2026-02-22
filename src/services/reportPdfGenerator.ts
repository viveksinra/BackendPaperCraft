import puppeteer from "puppeteer";
import { uploadPdfToS3 } from "../utils/s3";
import { generateStandardProgressReport } from "./reportTemplates/standardProgressReport";
import { generateElevenPlusMockAnalysis } from "./reportTemplates/elevenPlusMockAnalysis";
import { generateClassSummaryReport } from "./reportTemplates/classSummaryReport";
import { logger } from "../shared/logger";

interface Branding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  instituteName?: string;
}

export async function generateReportPdf(
  reportData: Record<string, unknown>,
  templateId: string,
  branding: Branding,
  s3Key: string
): Promise<{ pdfUrl: string; pdfSize: number }> {
  let html: string;

  switch (templateId) {
    case "standard":
      html = generateStandardProgressReport(
        reportData as unknown as Parameters<typeof generateStandardProgressReport>[0],
        branding
      );
      break;
    case "eleven_plus":
      html = generateElevenPlusMockAnalysis(
        reportData as unknown as Parameters<typeof generateElevenPlusMockAnalysis>[0],
        branding
      );
      break;
    case "class_summary":
      html = generateClassSummaryReport(
        reportData as unknown as Parameters<typeof generateClassSummaryReport>[0],
        branding
      );
      break;
    default:
      html = generateStandardProgressReport(
        reportData as unknown as Parameters<typeof generateStandardProgressReport>[0],
        branding
      );
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "25mm",
        left: "15mm",
      },
    });

    const buffer = Buffer.from(pdfBuffer);
    const pdfSize = buffer.length;

    await uploadPdfToS3(buffer, s3Key, "application/pdf");

    logger.info({
      msg: "Report PDF generated and uploaded",
      s3Key,
      pdfSize,
    });

    return { pdfUrl: s3Key, pdfSize };
  } catch (err) {
    logger.error({
      msg: "Failed to generate report PDF",
      s3Key,
      error: (err as Error).message,
    });
    throw err;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
