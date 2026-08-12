import { describe, expect, it } from "vitest";
import { chatCompletionToResponses } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";

/**
 * Guards the DurinDoor a2b port: the forced-SSE→JSON fold must not drop the
 * Responses cache counters. Chat-format streams report cached tokens as
 * cached_tokens / prompt_tokens_details.cached_tokens; the folded Responses
 * usage must carry them under input_tokens_details.cached_tokens.
 */
describe("chatCompletionToResponses cache-token folding", () => {
  it("folds chat-format cached_tokens into input_tokens_details.cached_tokens", () => {
    const body = {
      id: "chatcmpl-123",
      model: "deepseek-v4-flash",
      usage: {
        prompt_tokens: 500,
        completion_tokens: 50,
        total_tokens: 550,
        cached_tokens: 400,
      },
      choices: [{ message: { role: "assistant", content: "hi" } }],
    };

    const out = chatCompletionToResponses(body);
    expect(out.usage.input_tokens).toBe(500);
    expect(out.usage.output_tokens).toBe(50);
    expect(out.usage.input_tokens_details.cached_tokens).toBe(400);
  });

  it("folds prompt_tokens_details.cached_tokens too", () => {
    const body = {
      id: "chatcmpl-456",
      model: "kimi-k3",
      usage: {
        prompt_tokens: 200,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 150 },
      },
      choices: [{ message: { role: "assistant", content: "ok" } }],
    };

    const out = chatCompletionToResponses(body);
    expect(out.usage.input_tokens_details.cached_tokens).toBe(150);
  });

  it("omits input_tokens_details when there are no cached tokens", () => {
    const body = {
      id: "chatcmpl-789",
      model: "gpt-5",
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      choices: [{ message: { role: "assistant", content: "x" } }],
    };

    const out = chatCompletionToResponses(body);
    expect(out.usage.input_tokens_details).toBeUndefined();
  });
});
