import { logger } from "../middleware/logger.js";
import { publishLiveEvent } from "../services/live-events.js";
import type { MemoryService } from "./MemoryService.js";
import { MemoryType, MemoryVisibility } from "./MemoryTypes.js";
import type { Memory, MemoryMetadata, RetrievedMemory, StoreMemoryInput } from "./MemoryTypes.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context about the requesting agent used for privacy filtering and
 * relevance ranking in cross-agent memory queries.
 */
export interface AgentContext {
  /** The agent's unique identifier */
  agentId: string;
  /** The agent's role (e.g. 'Backend Engineer', 'CEO') */
  role: string;
}

/**
 * Parameters for storing a memory and optionally broadcasting a signal
 * to the project dashboard.
 */
export interface MemoryParams {
  content: string;
  metadata: MemoryMetadata;
  visibility?: MemoryVisibility;
  companyId: string;
  projectId: string;
  agentId: string;
}

/**
 * A scored memory carries the computed relevance score used by the
 * ranking algorithm.  The score is ephemeral — it is never persisted.
 */
interface ScoredMemory extends RetrievedMemory {
  score: number;
}

// ---------------------------------------------------------------------------
// Ranking weights — documented constants so tuning is explicit
// ---------------------------------------------------------------------------

/**
 * Weight applied to the base confidence / relevance score returned by the
 * underlying memory store (agentmemory).  This is the strongest signal
 * because it captures semantic similarity to the query.
 */
const SEMANTIC_RELEVANCE_WEIGHT = 1.0;

/**
 * Bonus added when the memory author has the exact same role as the
 * requesting agent.  Same-role memories are often more actionable because
 * they were produced by someone solving a similar class of problems.
 */
const SAME_ROLE_BOOST = 0.25;

/**
 * Half-life for the recency decay curve, expressed in milliseconds.
 * A memory older than this value receives roughly half the recency boost.
 * Default: 7 days.
 */
const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Maximum recency boost.  The boost decays exponentially from this peak
 * down to zero as the memory ages.
 */
const RECENCY_MAX_BOOST = 0.3;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function isCeoOrManagementRole(role: string | undefined): boolean {
  if (!role || typeof role !== "string") return false;
  const normalized = role.trim().toLowerCase();
  return normalized === "ceo" || normalized.includes("management") || normalized.includes("cto") || normalized.includes("cfo") || normalized.includes("cmo");
}

