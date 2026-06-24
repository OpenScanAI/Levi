import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { notificationConfigs } from "@paperclipai/db";
import type { NotificationEventType, NotificationType } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import {
  sendTelegramMessage,
  sendGenericWebhook,
  formatAgentRunMessage,
  formatDailyDigestMessage,
} from "./webhook-sender.js";

/**
 * Service for managing notification configurations and dispatching alerts.
 * Supports Telegram and generic webhook destinations.
 */
export function notificationsService(db: Db) {
  return {
    createConfig: async (input: {
      companyId: string;
      type: NotificationType;
      targetUrl: string;
      events: NotificationEventType[];
      enabled?: boolean;
    }) => {
      const [config] = await db
        .insert(notificationConfigs)
        .values({
          companyId: input.companyId,
          type: input.type,
          targetUrl: input.targetUrl,
          events: input.events,
          enabled: input.enabled ?? true,
          updatedAt: new Date(),
        })
        .returning();
      return config;
    },

    listConfigs: async (companyId: string) => {
      return db
        .select()
        .from(notificationConfigs)
        .where(eq(notificationConfigs.companyId, companyId))
        .orderBy(desc(notificationConfigs.createdAt));
    },

    getConfig: async (companyId: string, id: string) => {
      return db
        .select()
        .from(notificationConfigs)
        .where(and(eq(notificationConfigs.companyId, companyId), eq(notificationConfigs.id, id)))
        .then((rows) => rows[0] ?? null);
    },

    updateConfig: async (
      companyId: string,
      id: string,
      input: {
        type?: NotificationType;
        targetUrl?: string;
        events?: NotificationEventType[];
        enabled?: boolean;
      },
    ) => {
      const [updated] = await db
        .update(notificationConfigs)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(and(eq(notificationConfigs.companyId, companyId), eq(notificationConfigs.id, id)))
        .returning();
      return updated ?? null;
    },

    deleteConfig: async (companyId: string, id: string) => {
      const [deleted] = await db
        .delete(notificationConfigs)
        .where(and(eq(notificationConfigs.companyId, companyId), eq(notificationConfigs.id, id)))
        .returning();
      return deleted ?? null;
    },

    shouldNotifyForEvent: async (companyId: string, eventType: NotificationEventType) => {
      const configs = await db
        .select()
        .from(notificationConfigs)
        .where(
          and(
            eq(notificationConfigs.companyId, companyId),
            eq(notificationConfigs.enabled, true),
          ),
        );

      return configs.filter((config) => config.events.includes(eventType));
    },

    sendTestNotification: async (configId: string, companyId: string) => {
      const config = await db
        .select()
        .from(notificationConfigs)
        .where(and(eq(notificationConfigs.companyId, companyId), eq(notificationConfigs.id, configId)))
        .then((rows) => rows[0] ?? null);

      if (!config) {
        return { success: false, error: "Config not found" };
      }

      if (!config.enabled) {
        return { success: false, error: "Config is disabled" };
      }

      const testMessage = formatAgentRunMessage({
        eventType: "agent.run.completed",
        agentName: "Test Agent",
        runId: "test-run-123",
        status: "completed",
        duration: "2m 30s",
        companyName: "Test Company",
      });

      if (config.type === "telegram") {
        const [botToken, chatId] = config.targetUrl.split("|");
        if (!botToken || !chatId) {
          return { success: false, error: "Invalid Telegram config. Expected format: BOT_TOKEN|CHAT_ID" };
        }
        return sendTelegramMessage({ botToken, chatId, text: testMessage });
      }

      if (config.type === "webhook") {
        return sendGenericWebhook({
          url: config.targetUrl,
          body: {
            event: "test",
            message: "This is a test notification from Paperclip",
            timestamp: new Date().toISOString(),
          },
        });
      }

      return { success: false, error: `Unsupported notification type: ${config.type}` };
    },

    dispatchAgentRunEvent: async (
      companyId: string,
      eventType: NotificationEventType,
      data: {
        agentName: string;
        runId: string;
        status: string;
        duration?: string;
        error?: string;
        companyName: string;
      },
    ) => {
      const configs = await db
        .select()
        .from(notificationConfigs)
        .where(
          and(
            eq(notificationConfigs.companyId, companyId),
            eq(notificationConfigs.enabled, true),
          ),
        );

      const matchingConfigs = configs.filter((config) => config.events.includes(eventType));

      if (matchingConfigs.length === 0) {
        return { sent: 0, skipped: true };
      }

      const message = formatAgentRunMessage({
        eventType,
        ...data,
      });

      let sent = 0;
      const results = [];

      for (const config of matchingConfigs) {
        try {
          if (config.type === "telegram") {
            const [botToken, chatId] = config.targetUrl.split("|");
            if (botToken && chatId) {
              const result = await sendTelegramMessage({ botToken, chatId, text: message });
              results.push({ configId: config.id, ...result });
              if (result.success) sent++;
            }
          } else if (config.type === "webhook") {
            const result = await sendGenericWebhook({
              url: config.targetUrl,
              body: {
                event: eventType,
                ...data,
                timestamp: new Date().toISOString(),
              },
            });
            results.push({ configId: config.id, ...result });
            if (result.success) sent++;
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          logger.error({ msg: "Notification dispatch failed", error, configId: config.id });
          results.push({ configId: config.id, success: false, error });
        }
      }

      logger.info({ msg: "Agent run notifications dispatched", companyId, eventType, sent, total: matchingConfigs.length });
      return { sent, total: matchingConfigs.length, results };
    },

    dispatchDailyDigest: async (
      companyId: string,
      data: {
        companyName: string;
        date: string;
        totalRuns: number;
        succeededRuns: number;
        failedRuns: number;
        stuckRuns: number;
        findingsCount: number;
        topAgents: Array<{ name: string; runs: number }>;
      },
    ) => {
      const configs = await db
        .select()
        .from(notificationConfigs)
        .where(
          and(
            eq(notificationConfigs.companyId, companyId),
            eq(notificationConfigs.enabled, true),
          ),
        );

      const matchingConfigs = configs.filter((config) =>
        config.events.includes("daily_digest" as NotificationEventType),
      );

      if (matchingConfigs.length === 0) {
        return { sent: 0, skipped: true };
      }

      const message = formatDailyDigestMessage(data);

      let sent = 0;
      const results = [];

      for (const config of matchingConfigs) {
        try {
          if (config.type === "telegram") {
            const [botToken, chatId] = config.targetUrl.split("|");
            if (botToken && chatId) {
              const result = await sendTelegramMessage({ botToken, chatId, text: message });
              results.push({ configId: config.id, ...result });
              if (result.success) sent++;
            }
          } else if (config.type === "webhook") {
            const result = await sendGenericWebhook({
              url: config.targetUrl,
              body: {
                event: "daily_digest",
                ...data,
                timestamp: new Date().toISOString(),
              },
            });
            results.push({ configId: config.id, ...result });
            if (result.success) sent++;
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          logger.error({ msg: "Daily digest dispatch failed", error, configId: config.id });
          results.push({ configId: config.id, success: false, error });
        }
      }

      logger.info({ msg: "Daily digest dispatched", companyId, sent, total: matchingConfigs.length });
      return { sent, total: matchingConfigs.length, results };
    },
  };
}
