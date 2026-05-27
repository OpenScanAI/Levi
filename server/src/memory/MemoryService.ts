import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { logger } from "../middleware/logger.js";
import { assertNamespaceBelongsToCompany, forAgent, forCompany, forProject } from "./MemoryNamespace.js";
import { MemoryVisibility } from "./MemoryTypes.js";
import type { Memory, MemoryMetadata, MemoryQueryOptions, RetrievedMemory, StoreMemoryInput } from "./MemoryTypes.js";

export interface MemoryServiceConfig {
  enabled: boolean;
  baseUrl?: string;
  autoStart?: boolean;
}

export interface MemoryService {
  readonly enabled: boolean;
  isHealthy(): Promise<boolean>;
  store(input: StoreMemoryInput & { companyId: string; projectId: string; agentId: string }): Promise<Memory | null>;
  query(options: MemoryQueryOptions): Promise<RetrievedMemory[]>;
  delete(id: string): Promise<boolean>;
  purgeCompany(companyId: string): Promise<void>;
  purgeProject(companyId: string, projectId: string): Promise<void>;
  shutdown(): void;
}

const DEFAULT_BASE_URL = "http://localhost:3111";
const STARTUP_PORT = "3111";
const STARTUP_ATTEMPTS = 10;
const STARTUP_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function isCeoRole(role: string | undefined): boolean {
  return typeof role === "string" && role.trim().toLowerCase() === "ceo";
}

function toRetrievedMemory(value: unknown): RetrievedMemory | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const content = typeof record.content === "string" ? record.content : "";
  const namespace = typeof record.namespace === "string" ? record.namespace : "";
  const metadata = record.metadata as MemoryMetadata | undefined;

  if (!id || !content || !namespace || !metadata) {
    return null;
  }

  const confidence = typeof record.confidence === "number" ? record.confidence : 0;
  const relevanceRaw = (record as { relevanceScore?: unknown; relevance_score?: unknown }).relevanceScore
    ?? (record as { relevanceScore?: unknown; relevance_score?: unknown }).relevance_score;
  const relevanceScore = typeof relevanceRaw === "number" ? relevanceRaw : undefined;

  return {
    id,
    content,
    metadata,
    namespace,
    confidence,
    relevanceScore,
  };
}

function toMemory(value: unknown, fallback: Memory): Memory {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : fallback.id;
  const content = typeof record.content === "string" ? record.content : fallback.content;
  const namespace = typeof record.namespace === "string" ? record.namespace : fallback.namespace;
  const metadata = (record.metadata as MemoryMetadata | undefined) ?? fallback.metadata;
  const confidence = typeof record.confidence === "number" ? record.confidence : fallback.confidence;

  return {
    id,
    content,
    metadata,
    namespace,
    confidence,
  };
}

function isVisibleToAgent(memory: RetrievedMemory, options: MemoryQueryOptions): boolean {
  const visibility = memory.metadata.visibility;

  if (options.visibility_filter && options.visibility_filter.length > 0) {
    if (!options.visibility_filter.includes(visibility)) {
      return false;
    }
  }

  switch (visibility) {
    case MemoryVisibility.Shared:
      return true;
    case MemoryVisibility.RolePrivate:
      return memory.metadata.agent_role === options.agent_role;
    case MemoryVisibility.AgentPrivate:
      return memory.metadata.agent_id === options.agent_id;
    case MemoryVisibility.CeoOnly:
      return isCeoRole(options.agent_role);
    default:
      return false;
  }
}

