/**
 * Research Search Service
 *
 * Provides web search capabilities for the research engine.
 * Supports two providers:
 *   - Mock: Returns synthetic results (default when no API key)
 *   - Serper: Real web search via Serper.dev API
 */

const SERPER_API_URL = "https://google.serper.dev/search";
const SEARCH_TIMEOUT_MS = 15_000;

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

// ─────────────────────────────────────────────────────────────────────────────
// Source Quality Scoring
// ─────────────────────────────────────────────────────────────────────────────

interface DomainTier {
  tier: 1 | 2 | 3 | 4 | 5;
  label: string;
}

const HIGH_QUALITY_DOMAINS = new Set([
  // Academic
  "edu", "ac.uk", "arxiv.org", "semanticscholar.org", "pubmed.ncbi.nlm.nih.gov",
  // Government
  "gov", "gc.ca", "europa.eu",
  // Major publications
  "nature.com", "science.org", "ieee.org", "acm.org", "springer.com",
  "nejm.org", "thelancet.com", "bmj.com", "jamanetwork.com",
  // Tech reference
  "docs.microsoft.com", "learn.microsoft.com", "developer.mozilla.org",
  "docs.python.org", "docs.oracle.com", "docs.aws.amazon.com",
  "cloud.google.com", "kubernetes.io", "docker.com",
  // News / reputable
  "reuters.com", "apnews.com", "bloomberg.com", "economist.com",
  "ft.com", "wsj.com", "nytimes.com", "washingtonpost.com",
  "bbc.com", "theguardian.com",
  // Reference
  "wikipedia.org", "britannica.com", "mayoclinic.org", "who.int",
  // Industry
  "github.com", "stackoverflow.com", "medium.com", "substack.com",
]);

const MEDIUM_QUALITY_PATTERNS = [
  // Known blog platforms with editorial oversight
  /\b(techcrunch\.com|theverge\.com|wired\.com|arstechnica\.com|engadget\.com)\b/,
  /\b(forbes\.com|harvard\.edu|mit\.edu|stanford\.edu)\b/,
  /\b(nih\.gov|cdc\.gov|fda\.gov|epa\.gov)\b/,
];

const LOW_QUALITY_PATTERNS = [
  // Forums, Q&A, social
  /\b(reddit\.com|quora\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com)\b/,
  /\b(youtube\.com|tiktok\.com|instagram\.com)\b/,
  // Generic content farms
  /\b(wikihow\.com|ezinearticles\.com|hubpages\.com)\b/,
];

function getDomainTier(domain: string): DomainTier {
  const lower = domain.toLowerCase();

  if (HIGH_QUALITY_DOMAINS.has(lower)) {
    return { tier: 1, label: "excellent" };
  }

  for (const pattern of MEDIUM_QUALITY_PATTERNS) {
    if (pattern.test(lower)) {
      return { tier: 2, label: "good" };
    }
  }

  for (const pattern of LOW_QUALITY_PATTERNS) {
    if (pattern.test(lower)) {
      return { tier: 4, label: "low" };
    }
  }

  // Default: unknown but not explicitly bad
  return { tier: 3, label: "average" };
}

export function scoreSourceQuality(result: SearchResult): number {
  const domainTier = getDomainTier(result.domain);

  // Base score from domain tier (1-5 scale inverted to 100-20)
  let score = 100 - (domainTier.tier - 1) * 20;

  // Bonus for content richness
  const snippetLength = result.snippet?.length ?? 0;
  if (snippetLength > 300) score += 5;
  if (snippetLength > 500) score += 5;

  // Penalty for very short snippets
  if (snippetLength < 50) score -= 10;

  // Penalty for generic titles
  const title = result.title?.toLowerCase() ?? "";
  if (title.includes("untitled") || title.includes("404") || title.includes("error")) {
    score -= 20;
  }

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

export function filterSourcesByQuality(
  results: SearchResult[],
  minScore: number = 40
): SearchResult[] {
  const scored = results.map((r) => ({
    ...r,
    qualityScore: scoreSourceQuality(r),
  }));

  // Sort by quality descending
  scored.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));

  // Filter out low-quality
  return scored.filter((r) => (r.qualityScore ?? 0) >= minScore);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Search Provider (default, no API key required)
// ─────────────────────────────────────────────────────────────────────────────

export class MockSearchProvider implements SearchProvider {
  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const domain = detectSearchDomain(query);
    const results = generateMockSearchResults(query, domain);

    // Deterministic shuffle based on query to vary results per query
    const shuffled = [...results].sort((a, b) => {
      const hashA = hashString(query + a.domain);
      const hashB = hashString(query + b.domain);
      return hashA - hashB;
    });

    return shuffled.slice(0, Math.min(maxResults, results.length));
  }
}

