import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNotificationsService = vi.hoisted(() => ({
  listConfigs: vi.fn(),
  createConfig: vi.fn(),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  deleteConfig: vi.fn(),
  sendTestNotification: vi.fn(),
}));

vi.mock("../services/notifications.js", () => ({
  notificationsService: () => mockNotificationsService,
}));

vi.mock("../routes/authz.js", () => ({
  assertCompanyAccess: vi.fn(),
}));

async function createApp() {
  const { notificationsRoutes } = await import("../routes/notifications.js");
  const app = express();
  app.use(express.json());
  app.use(notificationsRoutes({} as any));
  return app;
}

describe("notificationsRoutes", () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe("GET /companies/:companyId/notifications/config", () => {
    it("returns notification configs", async () => {
      mockNotificationsService.listConfigs.mockResolvedValue([
        { id: "nc1", companyId: "c1", type: "telegram", enabled: true },
      ]);

      const res = await request(app).get("/companies/c1/notifications/config");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockNotificationsService.listConfigs).toHaveBeenCalledWith("c1");
    });
  });

  describe("POST /companies/:companyId/notifications/config", () => {
    it("creates a notification config", async () => {
      const newConfig = {
        id: "nc1",
        companyId: "c1",
        type: "telegram",
        targetUrl: "https://api.telegram.org/bot123/sendMessage",
        events: ["agent.run.failed"],
        enabled: true,
      };
      mockNotificationsService.createConfig.mockResolvedValue(newConfig);

      const res = await request(app)
        .post("/companies/c1/notifications/config")
        .send({
          type: "telegram",
          targetUrl: "https://api.telegram.org/bot123/sendMessage",
          events: ["agent.run.failed"],
          enabled: true,
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(newConfig);
      expect(mockNotificationsService.createConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: "c1",
          type: "telegram",
          targetUrl: "https://api.telegram.org/bot123/sendMessage",
          events: ["agent.run.failed"],
          enabled: true,
        })
      );
    });
  });

  describe("GET /companies/:companyId/notifications/config/:id", () => {
    it("returns a config by id", async () => {
      const config = { id: "nc1", companyId: "c1", type: "telegram" };
      mockNotificationsService.getConfig.mockResolvedValue(config);

      const res = await request(app).get("/companies/c1/notifications/config/nc1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(config);
    });

    it("returns 404 for missing config", async () => {
      mockNotificationsService.getConfig.mockResolvedValue(null);

      const res = await request(app).get("/companies/c1/notifications/config/missing");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Notification config not found");
    });
  });

  describe("PATCH /companies/:companyId/notifications/config/:id", () => {
    it("updates a config", async () => {
      const updated = { id: "nc1", companyId: "c1", enabled: false };
      mockNotificationsService.updateConfig.mockResolvedValue(updated);

      const res = await request(app)
        .patch("/companies/c1/notifications/config/nc1")
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
    });

    it("returns 404 for missing config", async () => {
      mockNotificationsService.updateConfig.mockResolvedValue(null);

      const res = await request(app)
        .patch("/companies/c1/notifications/config/missing")
        .send({ enabled: false });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /companies/:companyId/notifications/config/:id", () => {
    it("deletes a config", async () => {
      mockNotificationsService.deleteConfig.mockResolvedValue({ id: "nc1" });

      const res = await request(app).delete("/companies/c1/notifications/config/nc1");

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it("returns 404 for missing config", async () => {
      mockNotificationsService.deleteConfig.mockResolvedValue(null);

      const res = await request(app).delete("/companies/c1/notifications/config/missing");

      expect(res.status).toBe(404);
    });
  });

  describe("POST /companies/:companyId/notifications/config/:id/test", () => {
    it("sends a test notification", async () => {
      mockNotificationsService.sendTestNotification.mockResolvedValue({
        success: true,
        message: "Test sent",
      });

      const res = await request(app).post("/companies/c1/notifications/config/nc1/test");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockNotificationsService.sendTestNotification).toHaveBeenCalledWith("nc1", "c1");
    });
  });
});
