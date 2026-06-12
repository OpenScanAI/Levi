/**
 * Research Search Service (Stub)
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
  return 50; // Stub: return average score
}

export function filterSourcesByQuality(results: SearchResult[], minScore: number = 40): SearchResult[] {
  return results.filter(r => (r.qualityScore ?? 50) >= minScore);
}

export async function fetchPageContent(url: string): Promise<string> {
  return `Content from ${url}`; // Stub
}

export function createSearchProvider(type?: string, apiKey?: string): SearchProvider {
  return {
    async search(query: string, maxResults: number): Promise<SearchResult[]> {
      // Mock search results
      return [
        { title: `Result for ${query}`, url: `https://example.com/${encodeURIComponent(query)}`, snippet: `This is a sample result for ${query}`, domain: "example.com", qualityScore: 60 },
        { title: `Another result for ${query}`, url: `https://example.org/${encodeURIComponent(query)}`, snippet: `More information about ${query}`, domain: "example.org", qualityScore: 55 },
      ].slice(0, maxResults);
    }
  };
}
