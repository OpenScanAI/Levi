import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  sendTelegramMessage,
  sendGenericWebhook,
  formatAgentRunMessage,
  formatDailyDigestMessage,
} from "../services/webhook-sender.js";

describe("webhook-sender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("formatAgentRunMessage", () => {
    it("formats agent run message with status emoji", () => {
      const message = formatAgentRunMessage({
        eventType: "agent.run.completed",
        agentName: "Test Agent",
        runId: "run-123",
        status: "succeeded",
        duration: "2m 30s",
        companyName: "Test Company",
      });

      expect(message).toContain("Test Agent");
      expect(message).toContain("2m 30s");
    });

    it("includes error snippet for failed runs", () => {
      const message = formatAgentRunMessage({
        eventType: "agent.run.failed",
        agentName: "Failing Agent",
        runId: "run-456",
        status: "failed",
        duration: "1m 15s",
        error: "Connection timeout",
        companyName: "Test Company",
      });

      expect(message).toContain("Connection timeout");
      expect(message).toContain("failed");
    });
  });

  describe("sendTelegramMessage", () => {
    it("returns error when token is missing", async () => {
      const result = await sendTelegramMessage({
        botToken: "",
        chatId: "123",
        text: "Hello",
      });

      expect(result.success).toBe(false);
    });

    it("returns error when chatId is missing", async () => {
      const result = await sendTelegramMessage({
        botToken: "token",
        chatId: "",
        text: "Hello",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("sendGenericWebhook", () => {
    it("returns error for invalid URL", async () => {
      const result = await sendGenericWebhook({
        url: "not-a-url",
        body: { test: true },
      });

      expect(result.success).toBe(false);
    });
  });
});
