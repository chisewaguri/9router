import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { injectReasoningContent } from "../utils/reasoningContentInjector.js";

// Models that use /zen/v1/messages (claude format)
const MESSAGES_MODELS = new Set();

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super("opencode", PROVIDERS.opencode);
  }

  /**
   * OpenCode's free DeepSeek V4 Flash endpoint accepts json_object but
   * rejects json_schema response_format with HTTP 400. Preserve the schema
   * as an instruction and downgrade only this proven-incompatible route to
   * json_object so callers still receive structured JSON.
   * Port of OmniRoute #9992 (Zartharas).
   */
  applyDeepSeekJsonSchemaFallback(model, body) {
    if (model !== "deepseek-v4-flash-free" || this.provider !== "opencode") {
      return body;
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return body;
    }

    const responseFormat = body.response_format;
    if (responseFormat?.type !== "json_schema" || !responseFormat.json_schema?.schema) {
      return body;
    }

    const schemaJson = JSON.stringify(responseFormat.json_schema.schema, null, 2);

    const prompt =
      "You must respond with valid JSON that strictly follows " +
      "this JSON schema:\n```json\n" +
      schemaJson +
      "\n```\nRespond ONLY with the JSON object, no other text.";

    const messages = Array.isArray(body.messages)
      ? body.messages.map((message) => ({ ...message }))
      : [];

    const systemMessage = messages.find((message) => message.role === "system");

    if (systemMessage) {
      if (typeof systemMessage.content === "string") {
        systemMessage.content = `${systemMessage.content}\n\n${prompt}`;
      } else if (Array.isArray(systemMessage.content)) {
        systemMessage.content.push({
          type: "text",
          text: `\n\n${prompt}`,
        });
      }
    } else {
      messages.unshift({
        role: "system",
        content: prompt,
      });
    }

    return {
      ...body,
      messages,
      response_format: {
        type: "json_object",
      },
    };
  }

  transformRequest(model, body) {
    let modifiedBody = injectReasoningContent({ provider: this.provider, model, body });
    modifiedBody = this.applyDeepSeekJsonSchemaFallback(model, modifiedBody);
    return modifiedBody;
  }

  buildUrl(model) {
    const base = this.config.baseUrl;
    return MESSAGES_MODELS.has(model)
      ? `${base}/zen/v1/messages`
      : `${base}/zen/v1/chat/completions`;
  }

  buildHeaders() {
    return {
      "Content-Type": "application/json",
      "Authorization": "Bearer public",
      "x-opencode-client": "desktop",
      "Accept": "text/event-stream"
    };
  }
}
