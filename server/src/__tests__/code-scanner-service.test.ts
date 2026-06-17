import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb, executionWorkspaces, companies, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { codeScannerService } from "../services/code-scanner.ts";
import { eq } from "drizzle-orm";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres code scanner tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("code scanner service", () => {
  let db: ReturnType<typeof createDb>;
  let cleanupDb: () => Promise<void>;
  let scanner: ReturnType<typeof codeScannerService>;
  let companyId: string;

  beforeAll(async () => {
    const { connectionString, cleanup } = await startEmbeddedPostgresTestDatabase("code-scanner-test");
    db = createDb(connectionString);
    cleanupDb = cleanup;
    scanner = codeScannerService(db);

    // Create a test company
    companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Test Company",
    });
  });

  afterEach(async () => {
    // Clean up issues and workspaces between tests
    await db.delete(issues);
    await db.delete(executionWorkspaces);
  });

  afterAll(async () => {
    await cleanupDb();
  });

  it("should return empty results when no workspaces exist", async () => {
    const results = await scanner.runScan();
    expect(results).toEqual([]);
  });

  it("should start and stop without errors", () => {
    expect(() => scanner.start()).not.toThrow();
    expect(() => scanner.stop()).not.toThrow();
  });

  it("should update config", () => {
    scanner.updateConfig({ enabled: false });
    const config = scanner.getConfig();
    expect(config.enabled).toBe(false);
  });
});
