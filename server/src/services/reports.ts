import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentReports, assets } from "@paperclipai/db";
import type { ReportType } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import { generatePdf } from "./pdf-generator.js";
import { eodReportTemplate, importSummaryTemplate } from "../templates/reports.js";
import type { StorageService } from "../storage/types.js";

/**
 * Filters for querying agent reports.
 */
export interface ReportsFilters {
  companyId: string;
  type?: ReportType;
  limit?: number;
  offset?: number;
}

const DEFAULT_REPORTS_LIMIT = 50;
const MAX_REPORTS_LIMIT = 200;

/**
 * Clamp reports query limit to valid range.
 */
export function normalizeReportsLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return DEFAULT_REPORTS_LIMIT;
  return Math.max(1, Math.min(MAX_REPORTS_LIMIT, Math.floor(limit ?? DEFAULT_REPORTS_LIMIT)));
}

/**
 * Service for managing agent reports and PDF generation.
 * Supports EOD reports, import summaries, and custom report types.
 */
export function reportsService(db: Db, storageService: StorageService) {
  return {
    create: async (input: {
      companyId: string;
      type: ReportType;
      title: string;
      contentJson?: Record<string, unknown> | null;
      pdfUrl?: string | null;
      logoAssetId?: string | null;
      generatedBy?: string | null;
      actorId?: string;
    }) => {
      const [report] = await db
        .insert(agentReports)
        .values({
          companyId: input.companyId,
          type: input.type,
          title: input.title,
          contentJson: input.contentJson ?? null,
          pdfUrl: input.pdfUrl ?? null,
          logoAssetId: input.logoAssetId ?? null,
          generatedBy: input.generatedBy ?? null,
          generatedAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      try {
        await logActivity(db, {
          companyId: input.companyId,
          actorType: "system",
          actorId: input.actorId ?? "system",
          action: "report_generated",
          entityType: "report",
          entityId: report.id,
          details: { type: input.type, title: input.title },
        });
      } catch (err) {
        logger.warn({ msg: "Failed to log report activity", error: String(err) });
      }

      return report;
    },

    generateEodPdf: async (input: {
      companyId: string;
      companyName: string;
      logoAssetId?: string | null;
      date: string;
      totalRuns: number;
      succeededRuns: number;
      failedRuns: number;
      stuckRuns: number;
      findingsSummary: Array<{ severity: string; count: number; verified: number }>;
      topAgents: Array<{ name: string; runs: number; successRate: number }>;
      generatedBy: string;
    }) => {
      let logoUrl: string | null = null;
      if (input.logoAssetId) {
        const asset = await db
          .select()
          .from(assets)
          .where(eq(assets.id, input.logoAssetId))
          .then((rows) => rows[0] ?? null);
        if (asset) {
          logoUrl = await storageService.getObject(input.companyId, asset.objectKey).then(
            (res) => {
              const chunks: Buffer[] = [];
              return new Promise<string>((resolve, reject) => {
                res.stream.on("data", (chunk: Buffer) => chunks.push(chunk));
                res.stream.on("end", () => {
                  const buffer = Buffer.concat(chunks);
                  resolve(`data:${res.contentType ?? "image/png"};base64,${buffer.toString("base64")}`);
                });
                res.stream.on("error", reject);
              });
            }
          );
        }
      }

      const html = eodReportTemplate({
        companyName: input.companyName,
        logoUrl,
        date: input.date,
        totalRuns: input.totalRuns,
        succeededRuns: input.succeededRuns,
        failedRuns: input.failedRuns,
        stuckRuns: input.stuckRuns,
        findingsSummary: input.findingsSummary,
        topAgents: input.topAgents,
        generatedBy: input.generatedBy,
        generatedAt: new Date().toISOString(),
      });

      const { buffer, pageCount } = await generatePdf({ html, logoUrl });

      const putResult = await storageService.putFile({
        companyId: input.companyId,
        namespace: "reports",
        originalFilename: `eod-report-${input.date}.pdf`,
        contentType: "application/pdf",
        body: buffer,
      });

      logger.info({
        msg: "EOD PDF generated",
        companyId: input.companyId,
        pages: pageCount,
        size: buffer.length,
      });

      return {
        pdfUrl: putResult.objectKey,
        pageCount,
        byteSize: buffer.length,
      };
    },

    generateImportSummaryPdf: async (input: {
      companyId: string;
      companyName: string;
      logoAssetId?: string | null;
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
    }) => {
      let logoUrl: string | null = null;
      if (input.logoAssetId) {
        const asset = await db
          .select()
          .from(assets)
          .where(eq(assets.id, input.logoAssetId))
          .then((rows) => rows[0] ?? null);
        if (asset) {
          logoUrl = await storageService.getObject(input.companyId, asset.objectKey).then(
            (res) => {
              const chunks: Buffer[] = [];
              return new Promise<string>((resolve, reject) => {
                res.stream.on("data", (chunk: Buffer) => chunks.push(chunk));
                res.stream.on("end", () => {
                  const buffer = Buffer.concat(chunks);
                  resolve(`data:${res.contentType ?? "image/png"};base64,${buffer.toString("base64")}`);
                });
                res.stream.on("error", reject);
              });
            }
          );
        }
      }

      const html = importSummaryTemplate({
        companyName: input.companyName,
        logoUrl,
        date: input.date,
        importedAgents: input.importedAgents,
        totalImported: input.totalImported,
        successfulImports: input.successfulImports,
        failedImports: input.failedImports,
        generatedBy: input.generatedBy,
        generatedAt: new Date().toISOString(),
      });

      const { buffer, pageCount } = await generatePdf({ html, logoUrl });

      const putResult = await storageService.putFile({
        companyId: input.companyId,
        namespace: "reports",
        originalFilename: `import-summary-${input.date}.pdf`,
        contentType: "application/pdf",
        body: buffer,
      });

      logger.info({
        msg: "Import summary PDF generated",
        companyId: input.companyId,
        pages: pageCount,
        size: buffer.length,
      });

      return {
        pdfUrl: putResult.objectKey,
        pageCount,
        byteSize: buffer.length,
      };
    },

    list: async (filters: ReportsFilters) => {
      const limit = normalizeReportsLimit(filters.limit);
      const offset = Math.max(0, filters.offset ?? 0);

      const conditions = [eq(agentReports.companyId, filters.companyId)];
      if (filters.type) conditions.push(eq(agentReports.type, filters.type));

      const rows = await db
        .select({
          id: agentReports.id,
          companyId: agentReports.companyId,
          type: agentReports.type,
          title: agentReports.title,
          pdfUrl: agentReports.pdfUrl,
          logoAssetId: agentReports.logoAssetId,
          generatedBy: agentReports.generatedBy,
          generatedAt: agentReports.generatedAt,
          createdAt: agentReports.createdAt,
          updatedAt: agentReports.updatedAt,
        })
        .from(agentReports)
        .where(and(...conditions))
        .orderBy(desc(agentReports.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(agentReports)
        .where(and(...conditions));

      return {
        reports: rows,
        total: Number(count),
        limit,
        offset,
      };
    },

    getById: async (companyId: string, id: string) => {
      const row = await db
        .select()
        .from(agentReports)
        .where(and(eq(agentReports.companyId, companyId), eq(agentReports.id, id)))
        .then((rows) => rows[0] ?? null);
      return row;
    },

    delete: async (companyId: string, id: string) => {
      const [deleted] = await db
        .delete(agentReports)
        .where(and(eq(agentReports.companyId, companyId), eq(agentReports.id, id)))
        .returning();
      return deleted ?? null;
    },

    updatePdfUrl: async (companyId: string, id: string, pdfUrl: string) => {
      const [updated] = await db
        .update(agentReports)
        .set({ pdfUrl, updatedAt: new Date() })
        .where(and(eq(agentReports.companyId, companyId), eq(agentReports.id, id)))
        .returning();
      return updated ?? null;
    },
  };
}
