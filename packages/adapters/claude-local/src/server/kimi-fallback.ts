import { asBoolean, asNumber, asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

const DEFAULT_COMMAND = "kimi";
const DEFAULT_MODEL = "kimi-for-coding";

export interface KimiFallbackConfig {
  enabled: boolean;
  provider: "moonshot_kimi";
  command: string;
  model: string;
  /**
   * Seconds before the Kimi CLI process is killed if it stops producing
   * output. Defaults to 300 (5 minutes). Set to 0 to disable (NOT
   * recommended — Kimi CLI has been observed to hang silently in
   * agentic heartbeat mode despite quota being available).
   */
  timeoutSec: number;
}

/**
 * Parse the agent.adapterConfig.fallback block. Returns null if disabled or absent.
 *
 * Expected shape under adapter_config:
 *   {
 *     "fallback": {
 *       "enabled": true,
 *       "provider": "moonshot_kimi",   // only this value is supported in this PR
 *       "command": "kimi",              // optional, path to kimi CLI binary
 *       "model":   "kimi-for-coding"    // optional, --model arg for kimi
 *     }
 *   }
 *
 * Authentication is owned by the kimi CLI itself (~/.kimi/config.toml on the
 * host). The operator must configure that file the same way they configure
 * ~/.claude/credentials.json for the primary path. No API key is plumbed
 * through this config block.
 */
export function readKimiFallbackConfig(rawConfig: Record<string, unknown>): KimiFallbackConfig | null {
  const block = parseObject(rawConfig.fallback);
  if (!block || Object.keys(block).length === 0) return null;
  const enabled = asBoolean(block.enabled, false);
  if (!enabled) return null;
  const provider = asString(block.provider, "moonshot_kimi");
  if (provider !== "moonshot_kimi") return null;
  return {
    enabled: true,
    provider: "moonshot_kimi",
    command: asString(block.command, DEFAULT_COMMAND),
    model: asString(block.model, DEFAULT_MODEL),
    timeoutSec: asNumber(block.timeoutSec, 300),
  };
}

/**
 * Build the argv for invoking the kimi CLI in headless print mode with
 * stream-json output. The prompt is delivered via stdin (NOT --prompt) so that
 * very long prompts don't blow the argv size limit.
 */
export function buildKimiFallbackArgs(cfg: KimiFallbackConfig): string[] {
  const args = ["--print", "--output-format=stream-json", "--yolo", "--afk"];
  if (cfg.model && cfg.model.length > 0) args.push("--model", cfg.model);
  return args;
}

/**
 * Minimal parser for kimi CLI's --output-format=stream-json output.
 *
 * Kimi emits one JSON object per line. We care about:
 *   - {"role":"assistant","content": ... } — the actual model response. Content
 *     may be a string OR an array of {type:"text"|"think",text:...} blocks
 *     (Kimi K2's "thinking" output format).
 *   - {"role":"tool", ...} — tool results, we don't need them for the fallback summary
 *
 * Also extracts the session id from the trailing plain-text "To resume this
 * session: kimi -r <id>" line that the CLI prints to stderr.
 *
 * Kept inline (not imported from kimi-local) so this PR doesn't gain a
 * workspace dep on the separate kimi-local package.
 */
export interface ParsedKimiOutput {
  summary: string;
  sessionId: string | null;
  errorMessage: string | null;
}

const SESSION_HINT_RE = /To resume this session:\s+kimi\s+-r\s+([A-Za-z0-9-]+)/;

function safeParseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function extractTextFromAssistantContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block);
      continue;
    }
    if (block && typeof block === "object") {
      const obj = block as Record<string, unknown>;
      const type = typeof obj.type === "string" ? obj.type : "";
      const text = typeof obj.text === "string" ? obj.text : "";
      // Skip thinking blocks for the summary; include only text content.
      if (type === "text" && text.length > 0) parts.push(text);
    }
  }
  return parts.join("");
}

export function parseKimiStreamJson(stdoutAndStderr: string): ParsedKimiOutput {
  let sessionId: string | null = null;
  let errorMessage: string | null = null;
  const textParts: string[] = [];

  for (const rawLine of stdoutAndStderr.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const hint = SESSION_HINT_RE.exec(line);
    if (hint?.[1]) {
      sessionId = hint[1].trim();
      continue;
    }

    const event = safeParseJson(line);
    if (!event || typeof event !== "object") continue;
    const obj = event as Record<string, unknown>;
    const role = typeof obj.role === "string" ? obj.role : "";

    if (role === "assistant") {
      const text = extractTextFromAssistantContent(obj.content);
      if (text.length > 0) textParts.push(text);
    } else if (typeof obj.error === "string") {
      errorMessage = obj.error;
    }
  }

  return {
    summary: textParts.join("\n").trim(),
    sessionId,
    errorMessage,
  };
}

/** Pretty-printable description for logs. Does not include any secret. */
export function describeKimiFallback(cfg: KimiFallbackConfig): string {
  return `provider=${cfg.provider} command=${cfg.command} model=${cfg.model}`;
}
