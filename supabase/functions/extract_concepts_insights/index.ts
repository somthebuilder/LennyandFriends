/// <reference path="../deno_shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_SEGMENT_TYPES = ["interview", "lightning_round"] as const;
const DEFAULT_SAMPLE_CHUNKS = 220;
const DEFAULT_CONCEPT_COUNT = 12;
const DEFAULT_INSIGHT_COUNT = 10;
const FETCH_MULTIPLIER = 6;
// Longform expansion is handled by the separate generate_concept_article Edge Function.
const GEMINI_MODEL = Deno.env.get("GEMINI_CHAT_MODEL") ?? "gemini-2.5-flash";
const OPENAI_MODEL = Deno.env.get("OPENAI_CHAT_MODEL") ?? "gpt-4.1-mini";

type ChunkRow = {
  chunk_id: string;
  text: string;
  guest_id: string | null;
  episode_id: string | null;
  timestamp: string | null;
  segment_type: "interview" | "lightning_round";
};

type EpisodeRow = { id: string; title: string | null; youtube_url: string | null; keywords: unknown | null };
type GuestRow = { id: string; full_name: string };

type LlmReference = {
  evidence_index: number;
  quote?: string;
};

type LlmConcept = {
  title: string;
  slug?: string;
  summary: string;
  body: string;
  category?: string;
  theme_label?: string;
  references: LlmReference[];
};

type LlmInsight = {
  title: string;
  slug?: string;
  takeaway: string;
  signal: "high_consensus" | "split_view" | "emerging";
  trend?: "stable" | "emerging" | "fading";
  category?: string;
  theme_label?: string;
  explanation: string[];
  evidence: LlmReference[];
};