export function createMemoryService(config: MemoryServiceConfig): MemoryService {
  const enabled = Boolean(config.enabled);
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const autoStart = config.autoStart ?? true;
  let childProcess: ChildProcess | null = null;
  let startPromise: Promise<boolean> | null = null;

  const safeFetch = async (url: string, init?: RequestInit): Promise<Response | null> => {
    try {
      return await fetch(url, init);
    } catch (err) {
      logger.warn({ err, url }, "Memory service request failed");
      return null;
    }
  };

  const checkHealth = async (): Promise<boolean> => {
    const response = await safeFetch(buildUrl(baseUrl, "/health"), { method: "GET" });
    if (!response) {
      return false;
    }
    if (!response.ok) {
      logger.warn({ status: response.status }, "Memory service health check failed");
      return false;
    }
    return true;
  };

  const ensureHealthy = async (): Promise<boolean> => {
    if (!enabled) {
      return false;
    }
    if (await checkHealth()) {
      return true;
    }
    // Start agentmemory manually:
    // pip install agentmemory && python3 -m agentmemory --port 3111
    logger.warn(
      { baseUrl },
      "agentmemory is not reachable. Start it manually: pip install agentmemory && python3 -m agentmemory --port 3111",
    );
    return false;
  };

  const safeJson = async (response: Response): Promise<unknown | null> => {
    try {
      return await response.json();
    } catch (err) {
      logger.warn({ err }, "Memory service response parse failed");
      return null;
    }
  };

  return {
    enabled,

    async isHealthy(): Promise<boolean> {
      if (!enabled) {
        return false;
      }
      return ensureHealthy();
    },

    async store(
      input: StoreMemoryInput & { companyId: string; projectId: string; agentId: string },
    ): Promise<Memory | null> {
      if (!enabled) {
        return null;
      }
      if (!(await ensureHealthy())) {
        return null;
      }

      let namespace: string;
      try {
        namespace = forAgent(input.companyId, input.projectId, input.agentId);
      } catch (err) {
        logger.warn({ err }, "Memory namespace is invalid");
        return null;
      }

      const visibility = input.visibility ?? input.metadata.visibility;
      const metadata = { ...input.metadata, visibility };
      const payload = {
        content: input.content,
        metadata,
        namespace,
        visibility,
      };

      const response = await safeFetch(buildUrl(baseUrl, "/observations"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response) {
        return null;
      }

      if (!response.ok) {
        logger.warn({ status: response.status }, "Memory store failed");
        return null;
      }

      const data = await safeJson(response);
      const fallback: Memory = {
        content: input.content,
        metadata,
        namespace,
      };

      return toMemory(data, fallback);
    },

    async query(options: MemoryQueryOptions): Promise<RetrievedMemory[]> {
      if (!enabled) {
        return [];
      }
      if (!(await ensureHealthy())) {
        return [];
      }

      let namespace: string;
      try {
        namespace = forProject(options.company_id, options.project_id);
      } catch (err) {
        logger.warn({ err }, "Memory namespace is invalid");
        return [];
      }

      const payload: Record<string, unknown> = {
        query: options.query,
        namespace,
      };

      if (typeof options.topK === "number") {
        payload.topK = options.topK;
      }
      if (options.memory_type) {
        payload.memory_type = options.memory_type;
      }

      const response = await safeFetch(buildUrl(baseUrl, "/observations/search"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response) {
        return [];
      }

      if (!response.ok) {
        logger.warn({ status: response.status }, "Memory query failed");
        return [];
      }

      const data = await safeJson(response);
      const items = Array.isArray(data)
        ? data
        : Array.isArray((data as { observations?: unknown[] } | null)?.observations)
          ? (data as { observations: unknown[] }).observations
          : [];

      return items
        .map((item) => toRetrievedMemory(item))
        .filter((item): item is RetrievedMemory => Boolean(item))
        .filter((memory) => {
          if (options.memory_type && memory.metadata.memory_type !== options.memory_type) {
            return false;
          }
          return isVisibleToAgent(memory, options);
        });
    },

    async delete(id: string): Promise<boolean> {
      if (!enabled) {
        return false;
      }
      if (!(await ensureHealthy())) {
        return false;
      }

      const response = await safeFetch(
        buildUrl(baseUrl, `/observations/${encodeURIComponent(id)}`),
        { method: "DELETE" },
      );

      if (!response) {
        return false;
      }

      if (!response.ok) {
        logger.warn({ status: response.status, id }, "Memory delete failed");
        return false;
      }

      return true;
    },

    async purgeCompany(companyId: string): Promise<void> {
      if (!enabled) {
        return;
      }
      if (!(await ensureHealthy())) {
        return;
      }

      let namespace: string;
      try {
        namespace = forCompany(companyId);
      } catch (err) {
        logger.warn({ err }, "Memory namespace is invalid");
        return;
      }

      const response = await safeFetch(
        buildUrl(baseUrl, `/namespaces/${encodeURIComponent(namespace)}`),
        { method: "DELETE" },
      );

      if (!response) {
        return;
      }

      if (!response.ok) {
        logger.warn({ status: response.status }, "Memory purge failed");
      }
    },

    async purgeProject(companyId: string, projectId: string): Promise<void> {
      if (!enabled) {
        return;
      }
      if (!(await ensureHealthy())) {
        return;
      }

      let namespace: string;
      try {
        namespace = forProject(companyId, projectId);
        assertNamespaceBelongsToCompany(namespace, companyId);
      } catch (err) {
        logger.warn({ err }, "Memory namespace is invalid");
        return;
      }

      const response = await safeFetch(
        buildUrl(baseUrl, `/namespaces/${encodeURIComponent(namespace)}`),
        { method: "DELETE" },
      );

      if (!response) {
        return;
      }

      if (!response.ok) {
        logger.warn({ status: response.status }, "Memory purge failed");
      }
    },

    shutdown(): void {
      if (!childProcess) {
        return;
      }
      try {
        childProcess.kill();
      } catch (err) {
        logger.warn({ err }, "Failed to shut down agentmemory");
      } finally {
        childProcess = null;
      }
    },
  };
}
