export enum MemoryType {
  Decision = "decision",
  Error = "error",
  CodeChange = "code_change",
  Architecture = "architecture",
  Preference = "preference",
  Discussion = "discussion",
}

export enum MemoryVisibility {
  Shared = "shared",
  RolePrivate = "role_private",
  AgentPrivate = "agent_private",
  CeoOnly = "ceo_only",
}

export interface MemoryMetadata {
  company_id: string;
  project_id: string;
  agent_id: string;
  task_id: string;
  goal_ancestry: string[];
  agent_role: string;
  timestamp: string;
  run_id: string;
  cost: number;
  memory_type: MemoryType;
  visibility: MemoryVisibility;
}

export interface Memory {
  id?: string;
  content: string;
  metadata: MemoryMetadata;
  namespace: string;
  confidence?: number;
}

export interface StoreMemoryInput {
  content: string;
  metadata: MemoryMetadata;
  visibility?: MemoryVisibility;
}

export interface RetrievedMemory {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  namespace: string;
  confidence: number;
  relevanceScore?: number;
}

export interface MemoryQueryOptions {
  query: string;
  company_id: string;
  project_id: string;
  agent_id: string;
  agent_role: string;
  topK?: number;
  memory_type?: MemoryType;
  visibility_filter?: MemoryVisibility[];
}

export interface AgentMemoryObservation {
  id: string;
  content: string;
  namespace: string;
  metadata: MemoryMetadata;
  confidence: number;
  created_at: string;
}

const MEMORY_TYPE_VALUES = new Set<string>(Object.values(MemoryType));
const MEMORY_VISIBILITY_VALUES = new Set<string>(Object.values(MemoryVisibility));

export function isValidMemoryType(value: unknown): value is MemoryType {
  return typeof value === "string" && MEMORY_TYPE_VALUES.has(value);
}

export function isValidVisibility(value: unknown): value is MemoryVisibility {
  return typeof value === "string" && MEMORY_VISIBILITY_VALUES.has(value);
}

export function assertValidMemoryType(value: unknown): asserts value is MemoryType {
  if (!isValidMemoryType(value)) {
    throw new Error(`Invalid memory type: ${String(value)}`);
  }
}
