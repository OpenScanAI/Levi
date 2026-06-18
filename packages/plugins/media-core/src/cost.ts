import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { CostReport } from "./types.js";

export class MediaCostTracker {
  private ctx: PluginContext;

  constructor(ctx: PluginContext) {
    this.ctx = ctx;
  }

  async reportCost(report: CostReport): Promise<void> {
    // Report cost to Levi's metrics system
    // metrics.write takes (name, value, tags?) — 2-3 arguments

    await this.ctx.metrics.write(
      "media_generation_cost",
      report.costCents,
      {
        company_id: report.companyId,
        agent_id: report.agentId || "unknown",
        task_id: report.taskId || "unknown",
        provider: report.provider,
        model: report.model,
      }
    );

    // Log activity for audit trail
    // activity.log takes PluginActivityLogEntry with companyId, message, entityType, entityId, metadata
    await this.ctx.activity.log({
      companyId: report.companyId,
      message: `Media generated via ${report.provider} (${report.model}) — cost: ${report.costCents} cents`,
      entityType: "media_asset",
      entityId: report.taskId || "unknown",
      metadata: {
        provider: report.provider,
        model: report.model,
        cost_cents: report.costCents,
        input_tokens: report.inputTokens,
        output_tokens: report.outputTokens,
        ...report.metadata,
      },
    });

    this.ctx.logger.info("Media cost reported", {
      companyId: report.companyId,
      costCents: report.costCents,
      provider: report.provider,
    });
  }

  async getTotalCost(companyId: string, dateFrom?: string, dateTo?: string): Promise<number> {
    // Plugin state doesn't support aggregation queries
    // This would need to be implemented with proper database access or API
    this.ctx.logger.warn("Cost aggregation not yet implemented with plugin state");
    return 0;
  }
}
