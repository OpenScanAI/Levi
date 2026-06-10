import express from "express";
import type { Request, Response } from "express";

/**
 * Lightweight mock of the agentmemory service for integration testing.
 * Implements the subset of the agentmemory REST API that MemoryService uses:
 *   GET  /health
 *   POST /observations
 *   POST /observations/search
 *   DELETE /namespaces/:ns
 */

export interface MockObservation {
  id: string;
  content: string;
  namespace: string;
  metadata: Record<string, unknown>;
  confidence: number;
  created_at: string;
}

let observations: MockObservation[] = [];
let idCounter = 1;

export function resetMockObservations(): void {
  observations = [];
  idCounter = 1;
}

export function createAgentMemoryMockApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.post("/observations", (req: Request, res: Response) => {
    const obs: MockObservation = {
      id: `mock-${idCounter++}`,
      content: req.body.content ?? "",
      namespace: req.body.namespace ?? "default",
      metadata: req.body.metadata ?? {},
      confidence: 0.9,
      created_at: new Date().toISOString(),
    };
    observations.push(obs);
    res.status(201).json(obs);
  });

  app.post("/observations/search", (req: Request, res: Response) => {
    const namespace = req.body.namespace ?? "";
    const query = (req.body.query ?? "").toLowerCase();

    const matches = observations
      .filter((o) => o.namespace === namespace || o.namespace.startsWith(`${namespace}:`))
      .filter((o) => {
        if (!query) return true;
        return (
          o.content.toLowerCase().includes(query) ||
          JSON.stringify(o.metadata).toLowerCase().includes(query)
        );
      })
      .map((o) => ({
        id: o.id,
        content: o.content,
        namespace: o.namespace,
        metadata: o.metadata,
        confidence: o.confidence,
        created_at: o.created_at,
      }));

    if (matches.length === 0) {
      res.json({ observations: [] });
      return;
    }

    res.json({ observations: matches });
  });

  app.delete("/namespaces/:ns", (req: Request, res: Response) => {
    const nsParam = req.params.ns;
    const ns = typeof nsParam === "string" ? decodeURIComponent(nsParam) : "";
    observations = observations.filter(
      (o) => o.namespace !== ns && !o.namespace.startsWith(`${ns}:`),
    );
    res.status(204).send();
  });

  return app;
}

// Standalone runner — only executes when run directly, not when imported by tests
if (process.argv[1]?.includes("agentmemory-mock")) {
  const PORT = 3111;
  const app = createAgentMemoryMockApp();
  app.listen(PORT, () => {
    console.log(`agentmemory mock running on http://localhost:${PORT}`);
  });
}
