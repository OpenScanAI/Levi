import { describe, expect, it, vi, beforeEach } from "vitest";
import { notificationsService } from "../services/notifications.js";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockWebhookSender = {
  sendTelegramMessage: vi.fn(),
  sendGenericWebhook: vi.fn(),
};

describe("notificationsService", () => {
  const svc = notificationsService(mockDb as any, mockWebhookSender as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createConfig", () => {
    it("creates a notification config", async () => {
      const config = {
        id: "nc1",
        companyId: "c1",
        type: "telegram",
        targetUrl: "token|chatId",
        events: ["agent.run.completed"],
        enabled: true,
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([config]),
        }),
      });

      const result = await svc.createConfig({
        companyId: "c1",
        type: "telegram",
        targetUrl: "token|chatId",
        events: ["agent.run.completed"],
      });

      expect(result).toEqual(config);
    });
  });

  describe("listConfigs", () => {
    it("returns all configs for a company", async () => {
      const configs = [
        { id: "nc1", companyId: "c1", enabled: true },
        { id: "nc2", companyId: "c1", enabled: false },
      ];

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(configs),
          }),
        }),
      });

      const result = await svc.listConfigs("c1");
      expect(result).toHaveLength(2);
    });
  });

  describe("updateConfig", () => {
    it("updates config fields", async () => {
      const updated = {
        id: "nc1",
        companyId: "c1",
        type: "telegram",
        targetUrl: "token|chatId",
        events: ["agent.run.completed"],
        enabled: false,
      };

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      });

      const result = await svc.updateConfig("c1", "nc1", { enabled: false });
      expect(result?.enabled).toBe(false);
    });
  });

  describe("deleteConfig", () => {
    it("removes a config", async () => {
      const deleted = { id: "nc1", companyId: "c1" };

      mockDb.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([deleted]),
        }),
      });

      const result = await svc.deleteConfig("c1", "nc1");
      expect(result).toEqual(deleted);
    });
  });

  describe("sendTestNotification", () => {
    it("sends Telegram test message", async () => {
      const config = {
        id: "nc1",
        companyId: "c1",
        type: "telegram",
        targetUrl: "botToken|chatId",
        events: ["agent.run.completed"],
        enabled: true,
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn().mockResolvedValue([config]),
          }),
        }),
      });

      const result = await svc.sendTestNotification("nc1", "c1");
      expect(result).toBeDefined();
    });
  });
});
