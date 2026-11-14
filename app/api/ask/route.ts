import Anthropic from "@anthropic-ai/sdk";
import { ITEM_KINDS, LANGUAGES, type AskResponse, type ItemKind } from "@/lib/modes";
import { readJson } from "@/lib/http";
import { SECTIONS_SCHEMA, cleanSections, fastModel, quickThinking } from "@/lib/claude";
import {
  countScans,
  dbConfigured,
  deviceId,
  getScan,
  recentScans,
  searchScans,
  type ScanSummary,
} from "@/lib/db";

// "Ask your history": a Claude agent that answers questions about the user's earlier scans.
// It works through three read-only tools over Neon. Each tool runs a fixed, parameterized
// query scoped to this device's x-sightline-device ID. Claude never writes SQL.

export const maxDuration = 30;

const MAX_TURNS = 5;
const TOTAL_BUDGET_MS = 20_000;
const DEFAULT_TIME_ZONE = "America/Los_Angeles";

const KIND_PARAM = {
  type: "string",
  enum: ["", ...ITEM_KINDS],
  description: 'Only this kind of item, or "" for any.',
} as const;
const SINCE_PARAM = {
  type: "string",
  description:
    'Only scans at or after this time, as an ISO 8601 timestamp with offset, or "" for any time.',
} as const;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_scans",
    description:
      'Full-text search over the user\'s scans: titles, answers, sections such as allergens, prices and warnings, and web lookup summaries. Use a few key words, e.g. "cookies allergens" or "salmon price".',
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, kind: KIND_PARAM, since: SINCE_PARAM },
      required: ["query", "kind", "since"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "recent_scans",
    description: 'The user\'s most recent scans, newest first. Good for "what did I scan today".',
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "1 to 20" },
        kind: KIND_PARAM,
        since: SINCE_PARAM,
      },
      required: ["limit", "kind", "since"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_scan",
    description:
      "One scan in full by id, including every section and the web lookup's sections and sources.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    spokenText: { type: "string" },
    sections: SECTIONS_SCHEMA,
    scanIds: { type: "array", items: { type: "string" } },
  },
  required: ["spokenText", "sections", "scanIds"],
  additionalProperties: false,
} as const;

function systemPrompt(now: string, timeZone: string, language: string): string {
  return `You are SightLine's memory. The user is blind or has low vision and asks about things they scanned earlier with SightLine (labels, menus, medicine, signs, documents). Find the answer with the tools, then reply.

It is now ${now} (time zone ${timeZone}). Turn "today", "this morning", "yesterday" or "earlier" into a since timestamp with offset when that helps.

The user's message starts with what SightLine already pulled from their history: the scans that best match the question, and their most recent scans. Answer from those when they contain the answer. If they don't, call the tools: search_scans with other key words, recent_scans with a since time, or get_scan for one scan's full sections and web details. Scans are stored in English, so search with English key words, translating them if the question is in another language. Before saying something isn't in the history, search for it at least once. Never ask the user which item they mean: pick the most recent scan that fits and say which one you used. Never say you will check or search more; check first, then give a final answer. Use exact counts: scansToday is how many scans the user made today and totalScans how many in all; recentScans only holds the newest few.

Final reply, in ${language}:
- spokenText: read aloud, so one or two short sentences, about 30 words. Go straight to the answer ("The Nutter Butter cookies contain peanuts, wheat and soy."). Say roughly when it was scanned if that helps ("this morning"). Plain spoken sentences, no markdown or URLs. Always include any recall, warning or allergen that answers the question.
- sections: optional supporting detail in 0 to 3 short titled sections.
- scanIds: the ids of the scans your answer is based on.
Only use what the tools return. If the scans don't answer it, say so plainly ("I don't see a medicine in your recent scans.").`;
}

/** Midnight at the start of today in `timeZone`, as an ISO timestamp. */
function startOfToday(timeZone: string): string {
  const now = new Date();
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((x) => [x.type, Number(x.value)]),
  );
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - offset).toISOString();
}