function isSameRole(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function computeRecencyBoost(timestamp: string | undefined): number {
  if (!timestamp) return 0;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (ageMs <= 0) return RECENCY_MAX_BOOST;
  const decay = Math.exp(-ageMs / RECENCY_HALF_LIFE_MS);
  return RECENCY_MAX_BOOST * decay;
}

// ---------------------------------------------------------------------------
// CompanyMemoryGraph
// ---------------------------------------------------------------------------

export class CompanyMemoryGraph {
  constructor(private readonly memoryService: MemoryService) {}

  /**
   * Query the shared memory pool for a project, applying strict privacy
   * filters based on the requesting agent's identity and role.
   *
   * Results are ranked by a composite score that blends semantic relevance,
   * author role similarity, and recency.
   *
   * @param projectId        The project to search within
   * @param query            Free-text query string
   * @param requestingAgent  Context about the agent making the request
   * @param companyId        The company that owns the project
   * @param topK             Maximum number of memories to return (default 20)
   * @returns Filtered, ranked memories visible to the requesting agent
   */
  async querySharedBrain(
    projectId: string,
    query: string,
    requestingAgent: AgentContext,
    companyId: string,
    topK = 20,
  ): Promise<RetrievedMemory[]> {
    if (!this.memoryService.enabled) {
      return [];
    }

    if (!companyId || !projectId || !query.trim()) {
      logger.warn(
        { companyId, projectId, queryLength: query?.length },
        "[CompanyMemoryGraph] querySharedBrain called with missing parameters",
      );
      return [];
    }

    // 1. Fetch raw pool from the memory service (project-scoped)
    const rawMemories = await this.memoryService.query({
      query,
      company_id: companyId,
      project_id: projectId,
      agent_id: requestingAgent.agentId,
      agent_role: requestingAgent.role,
      topK,
    });

    if (!rawMemories || rawMemories.length === 0) {
      return [];
    }

    // 2. Apply privacy filters (defense in depth — MemoryService already
    //    filters, but we re-apply here so the graph layer is self-contained)
    const visible = this.applyPrivacyFilters(rawMemories, requestingAgent);

    // 3. Rank by composite score
    const ranked = this.rankMemories(visible, query, requestingAgent);

    // 4. Strip the ephemeral score field before returning
    return ranked.map(({ score: _score, ...memory }) => memory);
  }

  /**
   * Store a memory and, if it represents a high-signal type (architecture
   * or breaking change), broadcast a live event to the project dashboard
   * so other agents and human operators are notified in real time.
   *
   * @param memoryParams  Full memory parameters including content, metadata,
   *                      company/project/agent ids, and optional visibility
   * @returns The stored Memory on success, null on failure
   */
  async storeAndBroadcast(memoryParams: MemoryParams): Promise<Memory | null> {
    if (!this.memoryService.enabled) {
      return null;
    }

    const { companyId, projectId, agentId, content, metadata, visibility } = memoryParams;

    // 1. Store the memory
    const stored = await this.memoryService.store({
      content,
      metadata,
      visibility,
      companyId,
      projectId,
      agentId,
    });

    if (!stored) {
      logger.warn(
        { companyId, projectId, agentId, memoryType: metadata.memory_type },
        "[CompanyMemoryGraph] storeAndBroadcast failed to store memory",
      );
      return null;
    }

    // 2. Broadcast signal for high-impact memory types
    const shouldBroadcast =
      metadata.memory_type === MemoryType.Architecture ||
      metadata.memory_type === MemoryType.CodeChange ||
      this.isBreakingChangeMemory(content, metadata);

    if (shouldBroadcast) {
      try {
        publishLiveEvent({
          companyId,
          type: "activity.logged",
          payload: {
            kind: "memory_broadcast",
            projectId,
            agentId,
            agentRole: metadata.agent_role,
            memoryType: metadata.memory_type,
            memoryId: stored.id ?? "unknown",
            preview: content.slice(0, 280),
            timestamp: new Date().toISOString(),
          },
        });
      } catch (err) {
        // Broadcasting is best-effort — never fail the store because of it
        logger.warn(
          { err, companyId, projectId, memoryId: stored.id },
          "[CompanyMemoryGraph] Broadcast failed after successful store",
        );
      }
    }

    return stored;
  }

  // ---------------------------------------------------------------------------
  // Privacy filters
  // ---------------------------------------------------------------------------

  /**
   * Apply visibility rules from the MemoryVisibility enum.
   *
   * Rules:
   *   - shared      → visible to everyone
   *   - agent_private → visible only to the authoring agent
   *   - role_private  → visible only to agents with the same role
   *   - ceo_only    → visible only to CEO / Management roles
   */
  private applyPrivacyFilters(
    memories: RetrievedMemory[],
    requestingAgent: AgentContext,
  ): RetrievedMemory[] {
    return memories.filter((memory) => {
      const visibility = memory.metadata.visibility;

      switch (visibility) {
        case MemoryVisibility.Shared:
          return true;

        case MemoryVisibility.AgentPrivate:
          return memory.metadata.agent_id === requestingAgent.agentId;

        case MemoryVisibility.RolePrivate:
          return isSameRole(memory.metadata.agent_role, requestingAgent.role);

        case MemoryVisibility.CeoOnly:
          return isCeoOrManagementRole(requestingAgent.role);

        default:
          // Unknown visibility — safest default is to hide
          logger.warn(
            { visibility, memoryId: memory.id },
            "[CompanyMemoryGraph] Unknown memory visibility encountered; hiding by default",
          );
          return false;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Ranking algorithm
  // ---------------------------------------------------------------------------

  /**
   * Rank memories by a composite score that blends:
   *
   * 1. Semantic Relevance — base confidence/relevance score from the
   *    underlying vector store (agentmemory).  Weight: 1.0
   * 2. Author Role Similarity — boost when the memory author shares the
   *    same role as the requesting agent.  Boost: +0.25
   * 3. Recency — exponential decay boost based on memory age.
   *    Half-life: 7 days.  Max boost: +0.3
   *
   * The formula for each memory:
   *   score = (confidence * SEMANTIC_RELEVANCE_WEIGHT)
   *         + (sameRole ? SAME_ROLE_BOOST : 0)
   *         + recencyBoost
   *
   * Results are sorted descending by score.
   */
  private rankMemories(
    memories: RetrievedMemory[],
    _query: string,
    requestingAgent: AgentContext,
  ): ScoredMemory[] {
    const scored: ScoredMemory[] = memories.map((memory) => {
      // 1. Semantic relevance (from vector store)
      const baseConfidence =
        typeof memory.relevanceScore === "number"
          ? memory.relevanceScore
          : typeof memory.confidence === "number"
            ? memory.confidence
            : 0;
      const semanticScore = baseConfidence * SEMANTIC_RELEVANCE_WEIGHT;

      // 2. Role similarity boost
      const roleBoost = isSameRole(memory.metadata.agent_role, requestingAgent.role)
        ? SAME_ROLE_BOOST
        : 0;

      // 3. Recency boost
      const recencyBoost = computeRecencyBoost(memory.metadata.timestamp);

      const score = semanticScore + roleBoost + recencyBoost;

      return { ...memory, score };
    });

    // Sort descending by composite score
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  // ---------------------------------------------------------------------------
  // Breaking-change detection
  // ---------------------------------------------------------------------------

  /**
   * Heuristic detection of breaking-change memories based on content
   * keywords and memory type.  This is a lightweight filter that works
   * without requiring a dedicated MemoryType.breaking_change enum value.
   */
  private isBreakingChangeMemory(content: string, metadata: MemoryMetadata): boolean {
    if (metadata.memory_type === MemoryType.Architecture) {
      const breakingKeywords =
        /\b(breaking change|breaking_change|breaking-change|deprecated|removed|dropped|renamed|signature change|api v\d+\b|major version|incompatible|migration required)\b/gi;
      return breakingKeywords.test(content);
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Singleton export (optional — consumers may also instantiate directly)
// ---------------------------------------------------------------------------

let _globalGraph: CompanyMemoryGraph | null = null;

export function getCompanyMemoryGraph(memoryService: MemoryService): CompanyMemoryGraph {
  if (!_globalGraph) {
    _globalGraph = new CompanyMemoryGraph(memoryService);
  }
  return _globalGraph;
}

export function resetCompanyMemoryGraph(): void {
  _globalGraph = null;
}
