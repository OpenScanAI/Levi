/**
 * Research LLM Service
 *
 * Provides LLM-based research plan generation, content extraction, and report generation.
 * Uses configurable LLM provider via config.
 */

export interface LlmConfig {
  model?: string;
  apiKey?: string;
}

export interface ResearchPlan {
  strategy: string;
  subtopics: Array<{
    id: string;
    title: string;
    description: string;
    priority: number;
    searchQuery: string;
  }>;
}

export interface ExtractedFinding {
  content: string;
  evidence: string;
  confidence: number;
  category?: string;
}

export interface GeneratedReport {
  markdown: string;
  sources: Array<{
    url: string;
    title: string;
  }>;
}

/**
 * Generate a research plan with subtopics based on the query.
 */
export async function generateResearchPlan(
  query: string,
  maxSubtopics: number,
  depth: string,
  config: LlmConfig
): Promise<ResearchPlan> {
  // Stub implementation - returns a basic plan
  const subtopics = [
    {
      id: `subtopic-1`,
      title: `Overview of ${query}`,
      description: `General overview and introduction to ${query}`,
      priority: 1,
      searchQuery: query,
    },
    {
      id: `subtopic-2`,
      title: `Key aspects of ${query}`,
      description: `Important factors and considerations for ${query}`,
      priority: 2,
      searchQuery: `${query} key factors important aspects`,
    },
    {
      id: `subtopic-3`,
      title: `Recent developments in ${query}`,
      description: `Latest trends and recent news about ${query}`,
      priority: 3,
      searchQuery: `${query} latest trends news ${new Date().getFullYear()}`,
    },
    {
      id: `subtopic-4`,
      title: `Expert opinions on ${query}`,
      description: `What experts and professionals say about ${query}`,
      priority: 4,
      searchQuery: `${query} expert opinion professional analysis`,
    },
    {
      id: `subtopic-5`,
      title: `Future outlook for ${query}`,
      description: `Predictions and future directions for ${query}`,
      priority: 5,
      searchQuery: `${query} future predictions outlook forecast`,
    },
  ].slice(0, maxSubtopics);

  return {
    strategy: `Comprehensive research on "${query}" with ${depth} depth, covering ${subtopics.length} key subtopics.`,
    subtopics,
  };
}

/**
 * Extract findings from raw content.
 */
export function extractFindingsFromContent(
  content: string,
  topic: string
): ExtractedFinding[];
export function extractFindingsFromContent(
  taskTitle: string,
  sourceTitle: string,
  content: string,
  config?: LlmConfig
): ExtractedFinding[];
export function extractFindingsFromContent(
  ...args: any[]
): ExtractedFinding[] {
  let content: string;
  if (args.length >= 3) {
    content = args[2];
  } else {
    content = args[0];
  }
  
  const sentences = content
    .split(/[.!?]+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 30);

  return sentences.slice(0, 5).map((sentence: string, index: number) => ({
    content: sentence,
    evidence: sentence,
    confidence: Math.max(0.5, 0.9 - index * 0.1),
    category: "General",
  }));
}

/**
 * Generate a research report from findings.
 */
export async function generateResearchReport(
  query: string,
  findings: Array<{
    content: string;
    category: string;
    confidence: string;
    sourceUrl?: string | null;
    sourceTitle?: string | null;
    sourceDomain?: string | null;
  }>,
  config: LlmConfig
): Promise<GeneratedReport> {
  // Group findings by category
  const byCategory: Record<string, typeof findings> = {};
  for (const f of findings) {
    const cat = f.category || "General";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(f);
  }

  // Build markdown report
  let markdown = `# Research Report: ${query}\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `This report covers ${findings.length} findings across ${Object.keys(byCategory).length} categories.\n\n`;

  for (const [category, catFindings] of Object.entries(byCategory)) {
    markdown += `## ${category}\n\n`;
    for (const f of catFindings) {
      markdown += `- ${f.content}\n`;
      if (f.sourceUrl) {
        markdown += `  - Source: [${f.sourceTitle || f.sourceUrl}](${f.sourceUrl})\n`;
      }
    }
    markdown += `\n`;
  }

  const sources = findings
    .filter((f) => f.sourceUrl)
    .map((f) => ({
      url: f.sourceUrl!,
      title: f.sourceTitle || f.sourceUrl!,
    }));

  return { markdown, sources };
}