function detectSearchDomain(query: string): "food" | "technology" | "health" | "business" | "education" | "general" {
  const q = query.toLowerCase();
  if (/\b(pizza|food|cook|recipe|tasty|flavor|ingredient|dish|meal|cuisine|bake|grill|restaurant|chef|spice|taste|bread|dough|sauce|cheese|meat|vegetable|fruit|wine|drink|beverage|dessert|sweet|savory|grill|roast|fry|boil|steam|season|marinate|serve|plate|dining)\b/.test(q)) return "food";
  if (/\b(software|api|code|programming|developer|app|web|cloud|database|server|framework|language|tech|computer|ai|ml|algorithm|security|performance|hardware|network|devops|frontend|backend|fullstack|git|docker|kubernetes|javascript|python|typescript|react|node)\b/.test(q)) return "technology";
  if (/\b(health|medical|disease|treatment|medicine|doctor|fitness|exercise|nutrition|wellness|mental|therapy|symptom|diagnosis|patient|hospital|clinic|vaccine|immune|chronic|acute|prevention|lifestyle|diet|workout|gym|yoga|meditation)\b/.test(q)) return "health";
  if (/\b(business|market|finance|invest|startup|company|revenue|profit|strategy|customer|sales|marketing|economy|stock|entrepreneur|management|leadership|operations|supply|demand|growth|scaling|funding|venture|capital|ipo|merger|acquisition)\b/.test(q)) return "business";
  if (/\b(education|learn|student|school|university|course|teach|study|academic|degree|classroom|curriculum|training|certification|diploma|scholarship|tuition|lecture|seminar|workshop|e-learning|mooc|textbook|exam|grade|enrollment)\b/.test(q)) return "education";
  return "general";
}

