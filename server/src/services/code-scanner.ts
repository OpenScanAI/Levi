/**
 * CodeScannerService — automated codebase scanning for errors and issues.
 *
 * Scans project workspaces every 15 minutes for:
 * - TypeScript/JavaScript compilation errors
 * - Python lint errors
 * - Build failures
 * - Security vulnerabilities
 * - Outdated dependencies
 *
 * On detection, auto-creates Levi issues with appropriate labels and severity.
 *
 * @see doc/plans/2026-06-17-auto-scanner.md
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import type { Db } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";
import { executionWorkspaces, issues } from "@paperclipai/db";
import { issueService } from "./issues.js";
import { heartbeatService } from "./heartbeat.js";
import { queueIssueAssignmentWakeup } from "./issue-assignment-wakeup.js";
import { logger } from "../middleware/logger.js";
import { parseCron, nextCronTickFromExpression } from "./cron.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanResult {
  id: string;
  workspaceId: string;
  companyId: string;
  scanType: ScanType;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  errorCode?: string;
  rawOutput: string;
  scannedAt: Date;
}

export type ScanType =
  | "typescript_error"
  | "python_lint"
  | "build_failure"
  | "security_vulnerability"
  | "outdated_dependency";

interface ScannerConfig {
  enabled: boolean;
  intervalMinutes: number;
  scanTypes: ScanType[];
  autoCreateIssues: boolean;
  autoAssignAgentId: string | null;
  notificationWebhook: string | null;
}

export interface ScannerState {
  lastScanAt: Date | null;
  results: ScanResult[];
  isRunning: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ScannerConfig = {
  enabled: true,
  intervalMinutes: 15,
  scanTypes: [
    "typescript_error",
    "python_lint",
    "build_failure",
    "security_vulnerability",
    "outdated_dependency",
  ],
  autoCreateIssues: true,
  autoAssignAgentId: null,
  notificationWebhook: null,
};

const SCANNER_CRON_EXPRESSION = "*/15 * * * *"; // Every 15 minutes

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function codeScannerService(db: Db) {
  const issuesSvc = issueService(db);
  const heartbeat = heartbeatService(db);
  const log = logger.child({ service: "code-scanner" });

  let state: ScannerState = {
    lastScanAt: null,
    results: [],
    isRunning: false,
    error: null,
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  let config: ScannerConfig = { ...DEFAULT_CONFIG };

  // -----------------------------------------------------------------------
  // Workspace detection
  // -----------------------------------------------------------------------

  async function detectWorkspaceType(workspacePath: string): Promise<"typescript" | "python" | "mixed" | "unknown"> {
    try {
      const files = await fs.readdir(workspacePath);
      const hasPackageJson = files.includes("package.json");
      const hasTsConfig = files.includes("tsconfig.json") || files.some((f) => f.endsWith(".ts"));
      const hasPython = files.includes("requirements.txt") || files.includes("pyproject.toml") || files.some((f) => f.endsWith(".py"));

      if (hasPackageJson && hasPython) return "mixed";
      if (hasPackageJson || hasTsConfig) return "typescript";
      if (hasPython) return "python";
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  // -----------------------------------------------------------------------
  // Scan implementations
  // -----------------------------------------------------------------------

  async function scanTypeScript(workspacePath: string, companyId: string, workspaceId: string): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    // Check for tsc errors
    try {
      const tsConfigPath = path.join(workspacePath, "tsconfig.json");
      await fs.access(tsConfigPath);

      try {
        await execFileAsync("npx", ["tsc", "--noEmit", "--pretty", "false"], {
          cwd: workspacePath,
          timeout: 120_000,
        });
      } catch (error: any) {
        const stdout = error.stdout || "";
        const lines = stdout.split("\n").filter((line: string) => line.includes("error TS"));

        for (const line of lines.slice(0, 20)) { // Limit to first 20 errors
          const match = line.match(/(.+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)/);
          if (match) {
            results.push({
              id: randomUUID(),
              workspaceId,
              companyId,
              scanType: "typescript_error",
              severity: "high",
              title: `TypeScript Error: ${match[5]}`,
              description: `TypeScript compilation error in ${match[1]}:\n${match[5]}`,
              filePath: match[1],
              lineNumber: parseInt(match[2], 10),
              errorCode: match[4],
              rawOutput: line,
              scannedAt: new Date(),
            });
          }
        }
      }
    } catch {
      // No tsconfig.json, skip
    }

    // Check for ESLint errors
    try {
      const eslintConfigFiles = [".eslintrc.js", ".eslintrc.json", ".eslintrc", "eslint.config.js"];
      const hasEslintConfig = await Promise.all(
        eslintConfigFiles.map((f) => fs.access(path.join(workspacePath, f)).then(() => true).catch(() => false))
      ).then((results) => results.some(Boolean));

      if (hasEslintConfig) {
        try {
          await execFileAsync("npx", ["eslint", "--max-warnings", "0", "."], {
            cwd: workspacePath,
            timeout: 120_000,
          });
        } catch (error: any) {
          const stdout = error.stdout || "";
          const lines = stdout.split("\n").filter((line: string) => line.includes("error"));

          for (const line of lines.slice(0, 10)) {
            const match = line.match(/(.+):(\d+):(\d+):\s+error\s+(.+)/);
            if (match) {
              results.push({
                id: randomUUID(),
                workspaceId,
                companyId,
                scanType: "typescript_error",
                severity: "medium",
                title: `ESLint Error: ${match[4]}`,
                description: `Linting error in ${match[1]}:\n${match[4]}`,
                filePath: match[1],
                lineNumber: parseInt(match[2], 10),
                errorCode: "ESLINT",
                rawOutput: line,
                scannedAt: new Date(),
              });
            }
          }
        }
      }
    } catch {
      // ESLint not available
    }

    return results;
  }

  async function scanPython(workspacePath: string, companyId: string, workspaceId: string): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    // Check for Python lint errors using flake8 or pylint
    try {
      const hasPythonFiles = (await fs.readdir(workspacePath)).some((f) => f.endsWith(".py"));
      if (!hasPythonFiles) return results;

      // Try flake8 first
      try {
        await execFileAsync("flake8", ["--max-line-length=120", "."], {
          cwd: workspacePath,
          timeout: 120_000,
        });
      } catch (error: any) {
        const stdout = error.stdout || "";
        const lines = stdout.split("\n").filter((line: string) => line.includes(":"));

        for (const line of lines.slice(0, 15)) {
          const match = line.match(/(.+):(\d+):(\d+):\s+([A-Z]\d+)\s+(.+)/);
          if (match) {
            results.push({
              id: randomUUID(),
              workspaceId,
              companyId,
              scanType: "python_lint",
              severity: match[4].startsWith("E") || match[4].startsWith("F") ? "high" : "medium",
              title: `Python Lint: ${match[5]}`,
              description: `Lint error in ${match[1]}:\n${match[5]}`,
              filePath: match[1],
              lineNumber: parseInt(match[2], 10),
              errorCode: match[4],
              rawOutput: line,
              scannedAt: new Date(),
            });
          }
        }
      }
    } catch {
      // Python not available
    }

    return results;
  }

  async function scanBuild(workspacePath: string, companyId: string, workspaceId: string): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    try {
      const packageJsonPath = path.join(workspacePath, "package.json");
      await fs.access(packageJsonPath);
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));

      if (packageJson.scripts?.build) {
        try {
          await execFileAsync("npm", ["run", "build"], {
            cwd: workspacePath,
            timeout: 300_000,
            env: { ...process.env, CI: "true" },
          });
        } catch (error: any) {
          const stdout = error.stdout || "";
          const stderr = error.stderr || "";
          const output = `${stdout}\n${stderr}`;

          results.push({
            id: randomUUID(),
            workspaceId,
            companyId,
            scanType: "build_failure",
            severity: "critical",
            title: "Build Failure",
            description: `Build failed with errors:\n\n\`\`\`\n${output.slice(0, 2000)}\n\`\`\``,
            rawOutput: output,
            scannedAt: new Date(),
          });
        }
      }
    } catch {
      // No package.json or build script
    }

    return results;
  }

  async function scanSecurity(workspacePath: string, companyId: string, workspaceId: string): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    try {
      const packageJsonPath = path.join(workspacePath, "package.json");
      await fs.access(packageJsonPath);

      try {
        const { stdout } = await execFileAsync("npm", ["audit", "--json"], {
          cwd: workspacePath,
          timeout: 120_000,
        });

        const audit = JSON.parse(stdout);
        const vulnerabilities = audit.vulnerabilities || {};

        for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
          const v = vuln as any;
          if (v.severity === "critical" || v.severity === "high") {
            results.push({
              id: randomUUID(),
              workspaceId,
              companyId,
              scanType: "security_vulnerability",
              severity: v.severity === "critical" ? "critical" : "high",
              title: `Security: ${pkgName} ${v.via?.[0]?.title || "Vulnerability"}`,
              description: `Package \`${pkgName}\` has a ${v.severity} severity vulnerability.\n\n${v.via?.[0]?.description || ""}`,
              rawOutput: JSON.stringify(v, null, 2),
              scannedAt: new Date(),
            });
          }
        }
      } catch (error: any) {
        // npm audit returns non-zero when vulnerabilities found
        if (error.stdout) {
          try {
            const audit = JSON.parse(error.stdout);
            const vulnerabilities = audit.vulnerabilities || {};

            for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
              const v = vuln as any;
              if (v.severity === "critical" || v.severity === "high") {
                results.push({
                  id: randomUUID(),
                  workspaceId,
                  companyId,
                  scanType: "security_vulnerability",
                  severity: v.severity === "critical" ? "critical" : "high",
                  title: `Security: ${pkgName} ${v.via?.[0]?.title || "Vulnerability"}`,
                  description: `Package \`${pkgName}\` has a ${v.severity} severity vulnerability.\n\n${v.via?.[0]?.description || ""}`,
                  rawOutput: JSON.stringify(v, null, 2),
                  scannedAt: new Date(),
                });
              }
            }
          } catch {
            // Failed to parse audit output
          }
        }
      }
    } catch {
      // No package.json
    }

    return results;
  }

  async function scanOutdatedDependencies(workspacePath: string, companyId: string, workspaceId: string): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    try {
      const packageJsonPath = path.join(workspacePath, "package.json");
      await fs.access(packageJsonPath);

      try {
        const { stdout } = await execFileAsync("npm", ["outdated", "--json"], {
          cwd: workspacePath,
          timeout: 120_000,
        });

        const outdated = JSON.parse(stdout);

        for (const [pkgName, info] of Object.entries(outdated)) {
          const i = info as any;
          const current = i.current || "unknown";
          const latest = i.latest || "unknown";

          results.push({
            id: randomUUID(),
            workspaceId,
            companyId,
            scanType: "outdated_dependency",
            severity: "low",
            title: `Outdated Dependency: ${pkgName}`,
            description: `Package \`${pkgName}\` is outdated.\nCurrent: ${current}\nLatest: ${latest}`,
            rawOutput: JSON.stringify(i, null, 2),
            scannedAt: new Date(),
          });
        }
      } catch (error: any) {
        // npm outdated returns non-zero when outdated packages exist
        if (error.stdout) {
          try {
            const outdated = JSON.parse(error.stdout);

            for (const [pkgName, info] of Object.entries(outdated)) {
              const i = info as any;
              const current = i.current || "unknown";
              const latest = i.latest || "unknown";

              results.push({
                id: randomUUID(),
                workspaceId,
                companyId,
                scanType: "outdated_dependency",
                severity: "low",
                title: `Outdated Dependency: ${pkgName}`,
                description: `Package \`${pkgName}\` is outdated.\nCurrent: ${current}\nLatest: ${latest}`,
                rawOutput: JSON.stringify(i, null, 2),
                scannedAt: new Date(),
              });
            }
          } catch {
            // Failed to parse
          }
        }
      }
    } catch {
      // No package.json
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Issue creation
  // -----------------------------------------------------------------------

  async function createIssueFromScan(result: ScanResult): Promise<void> {
    if (!config.autoCreateIssues) return;

    try {
      const testCommand = result.scanType === "python_lint" ? "pytest" : "npm test";
      const testInstructions = `

## Auto-Testing Instructions
Before marking this issue as done, please run the test suite to verify your fix:
1. Run tests: \`${testCommand}\`
2. If tests fail, fix the issues and re-run
3. Only mark this issue done when all tests pass
`;

      const createdIssue = await issuesSvc.create(result.companyId, {
        title: result.title,
        description: result.description + testInstructions,
        status: "todo",
        priority: result.severity === "critical" ? "urgent" : result.severity === "high" ? "high" : "medium",
        assigneeAgentId: config.autoAssignAgentId,
        originKind: "code_scan",
        originId: result.id,
      });

      // Wake up the assigned agent to start working on the issue
      if (config.autoAssignAgentId && createdIssue) {
        queueIssueAssignmentWakeup({
          heartbeat,
          issue: { id: createdIssue.id, assigneeAgentId: config.autoAssignAgentId, status: "todo" },
          reason: "Code scan detected an issue",
          mutation: "issue_created_from_scan",
          contextSource: "code_scanner",
          requestedByActorType: "system",
        });
      }

      log.info(
        { scanId: result.id, scanType: result.scanType, workspaceId: result.workspaceId },
        "Created issue from code scan"
      );
    } catch (err) {
      log.error({ err, scanId: result.id }, "Failed to create issue from scan");
    }
  }

  // -----------------------------------------------------------------------
  // Post-fix verification (Phase 4: Auto-Testing)
  // -----------------------------------------------------------------------

  async function verifyFix(issueId: string, workspacePath: string): Promise<{ passed: boolean; output: string }> {
    log.info({ issueId, workspacePath }, "Running post-fix verification");

    try {
      const workspaceType = await detectWorkspaceType(workspacePath);
      let testCommand: string | null = null;

      if (workspaceType === "typescript" || workspaceType === "mixed") {
        testCommand = "npm test";
      } else if (workspaceType === "python") {
        testCommand = "pytest";
      }

      if (!testCommand) {
        return { passed: true, output: "No test command configured for this workspace type" };
      }

      const { stdout, stderr } = await execFileAsync("sh", ["-c", testCommand], {
        cwd: workspacePath,
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = stdout + stderr;
      const passed = !output.includes("FAIL") && !output.includes("failed") && !output.includes("error");

      log.info({ issueId, passed, outputLength: output.length }, "Post-fix verification complete");
      return { passed, output };
    } catch (err) {
      const errorOutput = err instanceof Error ? err.message : String(err);
      log.error({ err, issueId }, "Post-fix verification failed");
      return { passed: false, output: errorOutput };
    }
  }

  // -----------------------------------------------------------------------
  // Main scan logic
  // -----------------------------------------------------------------------

  async function scanWorkspace(workspace: typeof executionWorkspaces.$inferSelect): Promise<ScanResult[]> {
    const workspacePath = workspace.cwd || (workspace.metadata as Record<string, unknown> | null)?.localPath as string;
    if (!workspacePath || typeof workspacePath !== "string") return [];

    const workspaceType = await detectWorkspaceType(workspacePath);
    const results: ScanResult[] = [];

    if (config.scanTypes.includes("typescript_error") && (workspaceType === "typescript" || workspaceType === "mixed")) {
      results.push(...await scanTypeScript(workspacePath, workspace.companyId, workspace.id));
    }

    if (config.scanTypes.includes("python_lint") && (workspaceType === "python" || workspaceType === "mixed")) {
      results.push(...await scanPython(workspacePath, workspace.companyId, workspace.id));
    }

    if (config.scanTypes.includes("build_failure") && (workspaceType === "typescript" || workspaceType === "mixed")) {
      results.push(...await scanBuild(workspacePath, workspace.companyId, workspace.id));
    }

    if (config.scanTypes.includes("security_vulnerability")) {
      results.push(...await scanSecurity(workspacePath, workspace.companyId, workspace.id));
    }

    if (config.scanTypes.includes("outdated_dependency")) {
      results.push(...await scanOutdatedDependencies(workspacePath, workspace.companyId, workspace.id));
    }

    return results;
  }

  async function runScan(): Promise<ScanResult[]> {
    if (state.isRunning) {
      log.warn("Scan already in progress, skipping");
      return [];
    }

    state.isRunning = true;
    state.error = null;

    try {
      log.info("Starting code scan");

      // Get all execution workspaces
      const workspaces = await db.select().from(executionWorkspaces);
      const allResults: ScanResult[] = [];

      for (const workspace of workspaces) {
        try {
          const results = await scanWorkspace(workspace);
          allResults.push(...results);

          // Create issues for findings
          for (const result of results) {
            await createIssueFromScan(result);
          }
        } catch (err) {
          log.error({ err, workspaceId: workspace.id }, "Failed to scan workspace");
        }
      }

      state.results = allResults;
      state.lastScanAt = new Date();

      log.info(
        { resultCount: allResults.length, workspaceCount: workspaces.length },
        "Code scan completed"
      );

      return allResults;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      state.error = error;
      log.error({ err }, "Code scan failed");
      return [];
    } finally {
      state.isRunning = false;
    }
  }

  // -----------------------------------------------------------------------
  // Cron scheduling
  // -----------------------------------------------------------------------

  function start(): void {
    if (timer) return;
    if (!config.enabled) {
      log.info("Code scanner is disabled");
      return;
    }

    log.info({ intervalMinutes: config.intervalMinutes }, "Starting code scanner");

    // Run immediately on start
    void runScan();

    // Schedule recurring scans
    const intervalMs = config.intervalMinutes * 60 * 1000;
    timer = setInterval(() => {
      void runScan();
    }, intervalMs);

    // Unref so it doesn't keep process alive
    timer.unref?.();
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
      log.info("Stopped code scanner");
    }
  }

  function updateConfig(newConfig: Partial<ScannerConfig>): void {
    const wasEnabled = config.enabled;
    config = { ...config, ...newConfig };

    if (wasEnabled !== config.enabled) {
      if (config.enabled) {
        start();
      } else {
        stop();
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // Phase 5: Auto-PR Creation (fallback if GitHub plugin not enabled)
  // -----------------------------------------------------------------------

  async function createPRFromIssue(
    issueId: string,
    workspacePath: string,
    branchName: string,
    title: string,
  ): Promise<{ prUrl: string | null; error: string | null }> {
    log.info({ issueId, workspacePath, branchName }, "Creating PR from issue");

    try {
      // Check if git repo
      await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: workspacePath });

      // Create branch
      await execFileAsync("git", ["checkout", "-b", branchName], { cwd: workspacePath });

      // Stage and commit changes
      await execFileAsync("git", ["add", "-A"], { cwd: workspacePath });
      await execFileAsync("git", ["commit", "-m", `${title}\n\nCloses ${issueId}`], { cwd: workspacePath });

      // Push branch
      await execFileAsync("git", ["push", "origin", branchName], { cwd: workspacePath });

      log.info({ issueId, branchName }, "Branch created and pushed");
      return { prUrl: null, error: null };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error({ err, issueId }, "Failed to create PR branch");
      return { prUrl: null, error };
    }
  }

  // -----------------------------------------------------------------------
  // Phase 6: Auto-Notification
  // -----------------------------------------------------------------------

  async function sendNotification(
    message: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (!config.notificationWebhook) {
      log.info({ message }, "Notification skipped: no webhook configured");
      return;
    }

    try {
      const response = await fetch(config.notificationWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          ...payload,
          timestamp: new Date().toISOString(),
          source: "code-scanner",
        }),
      });

      if (!response.ok) {
        log.warn({ status: response.status }, "Notification webhook returned non-OK status");
      } else {
        log.info({ message }, "Notification sent successfully");
      }
    } catch (err) {
      log.error({ err }, "Failed to send notification");
    }
  }

  return {
    runScan,
    start,
    stop,
    updateConfig,
    verifyFix,
    createPRFromIssue,
    sendNotification,
    getState: () => ({ ...state }),
    getConfig: () => ({ ...config }),
  };
}

export type CodeScannerService = ReturnType<typeof codeScannerService>;
