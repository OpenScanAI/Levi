import { describe, expect, it } from "vitest";
import {
  extractClaudeRetryNotBefore,
  isClaudeModifiedThinkingReplayError,
  isClaudeTransientUpstreamError,
  parseClaudeStreamJson,
} from "./parse.js";

describe("isClaudeModifiedThinkingReplayError", () => {
  it("detects Anthropic's backtick-wrapped modified thinking resume failure", () => {
    const message =
      "API Error: 400 messages.N.content.M: `thinking` or `redacted_thinking` blocks in the latest assistant message cannot be modified. These blocks must remain as they were in the original response.";

    expect(
      isClaudeModifiedThinkingReplayError({
        result: message,
      }),
    ).toBe(true);
    expect(
      isClaudeModifiedThinkingReplayError({
        errors: [{ message }],
      }),
    ).toBe(true);
  });

  it("does not classify unrelated validation errors as modified thinking replay failures", () => {
    expect(
      isClaudeModifiedThinkingReplayError({
        result: "API Error: 400 messages.0.content.0.text is required.",
      }),
    ).toBe(false);
  });
});

describe("isClaudeTransientUpstreamError", () => {
  it("classifies the 'out of extra usage' subscription window failure as transient", () => {
    expect(
      isClaudeTransientUpstreamError({
        errorMessage: "You're out of extra usage · resets 4pm (America/Chicago)",
      }),
    ).toBe(true);
    expect(
      isClaudeTransientUpstreamError({
        parsed: {
          is_error: true,
          result: "You're out of extra usage. Resets at 4pm (America/Chicago).",
        },
      }),
    ).toBe(true);
  });

  it("classifies Anthropic API rate_limit_error and overloaded_error as transient", () => {
    expect(
      isClaudeTransientUpstreamError({
        parsed: {
          is_error: true,
          errors: [{ type: "rate_limit_error", message: "Rate limit reached for requests." }],
        },
      }),
    ).toBe(true);
    expect(
      isClaudeTransientUpstreamError({
        parsed: {
          is_error: true,
          errors: [{ type: "overloaded_error", message: "Overloaded" }],
        },
      }),
    ).toBe(true);
    expect(
      isClaudeTransientUpstreamError({
        stderr: "HTTP 429: Too Many Requests",
      }),
    ).toBe(true);
    expect(
      isClaudeTransientUpstreamError({
        stderr: "Bedrock ThrottlingException: slow down",
      }),
    ).toBe(true);
  });

  it("classifies the subscription 5-hour / weekly limit wording", () => {
    expect(
      isClaudeTransientUpstreamError({
        errorMessage: "Claude usage limit reached — weekly limit reached. Try again in 2 days.",
      }),
    ).toBe(true);
    expect(
      isClaudeTransientUpstreamError({
        errorMessage: "5-hour limit reached.",
      }),
    ).toBe(true);
  });

  it("does not classify login/auth failures as transient", () => {
    expect(
      isClaudeTransientUpstreamError({
        stderr: "Please log in. Run `claude login` first.",
      }),
    ).toBe(false);
  });

  it("does not classify max-turns or unknown-session as transient", () => {
    expect(
      isClaudeTransientUpstreamError({
        parsed: { subtype: "error_max_turns", result: "Maximum turns reached." },
      }),
    ).toBe(false);
    expect(
      isClaudeTransientUpstreamError({
        parsed: {
          result: "No conversation found with session id abc-123",
          errors: [{ message: "No conversation found with session id abc-123" }],
        },
      }),
    ).toBe(false);
  });

  it("does not classify deterministic validation errors as transient", () => {
    expect(
      isClaudeTransientUpstreamError({
        errorMessage: "Invalid request_error: Unknown parameter 'foo'.",
      }),
    ).toBe(false);
  });
});