function getDomainSearchTemplates(mainTopic: string, domain: string): SearchResult[] {
  const slug = mainTopic.replace(/\s+/g, "-");

  const foodTemplates: SearchResult[] = [
    {
      title: `${mainTopic} - Essential Guide`,
      url: `https://foodguide.com/${slug}`,
      snippet: `A comprehensive guide to ${mainTopic}. Covers key ingredients, preparation methods, and expert tips for achieving the best flavor and texture.`,
      domain: "foodguide.com",
    },
    {
      title: `The Science Behind ${mainTopic}`,
      url: `https://culinaryscience.org/${slug}-science`,
      snippet: `Explore the chemistry and sensory science that makes ${mainTopic} special. From Maillard reactions to flavor compounds, understand what happens at the molecular level.`,
      domain: "culinaryscience.org",
    },
    {
      title: `${mainTopic} Recipes and Variations`,
      url: `https://recipes.com/${slug}-variations`,
      snippet: `Discover popular recipes and regional variations of ${mainTopic}. Includes step-by-step instructions, ingredient substitutions, and serving suggestions.`,
      domain: "recipes.com",
    },
    {
      title: `Expert Tips for Perfect ${mainTopic}`,
      url: `https://chefsecrets.com/${slug}-tips`,
      snippet: `Professional chefs share their secrets for making exceptional ${mainTopic}. Learn about temperature control, timing, seasoning, and presentation techniques.`,
      domain: "chefsecrets.com",
    },
    {
      title: `${mainTopic} - Common Mistakes to Avoid`,
      url: `https://kitchenfixes.com/${slug}-mistakes`,
      snippet: `Avoid the most common pitfalls when preparing ${mainTopic}. Troubleshooting guide for texture, flavor, and appearance issues with practical solutions.`,
      domain: "kitchenfixes.com",
    },
    {
      title: `Regional Styles of ${mainTopic}`,
      url: `https://worldcuisine.com/${slug}-regional`,
      snippet: `How ${mainTopic} differs across cultures and regions. From traditional methods to modern interpretations, explore the diversity of approaches worldwide.`,
      domain: "worldcuisine.com",
    },
    {
      title: `${mainTopic} Ingredient Deep Dive`,
      url: `https://ingredients.com/${slug}-components`,
      snippet: `Understanding the role of each ingredient in ${mainTopic}. Quality indicators, sourcing tips, and how substitutions affect the final result.`,
      domain: "ingredients.com",
    },
    {
      title: `Community Discussions About ${mainTopic}`,
      url: `https://foodforum.com/t/${slug}`,
      snippet: `Home cooks and food enthusiasts share experiences, favorite techniques, and personal recommendations for ${mainTopic}.`,
      domain: "foodforum.com",
    },
  ];

  const techTemplates: SearchResult[] = [
    {
      title: `${mainTopic} - Official Documentation`,
      url: `https://docs.example.com/${slug}`,
      snippet: `Comprehensive documentation covering ${mainTopic}. Includes getting started guides, API references, and best practices for implementation.`,
      domain: "docs.example.com",
    },
    {
      title: `Understanding ${mainTopic}: A Deep Dive`,
      url: `https://blog.techinsights.com/${slug}-deep-dive`,
      snippet: `This article explores ${mainTopic} in detail, covering architecture, design patterns, and real-world use cases from production systems.`,
      domain: "blog.techinsights.com",
    },
    {
      title: `${mainTopic} Best Practices Guide`,
      url: `https://developer.guide.com/${slug}-best-practices`,
      snippet: `Learn the recommended patterns and anti-patterns for ${mainTopic}. Includes performance tips, security considerations, and common pitfalls to avoid.`,
      domain: "developer.guide.com",
    },
    {
      title: `Getting Started with ${mainTopic}`,
      url: `https://tutorial.dev/${slug}-tutorial`,
      snippet: `Step-by-step tutorial for beginners. Covers installation, configuration, and your first ${mainTopic} implementation with code examples.`,
      domain: "tutorial.dev",
    },
    {
      title: `${mainTopic} Performance Benchmarks`,
      url: `https://benchmarks.io/${slug}-performance`,
      snippet: `Detailed performance analysis comparing different approaches to ${mainTopic}. Includes latency metrics, throughput tests, and scalability results.`,
      domain: "benchmarks.io",
    },
    {
      title: `Advanced ${mainTopic} Techniques`,
      url: `https://advanced.dev/${slug}-advanced`,
      snippet: `Explore advanced concepts in ${mainTopic} including optimization strategies, edge cases, and expert-level implementation patterns.`,
      domain: "advanced.dev",
    },
    {
      title: `${mainTopic} Security Considerations`,
      url: `https://security.dev/${slug}-security`,
      snippet: `Security best practices for ${mainTopic}. Covers authentication, authorization, input validation, and common vulnerability mitigations.`,
      domain: "security.dev",
    },
    {
      title: `${mainTopic} Community Discussion`,
      url: `https://forum.dev/t/${slug}`,
      snippet: `Community discussion thread about ${mainTopic}. Developers share experiences, solutions to common problems, and recommendations.`,
      domain: "forum.dev",
    },
  ];

  const healthTemplates: SearchResult[] = [
    {
      title: `${mainTopic} - Medical Overview`,
      url: `https://healthinfo.org/${slug}`,
      snippet: `Comprehensive medical overview of ${mainTopic}. Covers causes, symptoms, diagnosis methods, and treatment options based on current clinical guidelines.`,
      domain: "healthinfo.org",
    },
    {
      title: `Understanding ${mainTopic}: Patient Guide`,
      url: `https://patientguide.com/${slug}-guide`,
      snippet: `A patient-friendly explanation of ${mainTopic}. Learn what to expect, questions to ask your doctor, and how to manage your condition effectively.`,
      domain: "patientguide.com",
    },
    {
      title: `${mainTopic} Prevention and Risk Reduction`,
      url: `https://prevention.org/${slug}-prevention`,
      snippet: `Evidence-based strategies for preventing or reducing risk of ${mainTopic}. Lifestyle changes, screenings, and early intervention approaches.`,
      domain: "prevention.org",
    },
    {
      title: `Latest Research on ${mainTopic}`,
      url: `https://medicaljournal.com/${slug}-research`,
      snippet: `Recent clinical studies and research findings about ${mainTopic}. Summaries of peer-reviewed papers and emerging treatment protocols.`,
      domain: "medicaljournal.com",
    },
    {
      title: `${mainTopic} Treatment Options`,
      url: `https://treatmentguide.com/${slug}-treatments`,
      snippet: `Overview of available treatments for ${mainTopic}. Compares effectiveness, side effects, and suitability for different patient profiles.`,
      domain: "treatmentguide.com",
    },
    {
      title: `Living with ${mainTopic}`,
      url: `https://wellnesslife.com/${slug}-living`,
      snippet: `Practical advice for daily life with ${mainTopic}. Diet, exercise, mental health, and support resources for patients and caregivers.`,
      domain: "wellnesslife.com",
    },
    {
      title: `${mainTopic} Expert Recommendations`,
      url: `https://experthealth.com/${slug}-guidelines`,
      snippet: `Professional medical guidelines and expert consensus on managing ${mainTopic}. Includes screening schedules and treatment protocols.`,
      domain: "experthealth.com",
    },
    {
      title: `Community Support for ${mainTopic}`,
      url: `https://healthforum.com/t/${slug}`,
      snippet: `Patients and caregivers share experiences, coping strategies, and emotional support related to ${mainTopic}.`,
      domain: "healthforum.com",
    },
  ];

  const businessTemplates: SearchResult[] = [
    {
      title: `${mainTopic} - Market Analysis`,
      url: `https://marketwatch.com/${slug}`,
      snippet: `In-depth market analysis of ${mainTopic}. Covers market size, growth trends, key players, and competitive landscape.`,
      domain: "marketwatch.com",
    },
    {
      title: `Strategies for ${mainTopic} Success`,
      url: `https://businessstrategy.com/${slug}-strategies`,
      snippet: `Proven strategies and frameworks for succeeding with ${mainTopic}. Case studies from industry leaders and actionable recommendations.`,
      domain: "businessstrategy.com",
    },
    {
      title: `${mainTopic} Financial Considerations`,
      url: `https://financeguide.com/${slug}-finance`,
      snippet: `Cost analysis, revenue models, and ROI considerations for ${mainTopic}. Includes budgeting templates and financial planning tools.`,
      domain: "financeguide.com",
    },
    {
      title: `Challenges and Risks in ${mainTopic}`,
      url: `https://riskanalysis.com/${slug}-risks`,
      snippet: `Common obstacles and risk factors associated with ${mainTopic}. Mitigation strategies and contingency planning guidance.`,
      domain: "riskanalysis.com",
    },
    {
      title: `${mainTopic} Implementation Guide`,
      url: `https://implementation.com/${slug}-guide`,
      snippet: `Step-by-step guide to implementing ${mainTopic} in your organization. Project planning, resource allocation, and change management.`,
      domain: "implementation.com",
    },
    {
      title: `${mainTopic} Competitive Landscape`,
      url: `https://competitors.com/${slug}-competitors`,
      snippet: `Analysis of key competitors and alternatives in the ${mainTopic} space. Strengths, weaknesses, and differentiation opportunities.`,
      domain: "competitors.com",
    },
    {
      title: `Future of ${mainTopic}`,
      url: `https://industrytrends.com/${slug}-future`,
      snippet: `Emerging trends and future outlook for ${mainTopic}. Technology disruptions, regulatory changes, and market predictions.`,
      domain: "industrytrends.com",
    },
    {
      title: `${mainTopic} Community Discussion`,
      url: `https://businessforum.com/t/${slug}`,
      snippet: `Business professionals discuss experiences, lessons learned, and advice related to ${mainTopic}.`,
      domain: "businessforum.com",
    },
  ];

  const educationTemplates: SearchResult[] = [
    {
      title: `${mainTopic} - Learning Guide`,
      url: `https://learnguide.com/${slug}`,
      snippet: `Comprehensive learning guide for ${mainTopic}. Covers fundamentals, key concepts, and structured learning paths for beginners to advanced learners.`,
      domain: "learnguide.com",
    },
    {
      title: `Best Methods to Learn ${mainTopic}`,
      url: `https://learningstyles.com/${slug}-methods`,
      snippet: `Compare different approaches to mastering ${mainTopic}. Self-study, formal courses, project-based learning, and mentorship options.`,
      domain: "learningstyles.com",
    },
    {
      title: `${mainTopic} Study Resources`,
      url: `https://studyresources.com/${slug}-resources`,
      snippet: `Curated list of books, online courses, videos, and practice materials for ${mainTopic}. Free and paid options with quality ratings.`,
      domain: "studyresources.com",
    },
    {
      title: `Common Challenges Learning ${mainTopic}`,
      url: `https://learningdifficulties.com/${slug}-challenges`,
      snippet: `Why students struggle with ${mainTopic} and how to overcome common obstacles. Study techniques, time management, and motivation tips.`,
      domain: "learningdifficulties.com",
    },
    {
      title: `${mainTopic} Assessment and Certification`,
      url: `https://certifications.com/${slug}-certs`,
      snippet: `Available certifications and assessment methods for ${mainTopic}. Exam preparation tips, costs, and career impact analysis.`,
      domain: "certifications.com",
    },
    {
      title: `Teaching ${mainTopic} Effectively`,
      url: `https://teacherguide.com/${slug}-teaching`,
      snippet: `Pedagogical approaches and classroom strategies for teaching ${mainTopic}. Lesson plans, activities, and assessment rubrics.`,
      domain: "teacherguide.com",
    },
    {
      title: `${mainTopic} Career Applications`,
      url: `https://careerguide.com/${slug}-careers`,
      snippet: `How ${mainTopic} skills translate to career opportunities. Job roles, salary ranges, and industry demand analysis.`,
      domain: "careerguide.com",
    },
    {
      title: `Student Discussions About ${mainTopic}`,
      url: `https://studentforum.com/t/${slug}`,
      snippet: `Students share study tips, resource recommendations, and experiences learning ${mainTopic}.`,
      domain: "studentforum.com",
    },
  ];

  const generalTemplates: SearchResult[] = [
    {
      title: `${mainTopic} - Comprehensive Overview`,
      url: `https://overview.com/${slug}`,
      snippet: `A thorough introduction to ${mainTopic}. Covers key concepts, history, and why it matters in today's context.`,
      domain: "overview.com",
    },
    {
      title: `Key Factors Influencing ${mainTopic}`,
      url: `https://factors.com/${slug}-factors`,
      snippet: `The most important elements that shape and affect ${mainTopic}. Analysis of causes, effects, and interconnections.`,
      domain: "factors.com",
    },
    {
      title: `${mainTopic} Best Practices`,
      url: `https://bestpractices.com/${slug}`,
      snippet: `Expert-recommended approaches and proven methods for ${mainTopic}. Practical advice based on experience and research.`,
      domain: "bestpractices.com",
    },
    {
      title: `Challenges and Solutions for ${mainTopic}`,
      url: `https://solutions.com/${slug}-challenges`,
      snippet: `Common difficulties related to ${mainTopic} and how to address them. Troubleshooting guide with actionable fixes.`,
      domain: "solutions.com",
    },
    {
      title: `${mainTopic} in Practice`,
      url: `https://practicalguide.com/${slug}-practice`,
      snippet: `Real-world applications and examples of ${mainTopic}. Case studies, implementation stories, and lessons learned.`,
      domain: "practicalguide.com",
    },
    {
      title: `Comparing Approaches to ${mainTopic}`,
      url: `https://comparisons.com/${slug}-compare`,
      snippet: `Side-by-side comparison of different methods and perspectives on ${mainTopic}. Pros, cons, and when to use each.`,
      domain: "comparisons.com",
    },
    {
      title: `Future of ${mainTopic}`,
      url: `https://futuretrends.com/${slug}-future`,
      snippet: `Emerging developments and predictions about ${mainTopic}. What experts expect and how to prepare for changes.`,
      domain: "futuretrends.com",
    },
    {
      title: `Community Discussion on ${mainTopic}`,
      url: `https://generalforum.com/t/${slug}`,
      snippet: `People share experiences, opinions, and advice about ${mainTopic}. Diverse perspectives and practical insights.`,
      domain: "generalforum.com",
    },
  ];

  switch (domain) {
    case "food": return foodTemplates;
    case "technology": return techTemplates;
    case "health": return healthTemplates;
    case "business": return businessTemplates;
    case "education": return educationTemplates;
    default: return generalTemplates;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query-Aware Mock Search Results
// ─────────────────────────────────────────────────────────────────────────────

function generateMockSearchResults(query: string, domain: string): SearchResult[] {
  const q = query.toLowerCase().trim();
  const slug = q.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  // Extract key nouns from query for topic-aware content
  const stopWords = new Set(["what", "why", "how", "when", "where", "who", "is", "are", "does", "do", "the", "a", "an", "to", "of", "in", "on", "at", "for", "with", "about", "makes", "make", "it", "that", "this", "these", "those", "and", "or", "but", "be", "been", "being", "have", "has", "had", "will", "would", "could", "should", "may", "might", "can", "shall", "was", "were", "am", "get", "got", "go", "went", "come", "came", "take", "took", "give", "gave", "see", "saw", "know", "knew", "think", "thought", "say", "said", "tell", "told", "ask", "asked", "work", "worked", "try", "tried", "use", "used", "find", "found", "feel", "felt", "become", "became", "leave", "left", "put", "mean", "meant", "keep", "kept", "let", "begin", "began", "seem", "seemed", "help", "helped", "show", "showed", "hear", "heard", "play", "played", "run", "ran", "move", "moved", "live", "lived", "believe", "believed", "bring", "brought", "happen", "happened", "write", "wrote", "provide", "provided", "sit", "sat", "stand", "stood", "lose", "lost", "pay", "paid", "meet", "met", "include", "included", "continue", "continued", "set", "learn", "learned", "change", "changed", "lead", "led", "understand", "understood", "watch", "watched", "follow", "followed", "stop", "stopped", "create", "created", "speak", "spoke", "read", "allow", "allowed", "add", "added", "spend", "spent", "grow", "grew", "open", "opened", "walk", "walked", "win", "won", "offer", "offered", "remember", "remembered", "love", "loved", "consider", "considered", "appear", "appeared", "buy", "bought", "wait", "waited", "serve", "served", "die", "died", "send", "sent", "expect", "expected", "build", "built", "stay", "stayed", "fall", "fell", "cut", "reach", "reached", "kill", "killed", "remain", "remained", "suggest", "suggested", "raise", "raised", "pass", "passed", "sell", "sold", "require", "required", "report", "reported", "decide", "decided", "pull", "pulled"]);
  const words = q.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const topic = words.slice(0, 3).join(" ") || q.replace(/\?/g, "").trim();
  const topicCapitalized = topic.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  // Domain-specific knowledge base for realistic mock content
  const domainKnowledge: Record<string, Record<string, string[]>> = {
    food: {
      "pizza": [
        "High-quality mozzarella with the right moisture content creates the signature stretch and creamy flavor that defines great pizza.",
        "The Maillard reaction during baking at 450-500°F develops hundreds of flavor compounds that give pizza crust its complex, nutty taste.",
        "San Marzano tomatoes grown in volcanic soil near Mount Vesuvius have lower acidity and sweeter flavor, making them ideal for pizza sauce.",
        "Cold fermentation of dough for 24-72 hours develops gluten structure and creates subtle sourdough-like flavors from slow yeast activity.",
        "The balance of umami from cheese, sweetness from tomatoes, and saltiness from cured meats creates the addictive flavor profile of pizza.",
        "Wood-fired ovens at 700-900°F cook pizza in 90 seconds, creating leopard-spotted charring on the crust edge (cornicione) that adds bitter complexity.",
        "Fresh basil added after baking preserves its volatile aromatic oils (linalool and eugenol) that would evaporate at high temperatures.",
        "The hydration level of pizza dough (60-70% water to flour ratio) determines crust texture - higher hydration creates airy, open crumb structure.",
        "Aged provolone and Parmigiano-Reggiano added to mozzarella deepens the savory flavor through glutamate concentration during aging.",
        "Extra virgin olive oil drizzled before serving carries fat-soluble flavor compounds and adds peppery, fruity notes from polyphenols.",
      ],
      "default": [
        `The quality of ingredients is the foundation of exceptional ${topic}. Fresh, seasonal components provide the best flavor foundation.`,
        `Temperature control during preparation significantly affects the final texture and taste of ${topic}. Precision matters at every stage.`,
        `The interaction between ingredients creates complex flavor profiles that no single component can achieve alone in ${topic}.`,
        `Traditional techniques passed down through generations often produce the most authentic and satisfying ${topic} experiences.`,
        `The Maillard reaction and caramelization processes develop deep, rich flavors that distinguish outstanding ${topic} from average preparations.`,
        `Balancing the five basic tastes - sweet, sour, salty, bitter, and umami - is essential for creating memorable ${topic}.`,
        `Texture contrast within a single dish elevates the eating experience of ${topic}, combining crispy, creamy, and chewy elements.`,
        `Regional variations of ${topic} reflect local ingredient availability, climate conditions, and cultural preferences developed over centuries.`,
      ],
    },
    technology: {
      "default": [
        `Modern ${topic} implementations prioritize scalability and fault tolerance through distributed architecture patterns and redundancy strategies.`,
        `Performance optimization for ${topic} requires profiling bottlenecks at multiple layers: network, compute, storage, and application logic.`,
        `Security considerations for ${topic} include input validation, authentication, authorization, encryption in transit and at rest, and audit logging.`,
        `The ecosystem around ${topic} includes libraries, frameworks, tools, and community resources that accelerate development and reduce boilerplate.`,
        `Monitoring and observability are critical for production ${topic} systems, requiring metrics, logs, traces, and alerting strategies.`,
        `Testing strategies for ${topic} should include unit tests, integration tests, end-to-end tests, and performance benchmarks in CI/CD pipelines.`,
        `Documentation and API design significantly impact adoption and maintainability of ${topic} solutions in team environments.`,
        `Cloud-native approaches to ${topic} leverage containerization, orchestration, service mesh, and serverless computing patterns.`,
      ],
    },
    health: {
      "default": [
        `Clinical evidence supports multiple approaches to understanding and managing ${topic}, with treatment selection depending on individual patient factors.`,
        `Prevention strategies for ${topic} include lifestyle modifications, regular screening, vaccination where applicable, and risk factor reduction.`,
        `The pathophysiology of ${topic} involves complex interactions between genetic predisposition, environmental triggers, and immune system responses.`,
        `Patient education and shared decision-making improve outcomes for ${topic} by increasing adherence to treatment plans and lifestyle recommendations.`,
        `Recent research on ${topic} has identified novel biomarkers and therapeutic targets that may lead to more personalized treatment approaches.`,
        `Multidisciplinary care teams provide comprehensive management of ${topic}, addressing medical, psychological, and social aspects of patient wellbeing.`,
        `Early detection and intervention significantly improve prognosis for ${topic}, making awareness of warning symptoms critically important.`,
        `Quality of life considerations are central to ${topic} management, balancing treatment efficacy with side effect burden and patient preferences.`,
      ],
    },
    business: {
      "default": [
        `Market analysis of ${topic} reveals opportunities for differentiation through customer segmentation, value proposition refinement, and channel optimization.`,
        `Successful ${topic} strategies require alignment between organizational capabilities, market demands, and competitive positioning.`,
        `Financial modeling for ${topic} should account for fixed and variable costs, revenue streams, customer acquisition costs, and lifetime value metrics.`,
        `Risk management in ${topic} involves identifying, assessing, and mitigating strategic, operational, financial, and compliance risks.`,
        `Digital transformation initiatives increasingly shape ${topic} outcomes through data-driven decision making, automation, and customer experience enhancement.`,
        `Stakeholder management is critical for ${topic} success, requiring clear communication, expectation setting, and relationship building across diverse groups.`,
        `Scaling ${topic} operations demands attention to process standardization, talent acquisition, technology infrastructure, and organizational culture.`,
        `Sustainability and ESG considerations are becoming integral to ${topic} strategy as investors, regulators, and consumers prioritize responsible business practices.`,
      ],
    },
    education: {
      "default": [
        `Effective ${topic} instruction combines clear learning objectives, active engagement strategies, formative assessment, and timely feedback.`,
        `Cognitive science research on ${topic} learning emphasizes spaced repetition, retrieval practice, elaboration, and interleaving of topics.`,
        `Technology-enhanced ${topic} learning provides adaptive pathways, immediate feedback, multimedia resources, and collaboration opportunities.`,
        `Assessment design for ${topic} should align with learning outcomes, using multiple measures including formative, summative, and performance-based evaluation.`,
        `Motivation and self-regulation significantly impact ${topic} learning outcomes, requiring attention to goal-setting, self-efficacy, and metacognitive strategies.`,
        `Differentiated instruction addresses diverse learner needs in ${topic} through varied content, process, product, and learning environment adjustments.`,
        `Professional learning communities support ${topic} educators through collaborative planning, peer observation, and shared resource development.`,
        `Transfer of ${topic} learning to real-world contexts requires intentional application opportunities and reflection on connections between theory and practice.`,
      ],
    },
    general: {
      "default": [
        `Understanding ${topic} requires examining historical context, current developments, and emerging trends that shape its evolution.`,
        `Key factors influencing ${topic} include technological change, social dynamics, economic conditions, regulatory frameworks, and cultural values.`,
        `Best practices for ${topic} emerge from accumulated experience, empirical research, and iterative refinement across diverse contexts and applications.`,
        `Common challenges in ${topic} include resource constraints, competing priorities, stakeholder alignment, and adapting to rapidly changing conditions.`,
        `The interdisciplinary nature of ${topic} means insights from multiple fields contribute to comprehensive understanding and effective action.`,
        `Measurement and evaluation frameworks help track progress in ${topic} by defining clear indicators, data collection methods, and analysis approaches.`,
        `Collaboration and knowledge sharing accelerate progress in ${topic} by leveraging diverse expertise and avoiding duplication of effort.`,
        `Future developments in ${topic} will likely be shaped by emerging technologies, shifting demographics, environmental considerations, and global connectivity.`,
      ],
    },
  };

  // Get knowledge snippets for this topic
  const knowledge = domainKnowledge[domain] || domainKnowledge.general;
  const topicKey = Object.keys(knowledge).find(k => q.includes(k)) || "default";
  const snippets = knowledge[topicKey] || knowledge["default"];

  // Generate varied titles based on query
  const titleTemplates: Record<string, string[]> = {
    food: [
      `${topicCapitalized}: The Science of Flavor`,
      `Why ${topicCapitalized} Tastes So Good`,
      `Expert Secrets for Perfect ${topicCapitalized}`,
      `The Chemistry Behind ${topicCapitalized}`,
      `${topicCapitalized} - A Complete Guide`,
      `Regional Variations of ${topicCapitalized}`,
      `Common ${topicCapitalized} Mistakes to Avoid`,
      `Premium Ingredients for ${topicCapitalized}`,
    ],
    technology: [
      `${topicCapitalized}: Architecture and Design`,
      `Optimizing ${topicCapitalized} Performance`,
      `${topicCapitalized} Security Best Practices`,
      `Getting Started with ${topicCapitalized}`,
      `Advanced ${topicCapitalized} Techniques`,
      `${topicCapitalized} in Production Systems`,
      `Scaling ${topicCapitalized} Applications`,
      `The Future of ${topicCapitalized}`,
    ],
    health: [
      `${topicCapitalized}: Clinical Overview`,
      `Understanding ${topicCapitalized} Risk Factors`,
      `Treatment Approaches for ${topicCapitalized}`,
      `Living Well with ${topicCapitalized}`,
      `Latest Research on ${topicCapitalized}`,
      `Prevention Strategies for ${topicCapitalized}`,
      `Patient Guide to ${topicCapitalized}`,
      `Expert Recommendations for ${topicCapitalized}`,
    ],
    business: [
      `${topicCapitalized} Market Analysis`,
      `Strategies for ${topicCapitalized} Success`,
      `Financial Planning for ${topicCapitalized}`,
      `Risk Management in ${topicCapitalized}`,
      `Implementing ${topicCapitalized} Solutions`,
      `Competitive Landscape of ${topicCapitalized}`,
      `${topicCapitalized} Growth Opportunities`,
      `Future Trends in ${topicCapitalized}`,
    ],
    education: [
      `Learning ${topicCapitalized} Effectively`,
      `${topicCapitalized} Study Strategies`,
      `Teaching ${topicCapitalized} Best Practices`,
      `Resources for Mastering ${topicCapitalized}`,
      `Assessment Methods for ${topicCapitalized}`,
      `Career Paths in ${topicCapitalized}`,
      `Common Challenges in ${topicCapitalized}`,
      `Future of ${topicCapitalized} Education`,
    ],
    general: [
      `${topicCapitalized}: A Comprehensive Overview`,
      `Key Factors in ${topicCapitalized}`,
      `Best Practices for ${topicCapitalized}`,
      `Challenges and Solutions for ${topicCapitalized}`,
      `${topicCapitalized} in Practice`,
      `Comparing Approaches to ${topicCapitalized}`,
      `The Future of ${topicCapitalized}`,
      `Community Perspectives on ${topicCapitalized}`,
    ],
  };

  const titles = titleTemplates[domain] || titleTemplates.general;
  const domains: Record<string, string[]> = {
    food: ["seriouseats.com", "foodandwine.com", "bonappetit.com", "culinaryscience.org", "chefsteps.com", "tastingtable.com", "epicurious.com", "saveur.com"],
    technology: ["docs.example.com", "blog.techinsights.com", "developer.guide.com", "tutorial.dev", "benchmarks.io", "advanced.dev", "security.dev", "forum.dev"],
    health: ["healthinfo.org", "patientguide.com", "prevention.org", "medicaljournal.com", "treatmentguide.com", "wellnesslife.com", "experthealth.com", "healthforum.com"],
    business: ["marketwatch.com", "businessstrategy.com", "financeguide.com", "riskanalysis.com", "implementation.com", "competitors.com", "industrytrends.com", "businessforum.com"],
    education: ["learnguide.com", "learningstyles.com", "studyresources.com", "learningdifficulties.com", "certifications.com", "teacherguide.com", "careerguide.com", "studentforum.com"],
    general: ["overview.com", "factors.com", "bestpractices.com", "solutions.com", "practicalguide.com", "comparisons.com", "futuretrends.com", "generalforum.com"],
  };

  const domainList = domains[domain] || domains.general;

  // Build results with topic-specific content
  const results: SearchResult[] = [];
  for (let i = 0; i < Math.min(titles.length, snippets.length); i++) {
    const d = domainList[i % domainList.length];
    results.push({
      title: titles[i],
      url: `https://${d}/${slug}-${i + 1}`,
      snippet: snippets[i % snippets.length],
      domain: d,
    });
  }

  return results;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ─────────────────────────────────────────────────────────────────────────────
// Serper Search Provider (real web search)
// ─────────────────────────────────────────────────────────────────────────────

export class SerperSearchProvider implements SearchProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    try {
      const response = await fetch(SERPER_API_URL, {
        method: "POST",
        headers: {
          "X-API-KEY": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: query,
          num: Math.min(maxResults, 10),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "unknown error");
        throw new Error(`Serper API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        organic?: Array<{
          title: string;
          link: string;
          snippet: string;
        }>;
      };

      return (data.organic || []).map((r) => {
        const url = r.link || "";
        const domain = extractDomain(url);
        return {
          title: r.title || "Untitled",
          url,
          snippet: r.snippet || "",
          domain,
        };
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic Scholar Search Provider (academic paper search)
// ─────────────────────────────────────────────────────────────────────────────

const SEMANTIC_SCHOLAR_API_URL = "https://api.semanticscholar.org/graph/v1/paper/search";
const SEMANTIC_SCHOLAR_TIMEOUT_MS = 15_000;

export class SemanticScholarSearchProvider implements SearchProvider {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEMANTIC_SCHOLAR_TIMEOUT_MS);

    try {
      const url = new URL(SEMANTIC_SCHOLAR_API_URL);
      url.searchParams.set("query", query);
      url.searchParams.set("limit", String(Math.min(maxResults, 100)));
      url.searchParams.set("fields", "title,authors,year,abstract,venue,citationCount,paperId,openAccessPdf");

      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (this.apiKey) {
        headers["x-api-key"] = this.apiKey;
      }

      const response = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "unknown error");
        throw new Error(`Semantic Scholar API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        data?: Array<{
          paperId: string;
          title: string;
          abstract: string | null;
          authors?: Array<{ name: string }>;
          year?: number;
          venue?: string;
          citationCount?: number;
          openAccessPdf?: { url: string } | null;
        }>;
      };

      return (data.data || []).map((paper) => {
        const authorNames = paper.authors?.map((a) => a.name).slice(0, 3).join(", ") || "Unknown";
        const yearStr = paper.year ? ` (${paper.year})` : "";
        const venueStr = paper.venue ? ` — ${paper.venue}` : "";
        const citationStr = paper.citationCount ? ` [${paper.citationCount} citations]` : "";
        const abstract = paper.abstract || `${authorNames}${yearStr}${venueStr}${citationStr}`;

        return {
          title: paper.title,
          url: paper.openAccessPdf?.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
          snippet: abstract.slice(0, 500),
          domain: "semanticscholar.org",
        };
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_LENGTH = 8_000;

export async function fetchPageContent(url: string): Promise<string | null> {
  // Security: Validate URL before fetching
  try {
    const parsed = new URL(url);
    // Block internal/private addresses
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.") ||
      hostname.startsWith("0.") ||
      hostname.startsWith("[::]") ||
      hostname.startsWith("[::1]") ||
      hostname.startsWith("[fc00:") ||
      hostname.startsWith("[fe80:")
    ) {
      return null;
    }
    // Only allow http/https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PaperclipResearch/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    const html = await response.text();

    // Basic HTML-to-text extraction
    let text = html
      // Remove script and style tags with content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      // Remove nav, header, footer, aside
      .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      // Convert common block tags to newlines
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
      .replace(/<(br)\s*\/?>/gi, "\n")
      // Remove all remaining tags
      .replace(/<[^>]+>/g, " ")
      // Decode common HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim();

    // Limit length
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.slice(0, MAX_CONTENT_LENGTH) + "...";
    }

    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export type SearchProviderType = "mock" | "serper" | "semantic-scholar";

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createSearchProvider(
  type: SearchProviderType,
  apiKey?: string,
): SearchProvider {
  switch (type) {
    case "serper":
      if (apiKey && apiKey.length > 0) {
        return new SerperSearchProvider(apiKey);
      }
      throw new Error("Serper API key required when provider is 'serper'");
    case "semantic-scholar":
      return new SemanticScholarSearchProvider(apiKey);
    case "mock":
    default:
      return new MockSearchProvider();
  }
}