type LlmPayload = {
  concepts: LlmConcept[];
  insights: LlmInsight[];
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function getFirstEnv(names: string[]): string | null {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return null;
}

function parseTimestampToSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const clean = value.trim();
  if (!clean) return null;
  const parts = clean.split(":").map((n) => Number.parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function addTimeParam(url: string | null | undefined, seconds: number | null): string | null {
  if (!url) return null;
  if (seconds === null || seconds < 0) return url;
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}t=${Math.floor(seconds)}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeKeyword(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function extractKeywordLabels(value: unknown): string[] {
  if (!value) return [];
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (out.length >= 24) return;
    if (typeof node === "string") {
      const clean = node.trim();
      if (clean) out.push(clean);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      for (const [key, val] of Object.entries(obj)) {
        if (["name", "label", "keyword", "topic", "value", "title"].includes(key) && typeof val === "string") {
          const clean = val.trim();
          if (clean) out.push(clean);
        } else if (Array.isArray(val) || (val && typeof val === "object")) {
          visit(val);
        }
      }
    }
  };
  visit(value);

  const dedup = new Set<string>();
  const normalized: string[] = [];
  for (const label of out) {
    const key = normalizeKeyword(label);
    if (!key || dedup.has(key)) continue;
    dedup.add(key);
    normalized.push(label);
  }
  return normalized.slice(0, 10);
}

function inferCategoryFromTheme(themeLabel: string | null): string | null {
  if (!themeLabel) return null;
  const theme = themeLabel.toLowerCase();
  if (theme.includes("growth") || theme.includes("retention") || theme.includes("acquisition")) return "growth";
  if (theme.includes("sales") || theme.includes("pricing") || theme.includes("gtm") || theme.includes("go-to-market")) return "sales";
  if (theme.includes("career") || theme.includes("hiring") || theme.includes("talent") || theme.includes("team") || theme.includes("leadership")) return "people";
  if (theme.includes("ai") || theme.includes("automation") || theme.includes("tooling") || theme.includes("platform")) return "technology";
  if (theme.includes("roadmap") || theme.includes("prioritization") || theme.includes("product")) return "product";
  if (theme.includes("ops") || theme.includes("operation")) return "operations";
  return "strategy";
}

function topKeywordFromEvidenceIndexes(
  indexes: number[],
  evidenceRows: Array<{ keyword_labels?: string[] }>
): string | null {
  const freq = new Map<string, { label: string; count: number }>();
  for (const index of indexes) {
    const ev = evidenceRows[index];
    if (!ev?.keyword_labels?.length) continue;
    for (const label of ev.keyword_labels) {
      const key = normalizeKeyword(label);
      const existing = freq.get(key);
      if (existing) existing.count += 1;
      else freq.set(key, { label, count: 1 });
    }
  }
  const winner = [...freq.values()].sort((a, b) => b.count - a.count)[0];
  return winner?.label ?? null;
}

function takeKeywordDiverseChunks(
  input: ChunkRow[],
  target: number,
  episodeKeywordMap: Map<string, string[]>
): ChunkRow[] {
  if (input.length <= target) return input;

  const byKeyword = new Map<string, ChunkRow[]>();
  for (const row of input) {
    const labels = row.episode_id ? (episodeKeywordMap.get(row.episode_id) ?? []) : [];
    const keys = labels.length ? labels : ["__no_keyword__"];
    for (const label of keys.slice(0, 3)) {
      const key = normalizeKeyword(label) || "__no_keyword__";
      const list = byKeyword.get(key) ?? [];
      list.push(row);
      byKeyword.set(key, list);
    }
  }

  const out: ChunkRow[] = [];
  const used = new Set<string>();
  const episodeCounts = new Map<string, number>();
  const guestCounts = new Map<string, number>();

  const keywordKeys = [...byKeyword.keys()].sort((a, b) => {
    const as = byKeyword.get(a)?.length ?? 0;
    const bs = byKeyword.get(b)?.length ?? 0;
    return bs - as;
  });

  // Pass 1: sample across keyword groups, preferring underrepresented episodes and guests.
  let cursor = 0;
  let roundsWithoutPick = 0;
  while (out.length < target && keywordKeys.length > 0 && roundsWithoutPick < keywordKeys.length * 2) {
    const key = keywordKeys[cursor % keywordKeys.length];
    const pool = byKeyword.get(key) ?? [];
    let bestIdx = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pool.length; i += 1) {
      const row = pool[i];
      if (used.has(row.chunk_id)) continue;
      const episodeKey = row.episode_id ?? "__unknown_episode__";
      const guestKey = row.guest_id ?? "__unknown_guest__";
      const score = (episodeCounts.get(episodeKey) ?? 0) * 10 + (guestCounts.get(guestKey) ?? 0);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const picked = pool[bestIdx];
      out.push(picked);
      used.add(picked.chunk_id);
      const episodeKey = picked.episode_id ?? "__unknown_episode__";
      const guestKey = picked.guest_id ?? "__unknown_guest__";
      episodeCounts.set(episodeKey, (episodeCounts.get(episodeKey) ?? 0) + 1);
      guestCounts.set(guestKey, (guestCounts.get(guestKey) ?? 0) + 1);
      roundsWithoutPick = 0;
    } else {
      roundsWithoutPick += 1;
    }
    cursor += 1;
  }

  if (out.length >= target) return out.slice(0, target);

  // Pass 2: fill from remaining rows with the same balancing objective.
  for (const row of input) {
    if (used.has(row.chunk_id)) continue;
    const episodeKey = row.episode_id ?? "__unknown_episode__";
    const guestKey = row.guest_id ?? "__unknown_guest__";
    const shouldSkip =
      (episodeCounts.get(episodeKey) ?? 0) > 4 && (guestCounts.get(guestKey) ?? 0) > 3 && out.length < target - 10;
    if (shouldSkip) continue;
    out.push(row);
    used.add(row.chunk_id);
    episodeCounts.set(episodeKey, (episodeCounts.get(episodeKey) ?? 0) + 1);
    guestCounts.set(guestKey, (guestCounts.get(guestKey) ?? 0) + 1);
    if (out.length >= target) break;
  }
  return out.slice(0, target);
}

/**
 * Permanently fixes "Bad escaped character in JSON" errors from Gemini.
 * Walks the raw text character-by-character and repairs:
 *  - invalid escape sequences (e.g. \S \w \d)
 *  - literal newlines / tabs / carriage returns inside JSON strings
 *  - stray control characters
 */
function repairJsonString(raw: string): string {
  // Strip markdown code fences
  let text = raw.replace(/^```(?:json)?\s*/gm, "").replace(/```\s*$/gm, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return raw;
  text = text.slice(start, end + 1);

  // Fast path: already valid
  try { JSON.parse(text); return text; } catch { /* needs repair */ }

  const out: string[] = [];
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      // Valid JSON escape chars: " \ / b f n r t u
      if ('"\\\/bfnrtu'.includes(c)) {
        out.push(c);
      } else {
        // Invalid escape like \S → emit \\S (double-escape the backslash)
        out.push("\\", c);
      }
      escaped = false;
      continue;
    }
    if (c === "\\" && inStr) {
      out.push(c);
      escaped = true;
      continue;
    }
    if (c === '"' && !escaped) {
      inStr = !inStr;
      out.push(c);
      continue;
    }
    if (inStr) {
      if (c === "\n") { out.push("\\n"); continue; }
      if (c === "\r") { out.push("\\r"); continue; }
      if (c === "\t") { out.push("\\t"); continue; }
      const code = c.charCodeAt(0);
      if (code < 0x20) continue; // drop control chars
    }
    out.push(c);
  }

  const repaired = out.join("");
  try { JSON.parse(repaired); return repaired; } catch { /* last resort */ }
  return raw;
}

