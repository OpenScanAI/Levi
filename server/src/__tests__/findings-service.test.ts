import { describe, expect, it, vi, beforeEach } from "vitest";
import { findingsService } from "../services/findings.js";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: vi.fn(),
}));

describe("findingsService", () => {
  const svc = findingsService(mockDb as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("creates a finding and returns it", async () => {
      const newFinding = {
        id: "f1",
        companyId: "c1",
        agentId: "a1",
        severity: "high",
        category: "security",
        title: "Test Finding",
        description: "Test description",
        verified: false,
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newFinding]),
        }),
      });

      const result = await svc.create({
        companyId: "c1",
        agentId: "a1",
        severity: "high",
        category: "security",
        title: "Test Finding",
        description: "Test description",
      });

      expect(result).toEqual(newFinding);
    });
  });

  describe("verify", () => {
    it("sets verified to true", async () => {
      const updatedFinding = {
        id: "f1",
        companyId: "c1",
        verified: true,
        verifiedBy: "user1",
        verifiedAt: new Date(),
      };

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedFinding]),
          }),
        }),
      });

      const result = await svc.verify("c1", "f1", "user1");
      expect(result.verified).toBe(true);
    });
  });

  describe("delete", () => {
    it("removes a finding and returns it", async () => {
      const finding = {
        id: "f1",
        companyId: "c1",
        agentId: "a1",
      };

      mockDb.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([finding]),
        }),
      });

      const result = await svc.delete("c1", "f1");
      expect(result).toEqual(finding);
    });
  });
});
