/**
 * Research LLM Service
 *
 * Supports OpenAI, Groq, and other OpenAI-compatible APIs.
 * Uses native fetch() — no external SDK dependency.
 */

const OPENAI_API_BASE = "https://api.openai.com/v1";
const GROQ_API_BASE = "https://api.groq.com/openai/v1";
const LLM_TIMEOUT_MS = 60_000;

function getApiBase(): string {
  if (process.env.GROQ_API_KEY?.trim()) return GROQ_API_BASE;
  return OPENAI_API_BASE;
}

function getDefaultModel(): string {
  if (process.env.GROQ_API_KEY?.trim()) return "llama-3.2-90b-vision-preview";
  return "gpt-4o-mini";
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
}

export interface LlmCompletionResult {
  text: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

function getAuthHeaders(apiKey?: string): Record<string, string> {
  const key = apiKey || process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || process.env.PAPERCLIP_RESEARCH_LLM_API_KEY?.trim();
  if (!key) {
    throw new Error("No LLM API key configured. Set GROQ_API_KEY, OPENAI_API_KEY, or PAPERCLIP_RESEARCH_LLM_API_KEY.");
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function hasApiKey(apiKey?: string): boolean {
  return !!(apiKey || process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || process.env.PAPERCLIP_RESEARCH_LLM_API_KEY?.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Security: Sanitize user input before including in LLM prompts
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeForPrompt(input: string): string {
  let sanitized = input
    .replace(/\{\s*"role"\s*:\s*"system"\s*\}/gi, "")
    .replace(/ignore\s+(previous|above|all)\s+instructions/gi, "")
    .replace(/disregard\s+(previous|above|all)\s+instructions/gi, "")
    .replace(/forget\s+(previous|above|all)\s+instructions/gi, "")
    .replace(/<\|im_start\|>/gi, "")
    .replace(/<\|im_end\|>/gi, "")
    .replace(/\[SYSTEM\]/gi, "")
    .replace(/\[INST\]/gi, "")
    .replace(/\[\/INST\]/gi, "")
    .replace(/<<SYS>>/gi, "")
    .replace(/<\/SYS>>/gi, "")
    .replace(/\n{5,}/g, "\n\n\n")
    .trim();

  const MAX_PROMPT_INPUT_LENGTH = 3000;
  if (sanitized.length > MAX_PROMPT_INPUT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_PROMPT_INPUT_LENGTH) + "...";
  }
  return sanitized;
}

async function fetchCompletion(
  messages: LlmMessage[],
  opts: LlmCompletionOptions = {},
): Promise<LlmCompletionResult> {
  const model = opts.model || "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: "POST",
      headers: getAuthHeaders(opts.apiKey),
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 2048,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const text = data.choices[0]?.message?.content?.trim() ?? "";
    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined;

    return { text, usage };
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Research-specific LLM prompts
// ─────────────────────────────────────────────────────────────────────────────

export async function generateResearchPlan(
  query: string,
  maxSubtopics: number,
  depth: string,
  opts?: LlmCompletionOptions,
): Promise<{ strategy: string; subtopics: Array<{ id: string; title: string; description: string; priority: number }> }> {
  // Mock mode: return fallback subtopics without calling LLM
  if (!hasApiKey(opts?.apiKey)) {
    return {
      strategy: `Research on: ${query}`,
      subtopics: generateFallbackSubtopics(query, maxSubtopics),
    };
  }

  const systemPrompt = `You are a research planning assistant. Given a user query, generate a structured research plan.

Respond ONLY with valid JSON in this exact format:
{
  "strategy": "Brief overview of research approach (1-2 sentences)",
  "subtopics": [
    { "id": "subtopic-1", "title": "Concise subtopic title", "description": "What to research for this subtopic (1 sentence)", "priority": 1 }
  ]
}

Rules:
- Generate 3 to ${maxSubtopics} subtopics based on depth: ${depth}
- shallow = 3 subtopics, medium = 4-5, deep = 5-7
- Each subtopic must have a unique id like "subtopic-1", "subtopic-2", etc.
- Priorities should be 1 (highest) to N (lowest)
- Keep titles under 60 characters
- Descriptions under 120 characters`;

  const result = await fetchCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Research query: "${sanitizeForPrompt(query)}"` },
    ],
    { ...opts, temperature: 0.5, maxTokens: 1500 },
  );

  try {
    const parsed = JSON.parse(result.text) as {
      strategy: string;
      subtopics: Array<{ id: string; title: string; description: string; priority: number }>;
    };

    // Validate and sanitize
    const subtopics = (parsed.subtopics || [])
      .slice(0, maxSubtopics)
      .map((s, idx) => ({
        id: s.id || `subtopic-${idx + 1}`,
        title: (s.title || `Subtopic ${idx + 1}`).slice(0, 60),
        description: (s.description || "").slice(0, 120),
        priority: typeof s.priority === "number" ? s.priority : idx + 1,
      }));

    return {
      strategy: (parsed.strategy || `Research on: ${query}`).slice(0, 300),
      subtopics: subtopics.length > 0 ? subtopics : generateFallbackSubtopics(query, maxSubtopics),
    };
  } catch {
    // Fallback if LLM returns invalid JSON
    return {
      strategy: `Research on: ${query}`,
      subtopics: generateFallbackSubtopics(query, maxSubtopics),
    };
  }
}

export async function extractFindingsFromContent(
  subtopicTitle: string,
  sourceTitle: string,
  sourceSnippet: string,
  opts?: LlmCompletionOptions,
): Promise<Array<{ content: string; confidence: "high" | "medium" | "low"; category: string }>> {
  // Mock mode: generate topic-aware findings from the snippet
  if (!hasApiKey(opts?.apiKey)) {
    const category = detectFindingCategory(subtopicTitle, sourceSnippet);
    // Generate 1-2 findings based on the actual snippet content
    const findings: Array<{ content: string; confidence: "high" | "medium" | "low"; category: string }> = [];

    // First finding: direct insight from the snippet
    if (sourceSnippet.length > 30) {
      findings.push({
        content: sourceSnippet.slice(0, 280) + (sourceSnippet.length > 280 ? "..." : ""),
        confidence: "high",
        category,
      });
    }

    // Second finding: inferred implication if snippet is substantial
    if (sourceSnippet.length > 100) {
      const sentences = sourceSnippet.split(/[.!?]+/).filter(s => s.trim().length > 20);
      if (sentences.length > 1) {
        findings.push({
          content: sentences[1].trim().slice(0, 280) + (sentences[1].length > 280 ? "..." : ""),
          confidence: "medium",
          category,
        });
      }
    }

    return findings.length > 0 ? findings : [
      {
        content: `Relevant information about ${subtopicTitle}: ${sourceSnippet.slice(0, 200)}`,
        confidence: "medium",
        category,
      },
    ];
  }

  const systemPrompt = `You are a research analyst. Extract key findings from the provided source content for a given subtopic.

Respond ONLY with valid JSON in this exact format:
{
  "findings": [
    { "content": "Specific finding statement", "confidence": "high|medium|low", "category": "Category name" }
  ]
}

Rules:
- Extract 1-3 concrete findings
- Each finding must be a specific, factual statement
- Confidence: high = directly stated fact, medium = inferred but likely, low = speculative
- Category should be a short label like "Overview", "Best Practices", "Performance", "Security", etc.
- If no useful findings, return empty findings array`;

  const userContent = `Subtopic: ${sanitizeForPrompt(subtopicTitle)}
Source: ${sanitizeForPrompt(sourceTitle)}
Content: ${sanitizeForPrompt(sourceSnippet).slice(0, 4000)}`;

  try {
    const result = await fetchCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      { ...opts, temperature: 0.3, maxTokens: 1200 },
    );

    const parsed = JSON.parse(result.text) as {
      findings: Array<{ content: string; confidence: string; category: string }>;
    };

    return (parsed.findings || [])
      .filter((f) => f.content && f.content.length > 10)
      .map((f) => ({
        content: f.content.slice(0, 500),
        confidence: ["high", "medium", "low"].includes(f.confidence) ? (f.confidence as "high" | "medium" | "low") : "medium",
        category: (f.category || "General").slice(0, 50),
      }));
  } catch {
    // Fallback: create a single finding from the snippet
    return [
      {
        content: `Relevant information found: ${sourceSnippet.slice(0, 300)}`,
        confidence: "medium",
        category: "General",
      },
    ];
  }
}

export interface ReportSource {
  index: number;
  url: string;
  title: string;
  domain: string;
}

export interface ReportFinding {
  content: string;
  category: string;
  confidence: string;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceDomain?: string | null;
}

export interface GeneratedReport {
  markdown: string;
  sources: ReportSource[];
}

export async function generateResearchReport(
  query: string,
  findings: ReportFinding[],
  opts?: LlmCompletionOptions,
): Promise<GeneratedReport> {
  // Build unique source list with stable indices
  const sourceMap = new Map<string, ReportSource>();
  for (const f of findings) {
    const url = f.sourceUrl || "";
    if (url && !sourceMap.has(url)) {
      sourceMap.set(url, {
        index: sourceMap.size + 1,
        url,
        title: f.sourceTitle || url,
        domain: f.sourceDomain || "",
      });
    }
  }
  const sources = Array.from(sourceMap.values()).sort((a, b) => a.index - b.index);

  // Mock mode: generate simple markdown report from findings with citations
  if (!hasApiKey(opts?.apiKey)) {
    const byCategory = new Map<string, string[]>();
    for (const f of findings) {
      const cat = f.category || "General";
      const list = byCategory.get(cat) || [];
      const citation = f.sourceUrl && sourceMap.has(f.sourceUrl)
        ? ` [${sourceMap.get(f.sourceUrl)!.index}]`
        : "";
      list.push(`- ${f.content}${citation}`);
      byCategory.set(cat, list);
    }

    let report = `# Research Report: ${query}\n\n`;
    report += `## Executive Summary\n\nThis report summarizes findings from automated research on "${query}".\n\n`;
    for (const [category, items] of byCategory) {
      report += `## ${category}\n\n${items.join("\n")}\n\n`;
    }
    if (sources.length > 0) {
      report += `## Sources\n\n`;
      for (const s of sources) {
        report += `${s.index}. ${s.title} (${s.domain})\n   <${s.url}>\n\n`;
      }
    }
    report += `---\n\n*Generated by Paperclip Research Engine*\n`;
    return { markdown: report, sources };
  }

  const systemPrompt = `You are a research report writer. Create a structured Markdown report from the provided findings.

Rules:
- Use clear Markdown formatting with headers
- Organize by category
- Include a brief executive summary
- Cite confidence levels where relevant
- Include source citations as [1], [2], etc. inline with findings
- Add a "Sources" section at the end listing all cited sources with their numbers
- Keep the report concise but comprehensive`;

  const findingsText = findings
    .map((f, i) => {
      const citation = f.sourceUrl && sourceMap.has(f.sourceUrl)
        ? ` [${sourceMap.get(f.sourceUrl)!.index}]`
        : "";
      return `${i + 1}. [${f.confidence.toUpperCase()}] ${f.category}: ${f.content}${citation}`;
    })
    .join("\n");

  const sourcesText = sources.length > 0
    ? `\n\nSources:\n${sources.map((s) => `[${s.index}] ${s.title} (${s.domain}) - ${s.url}`).join("\n")}`
    : "";

  try {
    const result = await fetchCompletion(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Query: ${sanitizeForPrompt(query)}\n\nFindings:\n${findingsText}${sourcesText}\n\nGenerate a Markdown research report with inline citations [1], [2], etc. and a Sources section at the end.`,
        },
      ],
      { ...opts, temperature: 0.4, maxTokens: 3000 },
    );

    const markdown = result.text || `# Research Report: ${query}\n\nNo findings available.`;
    return { markdown, sources };
  } catch {
    // Fallback: simple markdown from findings with citations
    const byCategory = new Map<string, string[]>();
    for (const f of findings) {
      const cat = f.category || "General";
      const list = byCategory.get(cat) || [];
      const citation = f.sourceUrl && sourceMap.has(f.sourceUrl)
        ? ` [${sourceMap.get(f.sourceUrl)!.index}]`
        : "";
      list.push(`- ${f.content}${citation}`);
      byCategory.set(cat, list);
    }

    let report = `# Research Report: ${query}\n\n`;
    for (const [category, items] of byCategory) {
      report += `## ${category}\n\n${items.join("\n")}\n\n`;
    }
    if (sources.length > 0) {
      report += `## Sources\n\n`;
      for (const s of sources) {
        report += `${s.index}. ${s.title} (${s.domain})\n   <${s.url}>\n\n`;
      }
    }
    return { markdown: report, sources };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectFindingCategory(subtopicTitle: string, sourceSnippet: string): string {
  const text = (subtopicTitle + " " + sourceSnippet).toLowerCase();

  if (/\b(ingredient|component|element|composition|material|substance|flavor compound|spice|herb|seasoning|sauce|dough|cheese|meat|vegetable|fruit|oil|salt|sugar|yeast|flour|water)\b/.test(text)) return "Ingredients";
  if (/\b(technique|method|preparation|cooking|baking|grilling|roasting|frying|boiling|steaming|temperature|timing|process|step|recipe|instruction)\b/.test(text)) return "Techniques";
  if (/\b(science|chemistry|molecular|maillard|reaction|compound|sensory|taste|flavor|aroma|texture|umami|sweet|sour|bitter|salty)\b/.test(text)) return "Science";
  if (/\b(regional|cultural|cuisine|style|variation|tradition|italian|french|asian|mediterranean|local|authentic|heritage)\b/.test(text)) return "Cultural Variations";
  if (/\b(tip|recommendation|expert|chef|secret|advice|guide|professional|master|perfect|best|optimal|ideal)\b/.test(text)) return "Expert Advice";
  if (/\b(mistake|error|pitfall|avoid|fix|troubleshoot|problem|issue|fail|common|wrong|bad|overcook|undercook|burn)\b/.test(text)) return "Common Mistakes";
  if (/\b(health|nutrition|calorie|vitamin|protein|fat|carb|diet|wellness|benefit|risk|allerg|intolerance)\b/.test(text)) return "Health & Nutrition";
  if (/\b(software|code|programming|api|developer|app|web|cloud|database|server|framework|tech|computer|algorithm|system|architecture)\b/.test(text)) return "Technology";
  if (/\b(security|vulnerability|authentication|authorization|encryption|threat|attack|breach|protection|privacy)\b/.test(text)) return "Security";
  if (/\b(performance|speed|latency|throughput|scalability|optimization|benchmark|efficiency|load|cache)\b/.test(text)) return "Performance";
  if (/\b(business|market|finance|revenue|profit|strategy|customer|sales|marketing|invest|startup|company|growth)\b/.test(text)) return "Business";
  if (/\b(education|learn|student|course|study|teach|school|university|training|curriculum|academic|certification)\b/.test(text)) return "Education";

  return "General";
}

function detectDomain(query: string): "food" | "technology" | "health" | "business" | "education" | "general" {
  const q = query.toLowerCase();
  if (/\b(pizza|food|cook|recipe|tasty|flavor|ingredient|dish|meal|cuisine|bake|grill|restaurant|chef|spice|taste)\b/.test(q)) return "food";
  if (/\b(software|api|code|programming|developer|app|web|cloud|database|server|framework|language|tech|computer|ai|ml|algorithm|security|performance)\b/.test(q)) return "technology";
  if (/\b(health|medical|disease|treatment|medicine|doctor|fitness|exercise|nutrition|wellness|mental|therapy|symptom|diagnosis)\b/.test(q)) return "health";
  if (/\b(business|market|finance|invest|startup|company|revenue|profit|strategy|customer|sales|marketing|economy|stock|entrepreneur)\b/.test(q)) return "business";
  if (/\b(education|learn|student|school|university|course|teach|study|academic|degree|classroom|curriculum|training)\b/.test(q)) return "education";
  return "general";
}

function generateFallbackSubtopics(query: string, maxSubtopics: number): Array<{ id: string; title: string; description: string; priority: number }> {
  const words = query.split(/\s+/).filter((w) => w.length > 2 && !/^(what|why|how|when|where|who|is|are|does|do|the|a|an|to|of|in|on|at|for|with|about|makes|make)$/i.test(w));
  const mainTopic = words.slice(0, 3).join(" ") || query.replace(/\?$/, "").trim();
  const domain = detectDomain(query);

  const domainTemplates: Record<string, Array<{ title: string; description: string }>> = {
    food: [
      { title: `Key Ingredients and Components of ${mainTopic}`, description: `Essential elements that define and enhance ${mainTopic}` },
      { title: `Preparation Techniques and Methods`, description: `How different cooking and preparation methods affect the outcome` },
      { title: `Regional and Cultural Variations`, description: `How ${mainTopic} differs across cuisines and cultures` },
      { title: `Science Behind the Flavor`, description: `Chemical and sensory factors that create the distinctive taste` },
      { title: `Expert Tips and Recommendations`, description: `Professional advice for achieving the best results` },
      { title: `Common Mistakes to Avoid`, description: `Pitfalls that reduce quality and how to prevent them` },
      { title: `Comparisons and Alternatives`, description: `How ${mainTopic} compares to similar options` },
    ],
    technology: [
      { title: `Overview of ${mainTopic}`, description: `Introduction and core concepts related to ${mainTopic}` },
      { title: `Best Practices`, description: `Recommended approaches and industry standards` },
      { title: `Common Challenges`, description: `Known issues and limitations` },
      { title: `Performance Considerations`, description: `Optimization techniques and benchmarks` },
      { title: `Security Implications`, description: `Security concerns and mitigation strategies` },
      { title: `Integration Patterns`, description: `How to integrate with existing systems` },
      { title: `Future Trends`, description: `Emerging developments and predictions` },
    ],
    health: [
      { title: `Overview of ${mainTopic}`, description: `Key facts and background about ${mainTopic}` },
      { title: `Causes and Risk Factors`, description: `What contributes to or increases the likelihood of ${mainTopic}` },
      { title: `Symptoms and Diagnosis`, description: `How to recognize and identify ${mainTopic}` },
      { title: `Treatment and Management`, description: `Approaches to address or improve ${mainTopic}` },
      { title: `Prevention Strategies`, description: `Steps to reduce risk or avoid ${mainTopic}` },
      { title: `Latest Research and Findings`, description: `Recent studies and emerging evidence` },
      { title: `Expert Recommendations`, description: `Guidelines from health professionals` },
    ],
    business: [
      { title: `Market Overview of ${mainTopic}`, description: `Current landscape and key players in ${mainTopic}` },
      { title: `Strategies and Best Practices`, description: `Proven approaches for success` },
      { title: `Challenges and Risks`, description: `Obstacles and potential downsides` },
      { title: `Financial Considerations`, description: `Costs, revenue models, and ROI factors` },
      { title: `Competitive Analysis`, description: `How different approaches compare` },
      { title: `Implementation Steps`, description: `Practical guide to execution` },
      { title: `Future Outlook`, description: `Predictions and emerging opportunities` },
    ],
    education: [
      { title: `Overview of ${mainTopic}`, description: `Key concepts and fundamentals` },
      { title: `Learning Methods and Approaches`, description: `Different ways to study and master ${mainTopic}` },
      { title: `Challenges and Barriers`, description: `Common difficulties learners face` },
      { title: `Tools and Resources`, description: `Platforms, materials, and aids for learning` },
      { title: `Assessment and Measurement`, description: `How to evaluate progress and outcomes` },
      { title: `Expert Recommendations`, description: `Advice from educators and professionals` },
      { title: `Future Trends`, description: `How ${mainTopic} is evolving in education` },
    ],
    general: [
      { title: `Overview of ${mainTopic}`, description: `Introduction and key concepts related to ${mainTopic}` },
      { title: `Key Factors and Influences`, description: `Important elements that shape ${mainTopic}` },
      { title: `Common Challenges`, description: `Difficulties and obstacles related to ${mainTopic}` },
      { title: `Best Practices and Recommendations`, description: `Expert advice and proven approaches` },
      { title: `Comparisons and Alternatives`, description: `How ${mainTopic} compares to related topics` },
      { title: `Practical Applications`, description: `Real-world uses and implementations` },
      { title: `Future Developments`, description: `Emerging trends and predictions` },
    ],
  };

  const templates = domainTemplates[domain] || domainTemplates.general;

  return templates.slice(0, maxSubtopics).map((t, i) => ({
    id: `subtopic-${i + 1}`,
    title: t.title,
    description: t.description,
    priority: i + 1,
  }));
}
