const NAMESPACE_PREFIX = "levi";
const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

function sanitizeSegment(value: string, label: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }

  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!cleaned) {
    throw new Error(`${label} is invalid`);
  }

  return cleaned;
}

function assertSegment(value: string, label: string): void {
  if (!value || !SEGMENT_PATTERN.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

export function forCompany(companyId: string): string {
  const company = sanitizeSegment(companyId, "companyId");
  return `${NAMESPACE_PREFIX}:${company}`;
}

export function forProject(companyId: string, projectId: string): string {
  const project = sanitizeSegment(projectId, "projectId");
  return `${forCompany(companyId)}:${project}`;
}

export function forAgent(companyId: string, projectId: string, agentId: string): string {
  const agent = sanitizeSegment(agentId, "agentId");
  return `${forProject(companyId, projectId)}:${agent}`;
}

export function assertNamespaceBelongsToCompany(namespace: string, companyId: string): void {
  const prefix = forCompany(companyId);
  if (namespace !== prefix && !namespace.startsWith(`${prefix}:`)) {
    throw new Error("Namespace does not belong to company");
  }
}

export function namespaceIsForCompany(namespace: string, companyId: string): boolean {
  try {
    const prefix = forCompany(companyId);
    return namespace === prefix || namespace.startsWith(`${prefix}:`);
  } catch {
    return false;
  }
}

export function namespaceIsForProject(namespace: string, companyId: string, projectId: string): boolean {
  try {
    const prefix = forProject(companyId, projectId);
    return namespace === prefix || namespace.startsWith(`${prefix}:`);
  } catch {
    return false;
  }
}

export function parseNamespace(namespace: string): {
  prefix: string;
  companyId: string;
  projectId?: string;
  agentId?: string;
} {
  if (!namespace || namespace.trim().length === 0) {
    throw new Error("Namespace is required");
  }

  const parts = namespace.split(":");
  if (parts.length < 2 || parts.length > 4) {
    throw new Error("Invalid namespace format");
  }

  const [prefix, companyId, projectId, agentId] = parts;
  if (prefix !== NAMESPACE_PREFIX) {
    throw new Error("Invalid namespace prefix");
  }

  assertSegment(companyId, "companyId");
  if (projectId !== undefined) {
    assertSegment(projectId, "projectId");
  }
  if (agentId !== undefined) {
    assertSegment(agentId, "agentId");
  }

  return {
    prefix,
    companyId,
    projectId: projectId || undefined,
    agentId: agentId || undefined,
  };
}
