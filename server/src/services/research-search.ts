/**
 * Research Search Service
 *
 * Provides web search capabilities for the research engine.
 * Supports mock search provider (default when no API key).
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  qualityScore?: number;
}

export interface SearchProvider {
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}

export function scoreSourceQuality(result: SearchResult): number {
  const trustedDomains = [
    "edu",
    "gov",
    "org",
    "wikipedia.org",
    "arxiv.org",
    "github.com",
    "medium.com",
    "dev.to",
    "stackoverflow.com",
  ];
  const domain = result.domain?.toLowerCase() || "";
  let score = 50;

  for (const trusted of trustedDomains) {
    if (domain.includes(trusted)) {
      score += 20;
      break;
    }
  }

  if (result.snippet && result.snippet.length > 100) score += 10;
  if (result.title && result.title.length > 20) score += 10;

  return Math.min(100, score);
}

export function filterSourcesByQuality(results: SearchResult[], minScore: number = 30): SearchResult[] {
  return results
    .map((r) => ({ ...r, qualityScore: r.qualityScore ?? scoreSourceQuality(r) }))
    .filter((r) => (r.qualityScore || 0) >= minScore)
    .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
}

export async function fetchPageContent(url: string): Promise<string> {
  // Stub: In production, this would fetch and parse the page
  return `Content from ${url}`;
}

class MockSearchProvider implements SearchProvider {
  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const results: SearchResult[] = [
      {
        title: `Understanding ${query}`,
        url: `https://example.com/understanding-${query.replace(/\s+/g, "-")}`,
        snippet: `A comprehensive guide to understanding ${query}, covering fundamental concepts and key principles.`,
        domain: "example.com",
      },
      {
        title: `${query} - Wikipedia`,
        url: `https://en.wikipedia.org/wiki/${query.replace(/\s+/g, "_")}`,
        snippet: `Wikipedia article about ${query} covering history, development, and current state.`,
        domain: "wikipedia.org",
      },
      {
        title: `Latest Research on ${query}`,
        url: `https://research.edu/${query.replace(/\s+/g, "-")}`,
        snippet: `Recent academic research and studies related to ${query}, published in peer-reviewed journals.`,
        domain: "research.edu",
      },
      {
        title: `${query} Best Practices`,
        url: `https://dev.to/${query.replace(/\s+/g, "-")}-best-practices`,
        snippet: `Industry best practices and recommendations for working with ${query}.`,
        domain: "dev.to",
      },
      {
        title: `${query} Trends ${new Date().getFullYear()}`,
        url: `https://news.example.com/${query.replace(/\s+/g, "-")}-trends`,
        snippet: `Current trends and developments in ${query} for ${new Date().getFullYear()}.`,
        domain: "news.example.com",
      },
    ];

    return results.slice(0, maxResults).map((r) => ({
      ...r,
      qualityScore: scoreSourceQuality(r),
    }));
  }
}

class SerperSearchProvider implements SearchProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    // In production, this would call the Serper API
    console.log(`[Serper] Searching: ${query}`);
    return new MockSearchProvider().search(query, maxResults);
  }
}

class SemanticScholarProvider implements SearchProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    // In production, this would call the Semantic Scholar API
    console.log(`[Semantic Scholar] Searching: ${query}`);
    return new MockSearchProvider().search(query, maxResults);
  }
}

export function createSearchProvider(
  providerType: string | undefined,
  apiKey: string | undefined
): SearchProvider {
  if (providerType === "serper" && apiKey) {
    return new SerperSearchProvider(apiKey);
  }
  if (providerType === "semantic-scholar" && apiKey) {
    return new SemanticScholarProvider(apiKey);
  }
  return new MockSearchProvider();
}