function extractJson(text: string): LlmPayload {
  const repaired = repairJsonString(text);
  const start = repaired.indexOf("{");
  const end = repaired.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Model response did not contain JSON object");
  const parsed = JSON.parse(repaired.slice(start, end + 1)) as LlmPayload;
  if (!Array.isArray(parsed.concepts) || !Array.isArray(parsed.insights)) {
    throw new Error("Model output schema mismatch");
  }
  return parsed;
}

async function generateWithGemini(geminiKey: string, prompt: string): Promise<LlmPayload> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
      geminiKey
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini generation failed: ${res.status} ${await res.text()}`);
  }
  const payload = await res.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
  if (!text) throw new Error("Gemini output missing text");
  return extractJson(text);
}

async function generateWithOpenAi(openAiKey: string, prompt: string): Promise<LlmPayload> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return valid JSON only. Keep claims grounded in the provided evidence snippets and avoid speculative statements.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI generation failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content as string | undefined;
  if (!text) throw new Error("OpenAI output missing text");
  return extractJson(text);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = getFirstEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);
    const openAiKey = getFirstEnv(["OPENAI_API_KEY", "OpenAI_API_KEY"]);

    const body = await req.json().catch(() => ({}));
    const podcastSlug = String(body.podcastSlug ?? "lennys-podcast").trim();
    const mode = String(body.mode ?? "both").trim().toLowerCase(); // both | concepts | insights
    const enableLongform = false; // Longform done by generate_concept_article separately
    const dryRun = Boolean(body.dryRun ?? false);
    const geminiOnly = Boolean(body.geminiOnly ?? false);
    const minGuestsPerInsight = Math.max(2, Math.min(8, Number(body.minGuestsPerInsight ?? 2)));
    const minConceptWords = Math.max(100, Math.min(1600, Number(body.minConceptWords ?? 150)));
    const sampleChunks = Math.min(500, Math.max(60, Number(body.sampleChunks ?? DEFAULT_SAMPLE_CHUNKS)));
    const conceptCount = Math.min(40, Math.max(8, Number(body.conceptCount ?? DEFAULT_CONCEPT_COUNT)));
    const insightCount = Math.min(40, Math.max(8, Number(body.insightCount ?? DEFAULT_INSIGHT_COUNT)));
    const targetConceptCount = mode === "insights" ? 0 : conceptCount;
    const targetInsightCount = mode === "concepts" ? 0 : insightCount;
    const effectiveConceptTarget = targetConceptCount;

    if (!supabaseUrl || !serviceRole || (geminiOnly ? !geminiKey : (!geminiKey && !openAiKey))) {
      return json(500, {
        error: "Missing required secrets",
        missing: {
          SUPABASE_URL: !supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: !serviceRole,
          GEMINI_OR_OPENAI_KEY: !geminiKey && !openAiKey,
        },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const { data: podcast, error: podcastError } = await supabase
      .from("podcasts")
      .select("id,slug,name")
      .eq("slug", podcastSlug)
      .maybeSingle();
    if (podcastError || !podcast) return json(404, { error: "Podcast not found", podcastSlug });

    const fetchLimit = Math.min(3000, sampleChunks * FETCH_MULTIPLIER);
    const chunkRes = await supabase
      .from("chunk_embeddings")
      .select("chunk_id,text,guest_id,episode_id,timestamp,segment_type")
      .in("segment_type", [...ALLOWED_SEGMENT_TYPES])
      .not("text", "is", null)
      .order("updated_at", { ascending: false })
      .limit(fetchLimit);
    if (chunkRes.error) return json(500, { error: `Failed to load chunks: ${chunkRes.error.message}` });
    const fetchedChunks = (chunkRes.data ?? []) as ChunkRow[];

    const fetchedEpisodeIds = [...new Set(fetchedChunks.map((c) => c.episode_id).filter(Boolean))] as string[];
    const { data: fetchedEpisodes } = fetchedEpisodeIds.length
      ? await supabase.from("episodes").select("id,title,youtube_url,keywords").in("id", fetchedEpisodeIds)
      : { data: [] as EpisodeRow[] };
    const episodeKeywordMap = new Map<string, string[]>(
      (fetchedEpisodes ?? []).map((episode) => [episode.id, extractKeywordLabels(episode.keywords)])
    );

    const chunks = takeKeywordDiverseChunks(fetchedChunks, sampleChunks, episodeKeywordMap);
    if (!chunks.length) return json(400, { error: "No chunk evidence found" });

    const guestIds = [...new Set(chunks.map((c) => c.guest_id).filter(Boolean))] as string[];
    const episodeIds = [...new Set(chunks.map((c) => c.episode_id).filter(Boolean))] as string[];

    const [{ data: guests }, { data: episodes }] = await Promise.all([
      guestIds.length
        ? supabase.from("guests").select("id,full_name").in("id", guestIds)
        : Promise.resolve({ data: [] as GuestRow[] }),
      Promise.resolve({
        data: (fetchedEpisodes ?? []).filter((episode) => episodeIds.includes(episode.id)) as EpisodeRow[],
      }),
    ]);

    const guestMap = new Map((guests ?? []).map((g) => [g.id, g.full_name]));
    const episodeMap = new Map((episodes ?? []).map((e) => [e.id, e]));

    // Fetch theme taxonomy labels for richer category/theme assignment
    const { data: themeLabelRows } = await supabase
      .from("themes")
      .select("label")
      .not("label", "is", null)
      .limit(30);
    const themeLabels = (themeLabelRows ?? [])
      .map((r) => String((r as { label?: string }).label ?? "").trim())
      .filter((l) => l.length > 3 && !l.toLowerCase().includes("transition") && !l.toLowerCase().includes("conclusion"));

    const evidence = chunks.map((chunk, idx) => {
      const guestName = chunk.guest_id ? guestMap.get(chunk.guest_id) ?? chunk.guest_id : "Unknown guest";
      const episode = chunk.episode_id ? (episodeMap.get(chunk.episode_id) as EpisodeRow | undefined) : undefined;
      const episodeTitle = episode?.title ?? chunk.episode_id ?? "Unknown episode";
      const excerpt = chunk.text.replace(/\s+/g, " ").trim().slice(0, 380);
      return {
        idx,
        chunk_id: chunk.chunk_id,
        guest_id: chunk.guest_id,
        episode_id: chunk.episode_id,
        timestamp: chunk.timestamp,
        time_seconds: parseTimestampToSeconds(chunk.timestamp),
        episode_title: episodeTitle,
        episode_url: episode?.youtube_url ?? null,
        keyword_labels: episode?.keywords ? extractKeywordLabels(episode.keywords) : [],
        excerpt,
      };
    });

    const themeHint = themeLabels.length
      ? `\nKnown themes in this podcast (use for category/theme_label assignment):\n${themeLabels.join(", ")}\n`
      : "";

    const prompt = [
      `You are curating a world-class podcast knowledge base for "${podcast.name}".`,
      "",
      "Objective:",
      `1) Produce ${targetConceptCount} high-quality concepts.`,
      `2) Produce ${targetInsightCount} high-quality insights.`,
      "",
      "IMPORTANT - Topic scope is WIDE. Mine for:",
      "- Product strategy, growth, retention, go-to-market, pricing",
      "- Leadership styles, management philosophies, decision-making frameworks",
      "- Team building, hiring, culture, conflict resolution",
      "- Career development, upskilling, personal growth, mentorship",
      "- Personality traits, attitudes, and mindsets of successful operators",
      "- What works and what doesn't - practical lessons from real experience",
      "- Behavioral patterns, habits, and contrarian viewpoints",
      "- Emotional intelligence, self-awareness, resilience",
      "- Any other substantive topic discussed with genuine conviction by guests",
      "",
      "Strict rules:",
      "- Ground every concept/insight in provided evidence indexes ONLY. Do not invent claims.",
      "- Concepts should be holistic, conviction-heavy viewpoints on a topic. Write a CONCISE overview (400-600 words) covering the core idea, why it matters, and key practical implications. Full long-form articles will be generated separately.",
      "- DO NOT hard-cap guest count; allow more guests when evidence quality supports it.",
      "- Ensure broad theme/category coverage; avoid repetitive variants of the same topic.",
      "- Keep language crisp, specific, and practitioner-focused - not generic or academic.",
      "- References must include direct quote snippets from the evidence when available.",
      "- Use multiple evidence indexes per item (4-12 for concepts, 3-8 for insights).",
      `- An insight is only valid when supported by at least ${minGuestsPerInsight} DISTINCT guests (different guest_id values). If fewer guests support it, exclude it.`,
      "- Prioritize cross-guest patterns that recur across many episodes.",
      "- Use episode keywords to improve theme/category clustering.",
      "- For insights, include a realistic MIX across high_consensus, split_view, and emerging.",
      themeHint,
      "JSON schema (exact keys):",
      "{",
      '  "concepts": [',
      "    {",
      '      "title": "string",',
      '      "slug": "string (kebab-case)",',
      '      "summary": "string (2-3 sentences)",',
      '      "body": "string markdown, 400-600 words. Concise overview only. No numbered section headings.",',
      '      "category": "string (e.g. product, growth, people, leadership, technology, operations, strategy, career)",',
      '      "theme_label": "string (specific theme name)",',
      '      "references": [{"evidence_index": 0, "quote": "direct quote snippet"}]',
      "    }",
      "  ],",
      '  "insights": [',
      "    {",
      '      "title": "string",',
      '      "slug": "string (kebab-case)",',
      '      "takeaway": "string (1-2 sentences, practical and specific)",',
      '      "signal": "high_consensus|split_view|emerging",',
      '      "trend": "stable|emerging|fading",',
      '      "category": "string",',
      '      "theme_label": "string",',
      '      "explanation": ["string", "string", "string"] (3 distinct bullet points explaining the pattern)',
      '      "evidence": [{"evidence_index": 0, "quote": "direct quote snippet"}]',
      "    }",
      "  ]",
      "}",
      "",
      "Evidence snippets:",
      ...evidence.map(
        (e) =>
          `[${e.idx}] chunk_id=${e.chunk_id} | guest=${e.guest_id ?? "na"} | episode=${e.episode_id ?? "na"} | time=${e.timestamp ?? "na"} | keywords=${
            e.keyword_labels?.join(", ") || "na"
          }\n${e.excerpt}`
      ),
    ].join("\n");

    let llmPayload: LlmPayload | null = null;
    let modelUsed = "";
    let geminiFailureReason: string | null = null;

    async function generateOnce(currentPrompt: string): Promise<void> {
      if (!geminiKey) {
        throw new Error("Gemini key unavailable");
      }
      try {
        llmPayload = await generateWithGemini(geminiKey, currentPrompt);
        modelUsed = `gemini:${GEMINI_MODEL}`;
        geminiFailureReason = null;
        return;
      } catch (err) {
        geminiFailureReason = err instanceof Error ? err.message : String(err);
        if (geminiOnly) {
          throw new Error(`Gemini-only mode enabled and Gemini generation failed: ${geminiFailureReason}`);
        }
        if (!openAiKey) throw new Error("Gemini failed and OpenAI fallback key unavailable");
      }
      if (!openAiKey) throw new Error("No generation provider available");
      llmPayload = await generateWithOpenAi(openAiKey, currentPrompt);
      modelUsed = `openai:${OPENAI_MODEL}`;
    }

    await generateOnce(prompt);
    const requirePayload = (): LlmPayload => {
      if (!llmPayload) {
        throw new Error("No LLM payload returned from generation providers");
      }
      return llmPayload;
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const currentPayload = requirePayload();
      const conceptLen = currentPayload.concepts.length;
      const insightLen = currentPayload.insights.length;
      const signalKinds = new Set(
        (currentPayload.insights ?? [])
          .map((insight) => insight?.signal)
          .filter((signal): signal is "high_consensus" | "split_view" | "emerging" =>
            signal === "high_consensus" || signal === "split_view" || signal === "emerging"
          )
      ).size;
      const conceptsGood =
        targetConceptCount === 0 || conceptLen >= Math.max(4, Math.floor(targetConceptCount * 0.6));
      const insightsGood =
        targetInsightCount === 0 || insightLen >= Math.max(4, Math.floor(targetInsightCount * 0.6));
      const insightsSignalGood = targetInsightCount === 0 || signalKinds >= 2;
      if (conceptsGood && insightsGood && insightsSignalGood) {
        break;
      }
      const retryPrompt = [
        prompt,
        "",
        `Previous attempt returned too few items (concepts=${conceptLen}, insights=${insightLen}).`,
        `Return at least ${targetConceptCount} concepts and ${targetInsightCount} insights in one JSON response.`,
        `Current signal diversity count=${signalKinds}. Ensure insight signals include at least two of: high_consensus, split_view, emerging.`,
        "Do not skip items because of uncertainty; use strongest available grounded evidence indexes.",
      ].join("\n");
      await generateOnce(retryPrompt);
    }
    const payload = requirePayload();
    const rawConceptCount = payload.concepts.length;
    const rawInsightCount = payload.insights.length;

    const baseConcepts = payload.concepts
      .map((c) => ({
        ...c,
        references: Array.isArray(c.references) ? c.references : [],
      }))
      .filter((c) => c.title && c.summary && c.body && c.references.length >= 3);

    const expandedConcepts = baseConcepts.slice(0, effectiveConceptTarget);

    // Concept filtering: require basic quality (title, summary, body >=150 words, 3+ refs)
    // Section heading validation is NOT applied here — that's for longform expansion via generate_concept_article.
    const byThemeConcept = new Map<string, number>();
    const concepts = expandedConcepts
      .filter((c) => wordCount(c.body) >= minConceptWords)
      .filter((c) => {
        const themeKey = (c.theme_label ?? "general").toLowerCase().trim();
        const count = byThemeConcept.get(themeKey) ?? 0;
        if (count >= 3) return false;
        byThemeConcept.set(themeKey, count + 1);
        return true;
      })
      .slice(0, effectiveConceptTarget);

    const insights = payload.insights
      .map((i) => ({
        ...i,
        explanation: Array.isArray(i.explanation) ? i.explanation.filter((s) => typeof s === "string") : [],
        evidence: Array.isArray(i.evidence) ? i.evidence : [],
      }))
      .filter((i) => i.title && i.takeaway && i.evidence.length >= 1 && i.explanation.length >= 1)
      .map((i) => {
        const guests = new Set(
          i.evidence
            .map((ref) => evidence[ref.evidence_index]?.guest_id ?? null)
            .filter((guestId): guestId is string => Boolean(guestId))
        );
        const episodesCovered = new Set(
          i.evidence
            .map((ref) => evidence[ref.evidence_index]?.episode_id ?? null)
            .filter((episodeId): episodeId is string => Boolean(episodeId))
        );
        return { ...i, __guestCount: guests.size, __episodeCount: episodesCovered.size };
      })
      .filter((i) => i.__guestCount >= minGuestsPerInsight)
      .sort((a, b) => {
        if (b.__guestCount !== a.__guestCount) return b.__guestCount - a.__guestCount;
        return b.__episodeCount - a.__episodeCount;
      })
      .slice(0, targetInsightCount);
    const signalBreakdown = insights.reduce(
      (acc, insight) => {
        if (insight.signal === "high_consensus") acc.high_consensus += 1;
        if (insight.signal === "split_view") acc.split_view += 1;
        if (insight.signal === "emerging") acc.emerging += 1;
        return acc;
      },
      { high_consensus: 0, split_view: 0, emerging: 0 }
    );

    const conceptDiagnostics = concepts.map((c) => {
      const refs = c.references
        .map((r) => evidence[r.evidence_index])
        .filter(Boolean);
      const guests = new Set(refs.map((r) => r.guest_id).filter(Boolean));
      const episodesSet = new Set(refs.map((r) => r.episode_id).filter(Boolean));
      return {
        title: c.title,
        theme_label: c.theme_label ?? null,
        category: c.category ?? null,
        guest_count: guests.size,
        episode_count: episodesSet.size,
      };
    });

    const insightDiagnostics = insights.map((i) => {
      const refs = i.evidence
        .map((r) => evidence[r.evidence_index])
        .filter(Boolean);
      const guests = new Set(refs.map((r) => r.guest_id).filter(Boolean));
      const episodesSet = new Set(refs.map((r) => r.episode_id).filter(Boolean));
      const keywordSet = new Set(
        refs.flatMap((r) => (r.keyword_labels ?? []).map((k) => normalizeKeyword(k))).filter(Boolean)
      );
      return {
        title: i.title,
        signal: i.signal,
        guest_count: guests.size,
        episode_count: episodesSet.size,
        keyword_count: keywordSet.size,
      };
    });

    const keywordCoverage = new Set(
      evidence.flatMap((e) => (e.keyword_labels ?? []).map((k) => normalizeKeyword(k))).filter(Boolean)
    ).size;

    const previewConcepts = concepts.slice(0, 8).map((concept, idx) => {
      const refs = concept.references
        .map((ref) => ({ ref, ev: evidence[ref.evidence_index] }))
        .filter((item) => Boolean(item.ev))
        .map((item) => {
          const ev = item.ev!;
          return {
            guest_name: ev.guest_id ? guestMap.get(ev.guest_id) ?? "Unknown guest" : "Unknown guest",
            episode_title: ev.episode_title ?? "Unknown episode",
            episode_url: addTimeParam(ev.episode_url, ev.time_seconds) ?? undefined,
            timestamp: ev.timestamp ?? undefined,
            time_seconds: ev.time_seconds ?? undefined,
            quote: item.ref.quote?.trim() || undefined,
          };
        });
      const guestCount = new Set(
        refs.map((ref) => ref.guest_name).filter(Boolean)
      ).size;
      const episodeCount = new Set(
        refs.map((ref) => ref.episode_title).filter(Boolean)
      ).size;
      return {
        id: `dry-concept-${idx + 1}`,
        title: concept.title.trim(),
        slug: slugify(concept.slug?.trim() || concept.title),
        summary: concept.summary.trim(),
        body: concept.body.trim(),
        category: concept.category?.trim() || null,
        theme_label: concept.theme_label?.trim() || null,
        guest_count: guestCount,
        episode_count: episodeCount,
        created_at: new Date().toISOString(),
        references: refs,
      };
    });

    const previewInsights = insights.slice(0, 10).map((insight, idx) => {
      const refs = insight.evidence
        .map((ref) => ({ ref, ev: evidence[ref.evidence_index] }))
        .filter((item) => Boolean(item.ev))
        .map((item) => {
          const ev = item.ev!;
          return {
            guest_name: ev.guest_id ? guestMap.get(ev.guest_id) ?? "Unknown guest" : "Unknown guest",
            episode_title: ev.episode_title ?? "Unknown episode",
            episode_url: addTimeParam(ev.episode_url, ev.time_seconds) ?? undefined,
            timestamp: ev.timestamp ?? undefined,
            time_seconds: ev.time_seconds ?? undefined,
            quote: item.ref.quote?.trim() || undefined,
          };
        });
      const guestCount = new Set(
        refs.map((ref) => ref.guest_name).filter(Boolean)
      ).size;
      const episodeCount = new Set(
        refs.map((ref) => ref.episode_title).filter(Boolean)
      ).size;
      return {
        id: `dry-insight-${idx + 1}`,
        title: insight.title.trim(),
        takeaway: insight.takeaway.trim(),
        signal: insight.signal,
        category: insight.category?.trim() || null,
        theme_label: insight.theme_label?.trim() || null,
        guest_count: guestCount,
        episode_count: episodeCount,
        explanation: insight.explanation.slice(0, 5),
        evidence: refs,
        trend: insight.trend ?? null,
        created_at: new Date().toISOString(),
      };
    });

    if (dryRun) {
      return json(200, {
        dryRun: true,
        modelUsed,
        geminiFailureReason,
        enableLongform,
        rawConceptCount,
        rawInsightCount,
        sampleChunks,
        conceptsGenerated: concepts.length,
        insightsGenerated: insights.length,
        signalBreakdown,
        keywordCoverage,
        sampleConceptWordCounts: payload.concepts.slice(0, 5).map((c) => wordCount(c.body ?? "")),
        conceptDiagnostics,
        insightDiagnostics,
        previewConcepts,
        previewInsights,
      });
    }

    const minConceptsRequired = effectiveConceptTarget === 0 ? 0 : Math.max(2, Math.floor(effectiveConceptTarget * 0.5));
    const minInsightsRequired = targetInsightCount === 0 ? 0 : Math.max(2, Math.floor(targetInsightCount * 0.5));
    if (concepts.length < minConceptsRequired || insights.length < minInsightsRequired) {
      return json(422, {
        error: "Extraction quality gate failed",
        detail: `Generated concepts=${concepts.length} (min ${minConceptsRequired}), insights=${insights.length} (min ${minInsightsRequired})`,
        modelUsed,
        geminiFailureReason,
      });
    }

    if (targetConceptCount > 0) {
      const existingConcepts = await supabase.from("concepts").select("id").eq("podcast_id", podcast.id);
      const existingConceptIds = (existingConcepts.data ?? []).map((r) => r.id as string);
      if (existingConceptIds.length) {
        await supabase.from("concept_chunks").delete().in("concept_id", existingConceptIds);
        await supabase.from("concept_references").delete().in("concept_id", existingConceptIds);
        await supabase.from("concepts").delete().in("id", existingConceptIds);
      }
    }

    if (targetInsightCount > 0) {
      const existingInsights = await supabase.from("insights").select("id").eq("podcast_id", podcast.id);
      const existingInsightIds = (existingInsights.data ?? []).map((r) => r.id as string);
      if (existingInsightIds.length) {
        await supabase.from("insight_evidence").delete().in("insight_id", existingInsightIds);
        await supabase.from("insights").delete().in("id", existingInsightIds);
      }
    }

    const conceptRows = concepts.map((concept) => {
      const refs = concept.references
        .map((r) => evidence[r.evidence_index])
        .filter(Boolean);
      const guests = new Set(refs.map((r) => r.guest_id).filter(Boolean));
      const episodesSet = new Set(refs.map((r) => r.episode_id).filter(Boolean));
      return {
        podcast_id: podcast.id,
        title: concept.title.trim(),
        slug: slugify(concept.slug?.trim() || concept.title),
        summary: concept.summary.trim(),
        body: concept.body.trim(),
        status: "published",
        category:
          concept.category?.trim() ||
          inferCategoryFromTheme(
            concept.theme_label?.trim() || topKeywordFromEvidenceIndexes(concept.references.map((r) => r.evidence_index), evidence)
          ) ||
          null,
        theme_label:
          concept.theme_label?.trim() ||
          topKeywordFromEvidenceIndexes(concept.references.map((r) => r.evidence_index), evidence) ||
          null,
        guest_count: guests.size,
        episode_count: episodesSet.size,
      };
    });

    let insertedConcepts: Array<{ id: string; title: string; slug: string }> = [];
    if (conceptRows.length) {
      const conceptInsert = await supabase.from("concepts").insert(conceptRows).select("id,title,slug");
      if (conceptInsert.error) return json(500, { error: `Concept insert failed: ${conceptInsert.error.message}` });
      insertedConcepts = (conceptInsert.data ?? []) as Array<{ id: string; title: string; slug: string }>;
    }
    const conceptIdBySlug = new Map(insertedConcepts.map((c) => [c.slug, c.id]));
    const conceptRefRows: Array<Record<string, unknown>> = [];
    const conceptChunkRows: Array<Record<string, unknown>> = [];

    for (const concept of concepts) {
      const conceptSlug = slugify(concept.slug?.trim() || concept.title);
      const conceptId = conceptIdBySlug.get(conceptSlug);
      if (!conceptId) continue;

      concept.references.forEach((ref, idx) => {
        const ev = evidence[ref.evidence_index];
        if (!ev) return;
        conceptRefRows.push({
          concept_id: conceptId,
          guest_id: ev.guest_id,
          episode_id: ev.episode_id,
          quote: ref.quote?.trim() || null,
          timestamp: ev.timestamp,
          time_seconds: ev.time_seconds,
          episode_url: addTimeParam(ev.episode_url, ev.time_seconds),
          display_order: idx,
        });
        conceptChunkRows.push({
          concept_id: conceptId,
          chunk_id: ev.chunk_id,
          relevance_score: null,
        });
      });
    }

    if (conceptRefRows.length) {
      const conceptRefInsert = await supabase.from("concept_references").insert(conceptRefRows);
      if (conceptRefInsert.error) return json(500, { error: `Concept references insert failed: ${conceptRefInsert.error.message}` });
    }
    if (conceptChunkRows.length) {
      const uniqueRows = new Map<string, Record<string, unknown>>();
      for (const row of conceptChunkRows) {
        uniqueRows.set(`${row.concept_id}:${row.chunk_id}`, row);
      }
      const conceptChunkInsert = await supabase
        .from("concept_chunks")
        .upsert(Array.from(uniqueRows.values()), { onConflict: "concept_id,chunk_id" });
      if (conceptChunkInsert.error) return json(500, { error: `Concept chunks upsert failed: ${conceptChunkInsert.error.message}` });
    }

    const insightRows = insights.map((insight) => {
      const refs = insight.evidence
        .map((r) => evidence[r.evidence_index])
        .filter(Boolean);
      const guests = new Set(refs.map((r) => r.guest_id).filter(Boolean));
      const episodesSet = new Set(refs.map((r) => r.episode_id).filter(Boolean));
      return {
        podcast_id: podcast.id,
        title: insight.title.trim(),
        slug: slugify(insight.slug?.trim() || insight.title),
        takeaway: insight.takeaway.trim(),
        signal: insight.signal,
        guest_count: guests.size,
        episode_count: episodesSet.size,
        explanation: insight.explanation.slice(0, 5),
        trend: insight.trend ?? null,
        category:
          insight.category?.trim() ||
          inferCategoryFromTheme(
            insight.theme_label?.trim() || topKeywordFromEvidenceIndexes(insight.evidence.map((r) => r.evidence_index), evidence)
          ) ||
          null,
        theme_label:
          insight.theme_label?.trim() ||
          topKeywordFromEvidenceIndexes(insight.evidence.map((r) => r.evidence_index), evidence) ||
          null,
      };
    });

    let insertedInsights: Array<{ id: string; title: string; slug: string }> = [];
    if (insightRows.length) {
      const insightInsert = await supabase.from("insights").insert(insightRows).select("id,title,slug");
      if (insightInsert.error) return json(500, { error: `Insights insert failed: ${insightInsert.error.message}` });
      insertedInsights = (insightInsert.data ?? []) as Array<{ id: string; title: string; slug: string }>;
    }
    const insightIdBySlug = new Map(insertedInsights.map((i) => [i.slug, i.id]));
    const insightEvidenceRows: Array<Record<string, unknown>> = [];
    for (const insight of insights) {
      const insightSlug = slugify(insight.slug?.trim() || insight.title);
      const insightId = insightIdBySlug.get(insightSlug);
      if (!insightId) continue;

      insight.evidence.forEach((ref, idx) => {
        const ev = evidence[ref.evidence_index];
        if (!ev) return;
        insightEvidenceRows.push({
          insight_id: insightId,
          guest_id: ev.guest_id,
          episode_id: ev.episode_id,
          quote: ref.quote?.trim() || null,
          timestamp: ev.timestamp,
          time_seconds: ev.time_seconds,
          episode_url: addTimeParam(ev.episode_url, ev.time_seconds),
          display_order: idx,
        });
      });
    }
    if (insightEvidenceRows.length) {
      const evidenceInsert = await supabase.from("insight_evidence").insert(insightEvidenceRows);
      if (evidenceInsert.error) return json(500, { error: `Insight evidence insert failed: ${evidenceInsert.error.message}` });
    }

    return json(200, {
      ok: true,
      modelUsed,
      geminiFailureReason,
      mode,
      podcastSlug,
      conceptsInserted: insertedConcepts.length,
      conceptReferencesInserted: conceptRefRows.length,
      conceptChunksLinked: conceptChunkRows.length,
      insightsInserted: insertedInsights.length,
      insightEvidenceInserted: insightEvidenceRows.length,
      signalBreakdown,
      conceptDiagnostics,
    });
  } catch (error) {
    return json(500, {
      error: "Unhandled extraction error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

