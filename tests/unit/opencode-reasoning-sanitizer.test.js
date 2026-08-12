import { describe, expect, it } from "vitest";
import { isOpencodeGoProvider, stripBooleanReasoning } from "../../open-sse/services/opencodeReasoningSanitizer.js";

/**
 * Port of OmniRoute #7891: opencode Go-backed providers 400 on a boolean
 * `reasoning` field because their ChatCompletionRequest struct types
 * `reasoning` as a structured object. The sanitizer strips it.
 */
describe("isOpencodeGoProvider", () => {
  it("recognizes opencode Go-backed providers", () => {
    expect(isOpencodeGoProvider("opencode")).toBe(true);
    expect(isOpencodeGoProvider("opencode-go")).toBe(true);
  });

  it("does not claim other providers", () => {
    expect(isOpencodeGoProvider("deepseek")).toBe(false);
    expect(isOpencodeGoProvider("antigravity")).toBe(false);
    expect(isOpencodeGoProvider("openai")).toBe(false);
  });
});

describe("stripBooleanReasoning", () => {
  it("removes a boolean reasoning field", () => {
    const body = { model: "x", messages: [], reasoning: true };
    const out = stripBooleanReasoning(body);
    expect(out).toEqual({ model: "x", messages: [] });
    expect(out).not.toBe(body); // shallow clone, original untouched
    expect(body.reasoning).toBe(true);
  });

  it("leaves object reasoning untouched", () => {
    const body = { reasoning: { effort: "high" } };
    expect(stripBooleanReasoning(body)).toBe(body);
  });

  it("leaves string reasoning untouched", () => {
    const body = { reasoning: "auto" };
    expect(stripBooleanReasoning(body)).toBe(body);
  });

  it("returns the body unchanged when reasoning is absent", () => {
    const body = { model: "x" };
    expect(stripBooleanReasoning(body)).toBe(body);
  });
});