describe("extractClaudeRetryNotBefore", () => {
  it("parses the 'resets 4pm' hint in its explicit timezone", () => {
    const now = new Date("2026-04-22T15:15:00.000Z");
    const extracted = extractClaudeRetryNotBefore(
      { errorMessage: "You're out of extra usage · resets 4pm (America/Chicago)" },
      now,
    );
    expect(extracted?.toISOString()).toBe("2026-04-22T21:00:00.000Z");
  });

  it("rolls forward past midnight when the reset time has already passed today", () => {
    const now = new Date("2026-04-22T23:30:00.000Z");
    const extracted = extractClaudeRetryNotBefore(
      { errorMessage: "Usage limit reached. Resets at 3:15 AM (UTC)." },
      now,
    );
    expect(extracted?.toISOString()).toBe("2026-04-23T03:15:00.000Z");
  });

  it("returns null when no reset hint is present", () => {
    expect(
      extractClaudeRetryNotBefore({ errorMessage: "Overloaded. Try again later." }, new Date()),
    ).toBeNull();
  });
});

describe("parseClaudeStreamJson", () => {
  it("parses normal line-delimited stream JSON", () => {
    const stdout = [
      '{"type":"system","subtype":"init","session_id":"sess-1"}',
      '{"type":"assistant","session_id":"sess-1","message":{"content":[{"type":"text","text":"Hello"}]}}',
      '{"type":"result","session_id":"sess-1","result":"Done","usage":{"input_tokens":10,"output_tokens":5},"total_cost_usd":0.001}',
    ].join("\n");

    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.sessionId).toBe("sess-1");
    expect(parsed.resultJson).toEqual({
      type: "result",
      session_id: "sess-1",
      result: "Done",
      usage: { input_tokens: 10, output_tokens: 5 },
      total_cost_usd: 0.001,
    });
    expect(parsed.usage).toEqual({
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 5,
    });
    expect(parsed.costUsd).toBe(0.001);
    expect(parsed.summary).toBe("Done");
  });

  it("extracts result from markdown-wrapped JSON", () => {
    const stdout = 'Some intro\n```json\n{"type":"result","session_id":"sess-2","result":"Wrapped","usage":{"input_tokens":1,"output_tokens":2},"total_cost_usd":0.0001}\n```\n';
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.sessionId).toBe("sess-2");
    expect(parsed.resultJson).not.toBeNull();
    expect(parsed.summary).toBe("Wrapped");
  });

  it("extracts result from mixed text with progress indicators", () => {
    const stdout = 'Progress: 50%\n{"type":"result","session_id":"sess-3","result":"Mixed","usage":{"input_tokens":5,"output_tokens":5}}\nDone.';
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.sessionId).toBe("sess-3");
    expect(parsed.resultJson).not.toBeNull();
    expect(parsed.summary).toBe("Mixed");
  });

  it("extracts result using extractResultFromMixedOutput for interleaved text", () => {
    const stdout = 'Loading...\n{"type":"system","subtype":"init","session_id":"sess-4"}\nThinking...\n{"type":"assistant","session_id":"sess-4","message":{"content":[{"type":"text","text":"Working"}]}}\nProgress: 75%\n{"type":"result","session_id":"sess-4","result":"Interleaved","usage":{"input_tokens":3,"output_tokens":4}}\nCleanup...';
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.sessionId).toBe("sess-4");
    expect(parsed.resultJson).not.toBeNull();
    expect(parsed.summary).toBe("Interleaved");
  });

  it("returns null resultJson when no result is found", () => {
    const stdout = '{"type":"system","subtype":"init","session_id":"sess-5"}\nNo result here.';
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.sessionId).toBe("sess-5");
    expect(parsed.resultJson).toBeNull();
    expect(parsed.costUsd).toBeNull();
  });

  it("collects assistant text messages", () => {
    const stdout = [
      '{"type":"assistant","message":{"content":[{"type":"text","text":"First"}]}}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Second"}]}}',
      '{"type":"result","result":"Final","usage":{}}',
    ].join("\n");
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.summary).toBe("Final");
  });

  it("uses assistant texts as summary when result field is missing", () => {
    const stdout = [
      '{"type":"assistant","message":{"content":[{"type":"text","text":"First paragraph"}]}}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Second paragraph"}]}}',
      '{"type":"result","usage":{},"total_cost_usd":0}'
    ].join("\n");
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.summary).toBe("First paragraph\n\nSecond paragraph");
  });

  it("handles empty stdout gracefully", () => {
    const parsed = parseClaudeStreamJson("");
    expect(parsed.sessionId).toBeNull();
    expect(parsed.resultJson).toBeNull();
    expect(parsed.summary).toBe("");
    expect(parsed.usage).toBeNull();
    expect(parsed.costUsd).toBeNull();
  });
});
