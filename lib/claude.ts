import Anthropic from "@anthropic-ai/sdk";

// Server-only: model choice and a small helper for JSON-schema calls to Claude.

/** Main model for /api/analyze. Override with ANTHROPIC_MODEL. */
export const DEFAULT_MODEL = "claude-haiku-5-5";
/** Fast model for web-lookup summaries and frame checks. Override with ANTHROPIC_FAST_MODEL. */
export const DEFAULT_FAST_MODEL = "claude-haiku-5-5";

// Models that accept the server-side refusal fallback parameter (Haiku 5.5 does not).
const FALLBACK_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-1",
  "claude-fable-5-2",
]);

export function analyzeModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

export function fastModel(): string {
  return process.env.ANTHROPIC_FAST_MODEL || DEFAULT_FAST_MODEL;
}

/** Turn thinking off where the model allows it at low effort; spoken answers need speed. */
function quickThinking(model: string) {
  if (model.startsWith("claude-haiku-5")) return { thinking: { type: "disabled" as const } };
  if (model === "claude-sonnet-5-5") return { thinking: { type: "between_tools" as const } };
  return {}; // e.g. Opus 5.5: thinking can't be turned off; low effort keeps it short
}

export type JsonCall = {
  model: string;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs?: number;
};

/**
 * One structured-output request at low effort. Returns the parsed JSON, or null on a refusal or
 * unparseable reply. API errors are thrown (Anthropic.APIError and subclasses).
 */
export async function askJson<T>(client: Anthropic, call: JsonCall): Promise<T | null> {
  const response = await client.beta.messages.create(
    {
      model: call.model,
      max_tokens: call.maxTokens,
      output_config: { effort: "low", format: { type: "json_schema", schema: call.schema } },
      ...quickThinking(call.model),
      ...(FALLBACK_MODELS.has(call.model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      system: call.system,
      messages: [{ role: "user", content: call.content }],
    },
    call.timeoutMs ? { timeout: call.timeoutMs, maxRetries: 0 } : undefined,
  );
  if (response.stop_reason === "refusal") return null;
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export const SECTIONS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: { title: { type: "string" }, body: { type: "string" } },
    required: ["title", "body"],
    additionalProperties: false,
  },
} as const;

/** Clean up model-produced sections: trimmed, non-empty, at most `max`. */
export function cleanSections(v: unknown, max = 6): { title: string; body: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) => ({
      title: typeof s?.title === "string" ? s.title.trim().slice(0, 80) : "",
      body: typeof s?.body === "string" ? s.body.trim().slice(0, 6000) : "",
    }))
    .filter((s) => s.title && s.body)
    .slice(0, max);
}

export function sectionsToText(sections: { title: string; body: string }[]): string {
  return sections.map((s) => `${s.title}\n${s.body}`).join("\n\n");
}
