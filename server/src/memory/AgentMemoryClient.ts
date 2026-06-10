import { logger } from "../middleware/logger.js";
import type { Memory, MemoryQueryOptions, RetrievedMemory, StoreMemoryInput } from "./MemoryTypes.js";
import type { MemoryService, MemoryServiceConfig } from "./MemoryService.js";
import { forAgent, forProject, forCompany } from "./MemoryNamespace.js";

/**
 * Real agentmemory integration adapter.
 *
 * Maps Levi's MemoryService interface to agentmemory's REST API:
 * - store() → POST /agentmemory/remember (stores searchable memory)
 * - query() → POST /agentmemory/search (retrieves relevant memories)
 * - delete() → POST /agentmemory/forget (removes by memoryId)
 *
 * agentmemory's "remember" API is used instead of "observe" because:
 * - remember stores content directly and adds it to the search index
 * - observe is for raw tool-use observations (tool_input/tool_output)
 */

interface AgentMemorySession {
  sessionId: string;
  project: string;
  cwd: string;
}

interface RememberPayload {
  content: string;
  type?: string;
  concepts?: string[];
  files?: string[];
  project?: string;
  sourceObservationIds?: string[];
}

interface SearchPayload {
  query: string;
  limit?: number;
  project?: string;
  cwd?: string;
  format?: "full" | "compact" | "narrative";
  token_budget?: number;
}

interface SearchResultItem {
  observation?: {
    id: string;
    title?: string;
    narrative?: string;
    type?: string;
    timestamp?: string;
    sessionId?: string;
    concepts?: string[];
    files?: string[];
    confidence?: number;
  };
  score?: number;
  sessionId?: string;
}

