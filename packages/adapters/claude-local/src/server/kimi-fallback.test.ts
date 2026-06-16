import { describe, it, expect } from "vitest";
import {
  readKimiFallbackConfig,
  buildKimiFallbackArgs,
  parseKimiStreamJson,
  describeKimiFallback,
} from "./kimi-fallback.js";

describe("readKimiFallbackConfig", () => {
  it("returns null when fallback block is absent", () => {
    expect(readKimiFallbackConfig({})).toBeNull();
  });

  it("returns null when fallback.enabled is false", () => {
    expect(
      readKimiFallbackConfig({ fallback: { enabled: false, provider: "moonshot_kimi" } }),
    ).toBeNull();
  });

  it("returns null when provider is not moonshot_kimi", () => {
    expect(
      readKimiFallbackConfig({ fallback: { enabled: true, provider: "openai" } }),
    ).toBeNull();
  });

  it("returns a config with defaults when enabled with no overrides", () => {
    const cfg = readKimiFallbackConfig({
      fallback: { enabled: true, provider: "moonshot_kimi" },
    });
    expect(cfg).not.toBeNull();
    expect(cfg!.command).toBe("kimi");
    expect(cfg!.model).toBe("kimi-for-coding");
    expect(cfg!.timeoutSec).toBe(300);
  });

  it("honours timeoutSec override", () => {
    const cfg = readKimiFallbackConfig({
      fallback: { enabled: true, provider: "moonshot_kimi", timeoutSec: 600 },
    });
    expect(cfg!.timeoutSec).toBe(600);
  });

  it("honours command and model overrides", () => {
    const cfg = readKimiFallbackConfig({
      fallback: {
        enabled: true,
        provider: "moonshot_kimi",
        command: "/opt/kimi/bin/kimi",
        model: "kimi-k2.5",
      },
    });
    expect(cfg!.command).toBe("/opt/kimi/bin/kimi");
    expect(cfg!.model).toBe("kimi-k2.5");
  });
});

describe("buildKimiFallbackArgs", () => {
  it("produces base args without --model when model matches default", () => {
    const args = buildKimiFallbackArgs({
      enabled: true,
      provider: "moonshot_kimi",
      command: "kimi",
      model: "kimi-for-coding",
      timeoutSec: 300,
    });
    expect(args).toEqual(["--print", "--output-format=stream-json", "--yolo", "--afk", "--model", "kimi-for-coding"]);
  });

  it("appends --model for non-default model", () => {
    const args = buildKimiFallbackArgs({
      enabled: true,
      provider: "moonshot_kimi",
      command: "kimi",
      model: "kimi-k2.5",
      timeoutSec: 300,
    });
    expect(args).toContain("--model");
    expect(args).toContain("kimi-k2.5");
  });
});

describe("parseKimiStreamJson", () => {
  it("extracts assistant text from string-content lines", () => {
    const stdout = `{"role":"assistant","content":"hello world"}\n`;
    const out = parseKimiStreamJson(stdout);
    expect(out.summary).toBe("hello world");
  });

  it("extracts assistant text from array-content blocks, skipping thinking", () => {
    const stdout = [
      `{"role":"assistant","content":[{"type":"think","text":"hmm"},{"type":"text","text":"answer"}]}`,
      `{"role":"assistant","content":[{"type":"text","text":" continued"}]}`,
    ].join("\n");
    const out = parseKimiStreamJson(stdout);
    expect(out.summary).toBe("answer\n continued");
  });

  it("extracts sessionId from the resume hint line", () => {
    const stdout = `{"role":"assistant","content":"ok"}\nTo resume this session: kimi -r abc-123-def\n`;
    const out = parseKimiStreamJson(stdout);
    expect(out.sessionId).toBe("abc-123-def");
  });

  it("returns null sessionId when no resume hint present", () => {
    const out = parseKimiStreamJson(`{"role":"assistant","content":"ok"}\n`);
    expect(out.sessionId).toBeNull();
  });

  it("captures error messages when present", () => {
    const stdout = `{"role":"assistant","content":"oops"}\n{"error":"upstream blew up"}\n`;
    const out = parseKimiStreamJson(stdout);
    expect(out.errorMessage).toBe("upstream blew up");
  });

  it("returns empty summary when no assistant lines present", () => {
    const out = parseKimiStreamJson(`{"role":"tool","content":"unrelated"}\n`);
    expect(out.summary).toBe("");
  });
});

describe("describeKimiFallback", () => {
  it("produces a key-free pretty description", () => {
    const desc = describeKimiFallback({
      enabled: true,
      provider: "moonshot_kimi",
      command: "kimi",
      model: "kimi-for-coding",
      timeoutSec: 300,
    });
    expect(desc).toBe("provider=moonshot_kimi command=kimi model=kimi-for-coding");
    expect(desc).not.toMatch(/sk-/);
  });
});
