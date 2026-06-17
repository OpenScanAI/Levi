import { Router } from "express";
import { assertBoard } from "./authz.js";
import type { CodeScannerService } from "../services/code-scanner.js";

export function codeScannerRoutes(scanner: CodeScannerService) {
  const router = Router();

  router.post("/run", assertBoard, async (_req, res) => {
    try {
      const results = await scanner.runScan();
      res.json({
        success: true,
        results: results.map((r) => ({
          id: r.id,
          scanType: r.scanType,
          severity: r.severity,
          title: r.title,
          filePath: r.filePath,
          lineNumber: r.lineNumber,
          errorCode: r.errorCode,
          scannedAt: r.scannedAt.toISOString(),
        })),
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: {
          code: "ERR_SCAN_FAILED",
          message: err instanceof Error ? err.message : "Scan failed",
        },
      });
    }
  });

  router.get("/status", assertBoard, (_req, res) => {
    const state = scanner.getState();
    res.json({
      success: true,
      state: {
        lastScanAt: state.lastScanAt?.toISOString() || null,
        resultCount: state.results.length,
        isRunning: state.isRunning,
        error: state.error,
      },
    });
  });

  router.post("/configure", assertBoard, async (req, res) => {
    try {
      scanner.updateConfig(req.body);
      const config = scanner.getConfig();
      res.json({
        success: true,
        config,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: {
          code: "ERR_CONFIG_UPDATE_FAILED",
          message: err instanceof Error ? err.message : "Config update failed",
        },
      });
    }
  });

  router.post("/verify/:issueId", assertBoard, async (req, res) => {
    try {
      const issueId = req.params.issueId as string;
      const { workspacePath } = req.body;
      
      if (!workspacePath) {
        return res.status(400).json({
          success: false,
          error: { code: "ERR_MISSING_WORKSPACE_PATH", message: "workspacePath is required" },
        });
      }

      const result = await scanner.verifyFix(issueId, workspacePath);
      res.json({
        success: true,
        verification: result,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: {
          code: "ERR_VERIFY_FAILED",
          message: err instanceof Error ? err.message : "Verification failed",
        },
      });
    }
  });

  router.post("/pr/:issueId", assertBoard, async (req, res) => {
    try {
      const issueId = req.params.issueId as string;
      const { workspacePath, branchName, title } = req.body;
      
      if (!workspacePath || !branchName) {
        return res.status(400).json({
          success: false,
          error: { code: "ERR_MISSING_PARAMS", message: "workspacePath and branchName are required" },
        });
      }

      const result = await scanner.createPRFromIssue(issueId, workspacePath, branchName, title || "Auto-fix");
      res.json({
        success: true,
        pr: result,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: {
          code: "ERR_PR_FAILED",
          message: err instanceof Error ? err.message : "PR creation failed",
        },
      });
    }
  });

  return router;
}
