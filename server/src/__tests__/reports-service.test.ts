import { describe, expect, it, vi, beforeEach } from "vitest";
import { reportsService } from "../services/reports.js";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockStorage = {
  upload: vi.fn(),
  getSignedUrl: vi.fn(),
};

vi.mock("../services/pdf-generator.js", () => ({
  generatePdf: vi.fn().mockResolvedValue(Buffer.from("PDF")),
}));

describe("reportsService", () => {
  const svc = reportsService(mockDb as any, mockStorage as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("creates a report", async () => {
      const report = {
        id: "r1",
        companyId: "c1",
        type: "eod",
        title: "EOD Report",
        content: { summary: "test" },
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([report]),
        }),
      });

      const result = await svc.create({
        companyId: "c1",
        type: "eod",
        title: "EOD Report",
        contentJson: { summary: "test" },
      });

      expect(result).toEqual(report);
    });
  });

  describe("list", () => {
    it("returns paginated reports", async () => {
      const reports = [
        { id: "r1", companyId: "c1", type: "eod" },
        { id: "r2", companyId: "c1", type: "summary" },
      ];

      const chainable = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(reports),
      };
      mockDb.select.mockReturnValue(chainable);

      const result = await svc.list("c1");
      expect(result).toHaveLength(2);
    });
  });

  describe("getById", () => {
    it("returns a report by id", async () => {
      const report = { id: "r1", companyId: "c1", type: "eod" };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn().mockResolvedValue([report]),
          }),
        }),
      });

      const result = await svc.getById("c1", "r1");
      expect(result).toEqual(report);
    });
  });

  describe("delete", () => {
    it("removes a report", async () => {
      const report = { id: "r1", companyId: "c1" };

      mockDb.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([report]),
        }),
      });

      const result = await svc.delete("c1", "r1");
      expect(result).toEqual(report);
    });
  });
});
