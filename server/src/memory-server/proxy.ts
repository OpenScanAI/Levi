import express from "express";
import type { Request, Response } from "express";
import { createHash, randomUUID } from "node:crypto";

/**
 * Memory Proxy Server
 *
 * Translates Levi's memory API (used by MemoryService.ts) to real agentmemory's API.
 *
 * Levi (port 3111)          Proxy (port 3111)         agentmemory (port 3112)
 *    |                           |                            |
 *    |-- GET /health ----------->|-- GET /agentmemory/health ->|
 *    |                           |                            |
 *    |-- POST /observations ---->|-- POST /agentmemory/observe->|
 *    |                           |                            |
 *    |-- POST /observations/search-- POST /agentmemory/search->|
 *    |                           |                            |
 *    |-- DELETE /namespaces/:ns->|-- DELETE observations ---->|
 *
 * This proxy exists because:
 * 1. Levi's MemoryService was designed for a generic REST API (/observations)
 * 2. Real agentmemory exposes /agentmemory/* endpoints with different shapes
 * 3. We want to use real agentmemory without rewriting MemoryService
 */

const PROXY_PORT = 3111;
const AGENTMEMORY_PORT = 3112;
const AGENTMEMORY_BASE_URL = `http://localhost:${AGENTMEMORY_PORT}`;

const app = express();
app.use(express.json({ limit: "10mb" }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  console[level](`[${timestamp}] [memory-proxy] ${message}${metaStr}`);
}

async function forwardToAgentmemory(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${AGENTMEMORY_BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (err) {
    log("warn", `agentmemory unreachable: ${url}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      status: 503,
      body: { error: "agentmemory service unavailable" },
    };
  }
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

app.get("/health", async (_req: Request, res: Response) => {
  const result = await forwardToAgentmemory("/agentmemory/health", { method: "GET" });

  if (result.ok && result.body && typeof result.body === "object") {
    const body = result.body as Record<string, unknown>;
    if (body.status === "ok") {
      return res.json({ status: "ok" });
    }
  }

  log("warn", "agentmemory health check failed", { status: result.status });
  return res.status(503).json({ status: "error", message: "agentmemory is not healthy" });
});

// ---------------------------------------------------------------------------
// POST /observations
// Levi sends: { content, namespace, metadata, visibility? }
// agentmemory expects: { observation, namespace, metadata }
// ---------------------------------------------------------------------------

app.post("/observations", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const content = typeof body.content === "string" ? body.content : "";
  const namespace = typeof body.namespace === "string" ? body.namespace : "default";
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

  const result = await forwardToAgentmemory("/agentmemory/observe", {
    method: "POST",
    body: JSON.stringify({
      observation: content,
      namespace,
      metadata,
    }),
  });

  if (!result.ok) {
    log("warn", "agentmemory observe failed", { status: result.status });
    return res.status(result.status).json({
      error: "Failed to store observation",
      details: result.body,
    });
  }

  const agentmemoryBody = (result.body ?? {}) as Record<string, unknown>;

  // Translate agentmemory response back to Levi's expected format
  const response = {
    id: typeof agentmemoryBody.id === "string" ? agentmemoryBody.id : randomUUID(),
    content,
    namespace,
    metadata,
    confidence: typeof agentmemoryBody.confidence === "number" ? agentmemoryBody.confidence : 0.9,
    created_at: new Date().toISOString(),
  };

  return res.status(201).json(response);
});

// ---------------------------------------------------------------------------
// POST /observations/search
// Levi sends: { query, namespace, topK?, memory_type? }
// agentmemory expects: { query, namespace, n_results? }
// ---------------------------------------------------------------------------

app.post("/observations/search", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const query = typeof body.query === "string" ? body.query : "";
  const namespace = typeof body.namespace === "string" ? body.namespace : "";
  const topK = typeof body.topK === "number" ? body.topK : 10;

  const result = await forwardToAgentmemory("/agentmemory/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      namespace,
      n_results: topK,
    }),
  });

  if (!result.ok) {
    log("warn", "agentmemory search failed", { status: result.status });
    return res.status(result.status).json({
      error: "Failed to search observations",
      details: result.body,
    });
  }

  const agentmemoryBody = (result.body ?? {}) as Record<string, unknown>;
  const rawResults = Array.isArray(agentmemoryBody.results)
    ? agentmemoryBody.results
    : [];

  // Translate agentmemory results back to Levi's expected format
  const observations = rawResults.map((r: unknown) => {
    const item = r as Record<string, unknown>;
    const distance = typeof item.distance === "number" ? item.distance : 0;
    const itemMetadata = item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : {};

    return {
      id: typeof item.id === "string" ? item.id : randomUUID(),
      content: typeof item.observation === "string" ? item.observation : String(item.observation ?? ""),
      namespace,
      metadata: itemMetadata,
      confidence: Math.max(0, Math.min(1, 1 - distance)),
      created_at: typeof itemMetadata.created_at === "string"
        ? itemMetadata.created_at
        : new Date().toISOString(),
    };
  });

  return res.json({ observations });
});

// ---------------------------------------------------------------------------
// DELETE /namespaces/:ns
// Levi sends: DELETE /namespaces/:ns
// agentmemory: list observations by namespace, then delete each
// ---------------------------------------------------------------------------

app.delete("/namespaces/:ns", async (req: Request, res: Response) => {
  const ns = Array.isArray(req.params.ns) ? req.params.ns[0] : req.params.ns;

  // Step 1: List observations in the namespace
  const listResult = await forwardToAgentmemory(
    `/agentmemory/observations?namespace=${encodeURIComponent(ns)}`,
    { method: "GET" },
  );

  if (!listResult.ok) {
    log("warn", "agentmemory namespace list failed", { status: listResult.status, namespace: ns });
    // Still return 204 — namespace is effectively empty or gone
    return res.status(204).send();
  }

  const listBody = (listResult.body ?? {}) as Record<string, unknown>;
  const items = Array.isArray(listBody.observations)
    ? listBody.observations
    : [];

  // Step 2: Delete each observation individually
  let deleted = 0;
  let failed = 0;

  for (const item of items) {
    const obs = item as Record<string, unknown>;
    const id = typeof obs.id === "string" ? obs.id : null;
    if (!id) continue;

    const delResult = await forwardToAgentmemory(`/agentmemory/observations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (delResult.ok) {
      deleted++;
    } else {
      failed++;
    }
  }

  log("info", `Namespace purge complete`, { namespace: ns, deleted, failed });
  return res.status(204).send();
});

// ---------------------------------------------------------------------------
// Catch-all: return 404 for unhandled paths
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  log("error", "Unhandled error", { message: err.message });
  res.status(500).json({ error: "Internal server error" });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

app.listen(PROXY_PORT, () => {
  log("info", `Memory proxy running on port ${PROXY_PORT}`);
  log("info", `Forwarding to agentmemory on port ${AGENTMEMORY_PORT}`);
});