export function createAgentMemoryClient(config: MemoryServiceConfig): MemoryService {
  const enabled = Boolean(config.enabled);
  const baseUrl = (config.baseUrl ?? "http://localhost:3111").replace(/\/$/, "");
  const sessions = new Map<string, AgentMemorySession>();

  const authHeader = (): Record<string, string> => {
    const secret = config.secret || process.env.AGENTMEMORY_SECRET || "";
    if (!secret) return {};
    return { authorization: `Bearer ${secret}` };
  };

  const safeFetch = async (path: string, init?: RequestInit): Promise<Response | null> => {
    try {
      const url = `${baseUrl}${path}`;
      return await fetch(url, {
        ...init,
        headers: {
          ...authHeader(),
          ...(init?.headers || {}),
        },
      });
    } catch (err) {
      logger.warn({ err, path }, "AgentMemory request failed");
      return null;
    }
  };

  const safeJson = async (response: Response): Promise<unknown | null> => {
    try {
      return await response.json();
    } catch (err) {
      logger.warn({ err }, "AgentMemory response parse failed");
      return null;
    }
  };

  const checkHealth = async (): Promise<boolean> => {
    const response = await safeFetch("/agentmemory/health", { method: "GET" });
    if (!response) return false;
    return response.ok;
  };

  const ensureSession = async (namespace: string): Promise<AgentMemorySession | null> => {
    if (sessions.has(namespace)) {
      return sessions.get(namespace)!;
    }

    // Parse namespace to extract project/cwd
    // Namespace format: company:<cid>[:project:<pid>[:agent:<aid>]]
    const parts = namespace.split(":");
    const companyId = parts[1] || "default";
    const projectId = parts[3] || companyId;

    const project = `levi-${companyId}`;
    const cwd = `/projects/${projectId}`;
    const sessionId = namespace;

    // Start session in agentmemory
    const response = await safeFetch("/agentmemory/session/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, project, cwd }),
    });

    if (!response || !response.ok) {
      logger.warn({ namespace, status: response?.status }, "Failed to start agentmemory session");
      return null;
    }

    const session: AgentMemorySession = { sessionId, project, cwd };
    sessions.set(namespace, session);
    return session;
  };

  const mapMemoryType = (leviType: string): string => {
    switch (leviType) {
      case "decision": return "pattern";
      case "error": return "bug";
      case "code_change": return "workflow";
      case "architecture": return "architecture";
      case "preference": return "preference";
      case "discussion": return "fact";
      default: return "fact";
    }
  };

  return {
    enabled,

    async isHealthy(): Promise<boolean> {
      if (!enabled) return false;
      return checkHealth();
    },

    async store(input: StoreMemoryInput & { companyId: string; projectId: string; agentId: string }): Promise<Memory | null> {
      if (!enabled) return null;

      let namespace: string;
      try {
        namespace = forAgent(input.companyId, input.projectId, input.agentId);
      } catch (err) {
        logger.warn({ err }, "Memory namespace is invalid");
        return null;
      }

      const session = await ensureSession(namespace);
      if (!session) return null;

      const visibility = input.visibility ?? input.metadata.visibility;
      const metadata = { ...input.metadata, visibility };

      // Build rich content that includes metadata context
      const contentLines = [
        input.content,
        "",
        `---`,
        `Memory Type: ${metadata.memory_type}`,
        `Visibility: ${metadata.visibility}`,
        `Agent: ${metadata.agent_id}`,
        `Task: ${metadata.task_id}`,
        `Run: ${metadata.run_id}`,
        `Timestamp: ${metadata.timestamp}`,
      ];
      const fullContent = contentLines.join("\n");

      const payload: RememberPayload = {
        content: fullContent,
        type: mapMemoryType(metadata.memory_type),
        project: session.project,
      };

      const response = await safeFetch("/agentmemory/remember", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response || !response.ok) {
        logger.warn({ status: response?.status }, "AgentMemory remember failed");
        return null;
      }

      const data = await safeJson(response);
      const memoryId = (data as { id?: string } | null)?.id || `mem-${Date.now()}`;

      return {
        id: memoryId,
        content: input.content,
        metadata,
        namespace,
        confidence: 0.7,
      };
    },

    async query(options: MemoryQueryOptions): Promise<RetrievedMemory[]> {
      if (!enabled) return [];

      let namespace: string;
      try {
        namespace = forProject(options.company_id, options.project_id);
      } catch (err) {
        logger.warn({ err }, "Memory namespace is invalid");
        return [];
      }

      const session = await ensureSession(namespace);
      if (!session) return [];

      const payload: SearchPayload = {
        query: options.query,
        limit: options.topK ?? 10,
        project: session.project,
        cwd: session.cwd,
        format: "narrative",
        token_budget: 2000,
      };

      const response = await safeFetch("/agentmemory/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response || !response.ok) {
        logger.warn({ status: response?.status }, "AgentMemory search failed");
        return [];
      }

      const data = await safeJson(response);

      // Parse agentmemory search response format:
      // { format: "narrative", results: [{observation: {...}, score: N, sessionId: "..."}], text: "...", tokens_used: N, tokens_budget: N, truncated: false }
      const results = (data as { results?: unknown[] } | null)?.results ?? [];

      return results
        .map((item: unknown): RetrievedMemory | null => {
          const r = item as SearchResultItem;
          const obs = r.observation;
          if (!obs || !obs.id) return null;

          // Extract the actual content from narrative (before the metadata separator)
          const narrative = obs.narrative || obs.title || "";
          const contentParts = narrative.split("\n---\n");
          const content = contentParts[0]?.trim() || narrative;

          return {
            id: obs.id,
            content,
            metadata: {
              company_id: options.company_id,
              project_id: options.project_id,
              agent_id: "unknown",
              task_id: "unknown",
              goal_ancestry: [],
              agent_role: "agent",
              timestamp: obs.timestamp || new Date().toISOString(),
              run_id: "unknown",
              cost: 0,
              memory_type: obs.type as any || "decision",
              visibility: "shared" as any,
            },
            namespace,
            confidence: obs.confidence ?? r.score ?? 0.5,
            relevanceScore: r.score,
          };
        })
        .filter((item): item is RetrievedMemory => Boolean(item));
    },

    async delete(id: string): Promise<boolean> {
      if (!enabled) return false;

      const response = await safeFetch("/agentmemory/forget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memoryId: id }),
      });

      if (!response || !response.ok) {
        logger.warn({ status: response?.status, id }, "AgentMemory forget failed");
        return false;
      }

      return true;
    },

    async purgeCompany(companyId: string): Promise<void> {
      if (!enabled) return;

      let namespace: string;
      try {
        namespace = forCompany(companyId);
      } catch (err) {
        logger.warn({ err }, "Memory namespace is invalid");
        return;
      }

      const session = sessions.get(namespace);
      if (!session) return;

      await safeFetch("/agentmemory/forget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      sessions.delete(namespace);
    },

    async purgeProject(companyId: string, projectId: string): Promise<void> {
      if (!enabled) return;

      let namespace: string;
      try {
        namespace = forProject(companyId, projectId);
      } catch (err) {
        logger.warn({ err }, "Memory namespace is invalid");
        return;
      }

      const session = sessions.get(namespace);
      if (!session) return;

      await safeFetch("/agentmemory/forget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      sessions.delete(namespace);
    },

    shutdown(): void {
      sessions.clear();
    },
  };
}
