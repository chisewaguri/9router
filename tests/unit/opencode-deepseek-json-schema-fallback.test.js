import { describe, expect, it } from "vitest";
import { OpenCodeExecutor } from "../../open-sse/executors/opencode.js";

/**
 * Port of OmniRoute #9992 (Zartharas): opencode's free DeepSeek V4 Flash
 * endpoint rejects json_schema response_format with a 400. The fallback
 * downgrades to json_object and injects the schema as a system instruction
 * so callers still receive structured JSON.
 */
function transform(model, body) {
  return new OpenCodeExecutor().applyDeepSeekJsonSchemaFallback(model, body);
}

describe("applyDeepSeekJsonSchemaFallback", () => {
  it("downgrades json_schema to json_object for deepseek-v4-flash-free", () => {
    const out = transform("deepseek-v4-flash-free", {
      model: "deepseek-v4-flash-free",
      messages: [{ role: "user", content: "give me json" }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "foo",
          schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
        },
      },
    });

    expect(out.response_format).toEqual({ type: "json_object" });
    const system = out.messages.find((m) => m.role === "system");
    expect(system).toBeTruthy();
    expect(system.content).toContain("```json");
    expect(system.content).toContain('"a"');
    expect(system.content).toContain("Respond ONLY with the JSON object");
  });

  it("appends the schema to an existing system message", () => {
    const out = transform("deepseek-v4-flash-free", {
      messages: [{ role: "system", content: "be brief" }, { role: "user", content: "hi" }],
      response_format: { type: "json_schema", json_schema: { schema: { type: "object" } } },
    });

    const system = out.messages.find((m) => m.role === "system");
    expect(system.content).toContain("be brief");
    expect(system.content).toContain("strictly follows");
  });

  it("leaves other models untouched", () => {
    const body = {
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "hi" }],
      response_format: { type: "json_schema", json_schema: { schema: { type: "object" } } },
    };
    expect(transform("deepseek-v4-flash", body)).toBe(body);
  });

  it("leaves json_object and missing response_format untouched", () => {
    const body = { messages: [], response_format: { type: "json_object" } };
    expect(transform("deepseek-v4-flash-free", body)).toBe(body);
    const body2 = { messages: [] };
    expect(transform("deepseek-v4-flash-free", body2)).toBe(body2);
  });
});
