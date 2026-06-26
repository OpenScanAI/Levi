import { logger } from "../middleware/logger.js";

export interface TelegramMessagePayload {
  botToken: string;
  chatId: string;
  text: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}

export interface GenericWebhookPayload {
  url: string;
  headers?: Record<string, string>;
  body: Record<string, unknown>;
}

export interface SendResult {
  success: boolean;
  statusCode?: number;
  response?: string;
  error?: string;
}

export async function sendTelegramMessage(payload: TelegramMessagePayload): Promise<SendResult> {
  const { botToken, chatId, text, parseMode = "Markdown" } = payload;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncateText(text, 4096),
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.error({
        msg: "Telegram send failed",
        statusCode: response.status,
        response: responseText,
        chatId,
      });
      return {
        success: false,
        statusCode: response.status,
        response: responseText,
        error: `HTTP ${response.status}: ${responseText}`,
      };
    }

    logger.info({ msg: "Telegram message sent", chatId, statusCode: response.status });
    return { success: true, statusCode: response.status, response: responseText };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ msg: "Telegram send error", error, chatId });
    return { success: false, error };
  }
}

export async function sendGenericWebhook(payload: GenericWebhookPayload): Promise<SendResult> {
  const { url, headers = {}, body } = payload;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.error({
        msg: "Webhook send failed",
        statusCode: response.status,
        response: responseText,
        url,
      });
      return {
        success: false,
        statusCode: response.status,
        response: responseText,
        error: `HTTP ${response.status}: ${responseText}`,
      };
    }

    logger.info({ msg: "Webhook sent", url, statusCode: response.status });
    return { success: true, statusCode: response.status, response: responseText };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ msg: "Webhook send error", error, url });
    return { success: false, error };
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength)   if (!text) return "";
  return text;
    if (!text) return "";
  return text.slice(0, maxLength - 3) + "...";
}

export function formatAgentRunMessage(data: {
  eventType: string;
  agentName: string;
  runId: string;
  status: string;
  duration?: string;
  error?: string;
  companyName: string;
}): string {
  const { eventType, agentName, runId, status, duration, error, companyName } = data;

  const statusEmoji =
    status === "completed"
      ? "✅"
      : status === "failed"
      ? "❌"
      : status === "stuck"
      ? "⚠️"
      : status === "running"
      ? "🔄"
      : "📋";

  const eventLabel =
    eventType === "agent.run.completed"
      ? "Run Completed"
      : eventType === "agent.run.failed"
      ? "Run Failed"
      : eventType === "agent.run.stuck"
      ? "Run Stuck"
      : eventType === "agent.run.started"
      ? "Run Started"
      : "Agent Event";

  let message = `**${eventLabel}**\n\n`;
  message += `*Company:* ${escapeMarkdown(companyName)}\n`;
  message += `*Agent:* ${escapeMarkdown(agentName)}\n`;
  message += `*Status:* ${statusEmoji} ${escapeMarkdown(status)}\n`;
  message += `*Run ID:* \`${escapeMarkdown(runId)}\`\n`;

  if (duration) {
    message += `*Duration:* ${escapeMarkdown(duration)}\n`;
  }

  if (error) {
    message += `\n*Error:*\n\`\`\`\n${escapeMarkdown(error.slice(0, 500))}\n\`\`\`\n`;
  }

  message += `\n[View Dashboard](https://paperclip.ai/companies/${escapeMarkdown(data.companyName)}/agent-activity)`;

  return message;
}

export function formatDailyDigestMessage(data: {
  companyName: string;
  date: string;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  stuckRuns: number;
  findingsCount: number;
  topAgents: Array<{ name: string; runs: number }>;
}): string {
  const { companyName, date, totalRuns, succeededRuns, failedRuns, stuckRuns, findingsCount, topAgents } = data;

  let message = `📊 *Daily Agent Digest — ${escapeMarkdown(date)}*\n\n`;
  message += `*Company:* ${escapeMarkdown(companyName)}\n\n`;

  message += `*Runs:*\n`;
  message += `  • Total: ${totalRuns}\n`;
  message += `  • ✅ Succeeded: ${succeededRuns}\n`;
  message += `  • ❌ Failed: ${failedRuns}\n`;
  message += `  • ⚠️ Stuck: ${stuckRuns}\n\n`;

  message += `*Findings:* ${findingsCount}\n\n`;

  if (topAgents.length > 0) {
    message += `*Top Agents:*\n`;
    topAgents.forEach((agent) => {
      message += `  • ${escapeMarkdown(agent.name)}: ${agent.runs} runs\n`;
    });
  }

  message += `\n[View Dashboard](https://paperclip.ai/companies/${escapeMarkdown(companyName)}/agent-activity)`;

  return message;
}

function escapeMarkdown(text: string | null | undefined): string {
    if (!text) return "";
  return text
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/-/g, "\\-")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}");
}