function formatLocal(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Compact scan for the model: enough to answer most questions without a get_scan. */
function brief(s: ScanSummary, timeZone: string) {
  return {
    id: s.id,
    when: formatLocal(s.createdAt, timeZone),
    createdAt: s.createdAt,
    mode: s.mode,
    kind: s.itemKind,
    title: s.title,
    answer: s.spokenText,
    sections: s.sections.map((x) => ({ title: x.title, body: x.body.slice(0, 600) })),
    web: s.webSummary,
  };
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function kindArg(v: unknown): ItemKind | undefined {
  return ITEM_KINDS.includes(v as ItemKind) ? (v as ItemKind) : undefined;
}

export async function POST(request: Request) {
  const started = Date.now();
  const parsed = await readJson(request, 16_000);
  if (!parsed.ok) {
    return Response.json(
      {
        spokenText:
          parsed.reason === "too-large"
            ? "That question is too long. Please ask a shorter one."
            : "Sorry, that question didn't come through.",
        error: true,
      } satisfies AskResponse,
      { status: parsed.reason === "too-large" ? 413 : 400 },
    );
  }
  const body = parsed.body;
  const question = str(body.question, 500);
  const device = deviceId(request);
  if (!question) {
    return Response.json(
      {
        spokenText: "What would you like to know about your scans?",
        error: true,
      } satisfies AskResponse,
      { status: 400 },
    );
  }
  if (!device || !dbConfigured() || !process.env.ANTHROPIC_API_KEY) {
    return Response.json({
      spokenText: "Scan history isn't turned on, so I can't look back at earlier scans.",
      error: true,
    } satisfies AskResponse);
  }
  const language =
    typeof body.language === "string" && LANGUAGES.some((l) => l.name === body.language)
      ? body.language
      : "English";
  let timeZone = typeof body.timeZone === "string" ? body.timeZone : DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    timeZone = DEFAULT_TIME_ZONE;
  }
  const now = `${formatLocal(new Date().toISOString(), timeZone)} (${new Date().toISOString()} UTC)`;

  const seen = new Map<string, { id: string; title: string | null; createdAt: string }>();
  const remember = (s: { id: string; title: string | null; createdAt: string }) =>
    seen.set(s.id, { id: s.id, title: s.title, createdAt: s.createdAt });

  // Run one tool call. Every query is fixed SQL, parameterized and scoped to this device.
  async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
    if (name === "search_scans") {
      const rows = await searchScans(device!, {
        query: str(input.query, 200),
        kind: kindArg(input.kind),
        since: str(input.since, 40) || undefined,
      });
      if (!rows) return JSON.stringify({ error: "history unavailable" });
      rows.forEach(remember);
      return JSON.stringify({ scans: rows.map((r) => brief(r, timeZone)) });
    }
    if (name === "recent_scans") {
      const rows = await recentScans(device!, {
        limit: typeof input.limit === "number" ? input.limit : 5,
        kind: kindArg(input.kind),
        since: str(input.since, 40) || undefined,
      });
      if (!rows) return JSON.stringify({ error: "history unavailable" });
      rows.forEach(remember);
      return JSON.stringify({ scans: rows.map((r) => brief(r, timeZone)) });
    }
    if (name === "get_scan") {
      const scan = await getScan(device!, str(input.id, 60));
      if (!scan) return JSON.stringify({ error: "no scan with that id" });
      remember(scan);
      return JSON.stringify({
        id: scan.id,
        when: formatLocal(scan.createdAt, timeZone),
        mode: scan.mode,
        kind: scan.itemKind,
        title: scan.title,
        answer: scan.spokenText,
        sections: scan.sections,
        web:
          scan.lookup && !scan.lookup.error
            ? {
                summary: scan.lookup.spokenText,
                sections: scan.lookup.sections ?? [],
                sources: scan.lookup.sources.map((s) => s.title),
              }
            : null,
      });
    }
    return JSON.stringify({ error: `unknown tool ${name}` });
  }

  // Agent memory up front: the best full-text matches for the question and the latest scans,
  // fetched in parallel, so most questions are answered in one model turn.
  const [matches, recent, counts] = await Promise.all([
    searchScans(device, { query: question, limit: 4 }),
    recentScans(device, { limit: 8 }),
    countScans(device, startOfToday(timeZone)),
  ]);
  if (!matches && !recent) {
    return Response.json({
      spokenText: "I can't reach your scan history right now. Please try again in a moment.",
      error: true,
    } satisfies AskResponse);
  }
  matches?.forEach(remember);
  recent?.forEach(remember);
  const memory = {
    ...(counts ? { scansToday: counts.since, totalScans: counts.total } : {}),
    bestMatches: (matches ?? []).map((r) => brief(r, timeZone)),
    recentScans: (recent ?? []).map((r) => ({
      id: r.id,
      when: formatLocal(r.createdAt, timeZone),
      kind: r.itemKind,
      title: r.title,
      answer: r.spokenText,
    })),
  };
  const firstMessage = `From the user's scan history:\n${JSON.stringify(memory)}\n\nQuestion: ${question}`;

  const client = new Anthropic();
  const model = fastModel();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: firstMessage }];
  const toolLog: string[] = [];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const last = turn === MAX_TURNS - 1;
      const response = await client.beta.messages.create(
        {
          model,
          max_tokens: 1500,
          ...quickThinking(model),
          output_config: { effort: "low", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
          system: systemPrompt(now, timeZone, language),
          tools: TOOLS,
          // On the last turn, no more tools: answer with what was found.
          ...(last ? { tool_choice: { type: "none" as const } } : {}),
          messages,
        },
        { timeout: Math.max(2_000, TOTAL_BUDGET_MS - (Date.now() - started)), maxRetries: 0 },
      );

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          const input = (block.input ?? {}) as Record<string, unknown>;
          toolLog.push(`${block.name}(${JSON.stringify(input)})`);
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: await runTool(block.name, input),
          });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      let parsed: { spokenText?: unknown; sections?: unknown; scanIds?: unknown } = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { spokenText: text };
      }
      // Safety net: drop a trailing "Let me search…" sentence; the answer is final.
      const spokenText =
        str(parsed.spokenText, 1000)
          .replace(/\s*(Let me|I'll|I will)\b[^.!?]*(search|check|look)[^.!?]*[.!?]?\s*$/i, "")
          .trim() || "Sorry, I couldn't find an answer in your scans.";
      const ids = Array.isArray(parsed.scanIds) ? parsed.scanIds : [];
      // Only scans the tools actually returned, so the list can't point at made-up ids.
      const scans = ids.flatMap((id) =>
        typeof id === "string" && seen.has(id) ? [seen.get(id)!] : [],
      );
      console.log(
        `[ask] ${Date.now() - started}ms turns=${turn + 1} tools=${toolLog.join(" ") || "-"}`,
      );
      return Response.json(
        { spokenText, sections: cleanSections(parsed.sections, 3), scans } satisfies AskResponse,
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    throw new Error("no answer after the last turn");
  } catch (error) {
    console.error("Ask failed:", error instanceof Error ? error.message : error);
    const timedOut = error instanceof Anthropic.APIConnectionTimeoutError;
    return Response.json(
      {
        spokenText: timedOut
          ? "That took too long. Please ask again."
          : "Sorry, I couldn't look through your scans just now.",
        error: true,
      } satisfies AskResponse,
      { status: 200 },
    );
  }
}
