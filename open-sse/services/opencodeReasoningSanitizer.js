/**
 * Strip boolean `reasoning` for opencode Go-backed providers.
 *
 * Port of OmniRoute #7891 (AndrianBalanescu). Providers routed through
 * opencode's zen Go backend (`opencode`, `opencode-go`) use a Go
 * ChatCompletionRequest struct where the `reasoning` field is typed as a
 * structured object, not a bool. When a client sends `reasoning: true` or
 * `reasoning: false` — valid per the OpenAI API for enabling/disabling
 * reasoning — the Go JSON decoder rejects it with:
 *
 *   400: json: cannot unmarshal bool into Go struct field
 *   ChatCompletionRequest.reasoning of type openai.Reasoning
 *
 * This strips a boolean `reasoning` field from the request body before it is
 * forwarded to these providers, allowing the upstream to apply its own default
 * reasoning behavior. If `reasoning` is already an object/string (matching the
 * Go struct), it is left untouched.
 */

// Providers whose requests hit opencode's Go ChatCompletion backend.
const OPENCODE_GO_PROVIDERS = new Set(["opencode", "opencode-go"]);

/** True when the provider's requests are handled by the opencode Go backend. */
export function isOpencodeGoProvider(provider) {
  return OPENCODE_GO_PROVIDERS.has(provider);
}

/**
 * Remove a boolean `reasoning` field from the request body.
 * Returns the same object reference if no change is needed, or a shallow
 * clone with the field removed.
 */
export function stripBooleanReasoning(body) {
  if (!body || typeof body !== "object") return body;
  if (!("reasoning" in body)) return body;
  const reasoning = body.reasoning;
  // Only strip when reasoning is a boolean — object/string forms are valid
  // for the Go struct and should be forwarded as-is.
  if (typeof reasoning !== "boolean") return body;
  const next = { ...body };
  delete next.reasoning;
  return next;
}
