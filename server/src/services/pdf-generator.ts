import puppeteer, { type Browser } from "puppeteer-core";
import { logger } from "../middleware/logger.js";

export interface PdfGenerationInput {
  html: string;
  headerHtml?: string;
  footerHtml?: string;
  logoUrl?: string | null;
  companyName?: string;
  title?: string;
}

export interface PdfGenerationResult {
  buffer: Buffer;
  pageCount: number;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance) return browserInstance;

  const launchOptions: import("puppeteer-core").LaunchOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  };

  // Try to find system Chrome/Chromium
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean) as string[];

  for (const executablePath of possiblePaths) {
    try {
      browserInstance = await puppeteer.launch({
        ...launchOptions,
        executablePath,
      });
      logger.info({ msg: "PDF browser launched", executablePath });
      return browserInstance;
    } catch {
      continue;
    }
  }

  // Fallback: try without specifying executablePath (uses bundled Chromium if available)
  try {
    browserInstance = await puppeteer.launch({ ...launchOptions });
    logger.info({ msg: "PDF browser launched with default executable" });
    return browserInstance;
  } catch (err) {
    logger.error({ msg: "Failed to launch browser for PDF generation", error: String(err) });
    throw new Error(
      "No Chrome/Chromium found for PDF generation. Install Chrome or set PUPPETEER_EXECUTABLE_PATH."
    );
  }
}

export async function generatePdf(input: PdfGenerationInput): Promise<PdfGenerationResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1200, height: 800 });

    // Inject the HTML content
    await page.setContent(input.html, { waitUntil: "domcontentloaded" });

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: input.headerHtml ? "80px" : "40px",
        bottom: input.footerHtml ? "60px" : "40px",
        left: "40px",
        right: "40px",
      },
      displayHeaderFooter: !!(input.headerHtml || input.footerHtml),
      headerTemplate: input.headerHtml ?? "<div></div>",
      footerTemplate:
        input.footerHtml ??
        `<div style="font-size: 10px; width: 100%; text-align: center; color: #666; padding: 0 40px;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
    });

    // Get page count by evaluating in browser context
    const pageCount = await page.evaluate(() => {
      // Approximate page count from scroll height / page height
      const bodyHeight = document.body.scrollHeight;
      const pageHeight = 1122; // A4 height in pixels at 96 DPI
      return Math.ceil(bodyHeight / pageHeight);
    });

    return {
      buffer: Buffer.from(pdfBuffer),
      pageCount: Math.max(1, pageCount),
    };
  } finally {
    await page.close();
  }
}

export async function closePdfBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// Cleanup on process exit
process.on("exit", () => closePdfBrowser());
process.on("SIGINT", () => {
  closePdfBrowser().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  closePdfBrowser().then(() => process.exit(0));
});
