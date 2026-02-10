import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_INPUT_LENGTH = 500;
const MAX_CONTEXT_CHUNKS = 6;
const MIN_SIMILARITY = 0.35;
const REPEATED_INPUT_WINDOW_MS = 120_000;

const RATE_LIMITS = {
  perMinute: 10,
  perDay: 50,
  dailyTokenCap: 10_000,
};

const BLOCKED_PHRASES = [
  "ignore previous instructions",
  "ignore all previous instructions",
  "system prompt",
  "developer instructions",
  "bypass guardrails",
];
const GEMINI_EMBED_MODEL = "models/text-embedding-004";

type ChunkRow = {
  chunk_id: string;
  text: string;
  similarity: number;
  guest_id: string | null;
  episode_id: string | null;
  theme_id: string | null;
  speaker: string | null;
  time_stamp: string | null;
  token_count: number | null;
  segment_type: "intro" | "sponsor" | "interview" | "lightning_round" | "outro" | null;
};

type ParsedAnswer = {
  direct_answer: string;
  consensus: string[];
  disagreement: string[];
  minority_views: string[];
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

function normalizeInput(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function hasBlockedPhrase(input: string): boolean {
  const lowered = input.toLowerCase();
  return BLOCKED_PHRASES.some((phrase) => lowered.includes(phrase));
}

function formatAnswer(answer: ParsedAnswer): string {
  const consensus = answer.consensus.length
    ? answer.consensus.map((item) => `- ${item}`).join("\n")
    : "- Evidence is limited for a clear consensus.";

  const disagreement = answer.disagreement.length
    ? answer.disagreement.map((item) => `- ${item}`).join("\n")
    : "- No major disagreement surfaced in retrieved evidence.";

  const minority = answer.minority_views.length
    ? answer.minority_views.map((item) => `- ${item}`).join("\n")
    : "- No clear minority view surfaced in retrieved evidence.";

  return [
    `Direct answer: ${answer.direct_answer}`,
    "",
    "Consensus:",
    consensus,
    "",
    "Disagreement:",
    disagreement,
    "",
    "Minority views:",
    minority,
  ].join("\n");
}

function parseJsonAnswer(content: string): ParsedAnswer | null {
  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const parsed = JSON.parse(content.slice(start, end + 1));
    if (
      typeof parsed.direct_answer !== "string" ||
      !Array.isArray(parsed.consensus) ||
      !Array.isArray(parsed.disagreement) ||
      !Array.isArray(parsed.minority_views)
    ) {
      return null;
    }
    return {
      direct_answer: parsed.direct_answer,
      consensus: parsed.consensus.filter((v: unknown) => typeof v === "string"),
      disagreement: parsed.disagreement.filter((v: unknown) => typeof v === "string"),
      minority_views: parsed.minority_views.filter((v: unknown) => typeof v === "string"),
    };
  } catch {
    return null;
  }
}

function fallbackAnswer(): ParsedAnswer {
  return {
    direct_answer: "I do not have enough grounded evidence to answer this confidently yet.",
    consensus: [],
    disagreement: [],
    minority_views: [],
  };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getFirstEnv(names: string[]): string | null {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return null;
}

async function embedWithGemini(apiKey: string, text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBED_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_EMBED_MODEL,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: 1536,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embedding failed: ${res.status} ${err}`);
  }
  const json = await res.json();
  const values = json?.embedding?.values as number[] | undefined;
  if (!values?.length) throw new Error("Gemini embedding response missing values");
  return values;
}

async function embedWithOpenAi(apiKey: string, text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding failed: ${res.status} ${err}`);
  }
  const json = await res.json();
  const embedding = json?.data?.[0]?.embedding as number[] | undefined;
  if (!embedding?.length) throw new Error("OpenAI embedding response missing vector");
  return embedding;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = getFirstEnv(["OPENAI_API_KEY", "OpenAI_API_KEY"]);
  const geminiKey = getFirstEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);
  const openAiChatModel = Deno.env.get("OPENAI_CHAT_MODEL") ?? "gpt-4.1-mini";

  if (!supabaseUrl || !supabaseServiceRoleKey || !openAiKey) {
    return json(500, { error: "Missing required server configuration" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const logUsage = async (params: {
    userKey: string;
    podcastSlug: string;
    model?: string;
    requestChars: number;
    contextChunks?: number;
    bestSimilarity?: number;
    tokensIn?: number;
    tokensOut?: number;
    status: "success" | "rejected" | "failed" | "fallback";
    errorCode?: string;
  }) => {
    await supabase.from("ai_usage_logs").insert({
      user_key: params.userKey,
      podcast_slug: params.podcastSlug,
      model: params.model ?? null,
      request_chars: params.requestChars,
      context_chunks: params.contextChunks ?? 0,
      best_similarity: params.bestSimilarity ?? null,
      tokens_in: params.tokensIn ?? 0,
      tokens_out: params.tokensOut ?? 0,
      status: params.status,
      error_code: params.errorCode ?? null,
    });
  };

  let body: { message?: string; podcastSlug?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const message = normalizeInput(body.message ?? "");
  const podcastSlug = normalizeInput(body.podcastSlug ?? "");
  if (!message) return json(400, { error: "Message is required" });
  if (!podcastSlug) return json(400, { error: "podcastSlug is required" });
  if (message.length > MAX_INPUT_LENGTH) return json(400, { error: "Message too long" });
  if (hasBlockedPhrase(message)) return json(400, { error: "Message rejected by safety rules" });

  const userKey = req.headers.get("x-user-key")?.trim() || "anon";
  const now = new Date();
  const inputHash = await sha256Hex(`${podcastSlug}:${message.toLowerCase()}`);

  // Rate limit load/create
  const { data: usageRow, error: usageFetchError } = await supabase
    .from("usage_limits")
    .select("*")
    .eq("user_key", userKey)
    .maybeSingle();
  if (usageFetchError) return json(500, { error: "Failed to validate usage limits" });

  const minuteWindowStart = usageRow ? new Date(usageRow.minute_window_start) : now;
  const dayWindowStart = usageRow ? new Date(usageRow.day_window_start) : now;
  const minuteDiffMs = now.getTime() - minuteWindowStart.getTime();
  const dayDiffMs = now.getTime() - dayWindowStart.getTime();

  const minuteRequestCount = usageRow
    ? minuteDiffMs < 60_000
      ? usageRow.minute_request_count
      : 0
    : 0;
  const dayRequestCount = usageRow
    ? dayDiffMs < 86_400_000
      ? usageRow.day_request_count
      : 0
    : 0;
  const dayTokenCount = usageRow
    ? dayDiffMs < 86_400_000
      ? usageRow.day_token_count
      : 0
    : 0;

  const lastInputAt = usageRow?.last_input_at ? new Date(usageRow.last_input_at) : null;
  const isRepeatedInput =
    usageRow?.last_input_hash &&
    usageRow.last_input_hash === inputHash &&
    lastInputAt &&
    now.getTime() - lastInputAt.getTime() < REPEATED_INPUT_WINDOW_MS;
  if (isRepeatedInput) {
    await logUsage({
      userKey,
      podcastSlug,
      model: openAiChatModel,
      requestChars: message.length,
      status: "rejected",
      errorCode: "repeated_input",
    });
    return json(400, { error: "Repeated identical input. Please rephrase your question." });
  }

  if (minuteRequestCount >= RATE_LIMITS.perMinute || dayRequestCount >= RATE_LIMITS.perDay || dayTokenCount >= RATE_LIMITS.dailyTokenCap) {
    await logUsage({
      userKey,
      podcastSlug,
      model: openAiChatModel,
      requestChars: message.length,
      status: "rejected",
      errorCode: "rate_limited",
    });
    return json(429, { error: "Rate limit exceeded. Please try again later." });
  }

  // Increment BEFORE OpenAI call
  const usageUpdate = {
    user_key: userKey,
    minute_window_start: minuteDiffMs < 60_000 ? minuteWindowStart.toISOString() : now.toISOString(),
    minute_request_count: minuteDiffMs < 60_000 ? minuteRequestCount + 1 : 1,
    day_window_start: dayDiffMs < 86_400_000 ? dayWindowStart.toISOString() : now.toISOString(),
    day_request_count: dayDiffMs < 86_400_000 ? dayRequestCount + 1 : 1,
    day_token_count: dayTokenCount,
    last_input_hash: inputHash,
    last_input_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  const { error: usageUpsertError } = await supabase.from("usage_limits").upsert(usageUpdate);
  if (usageUpsertError) {
    await logUsage({
      userKey,
      podcastSlug,
      model: openAiChatModel,
      requestChars: message.length,
      status: "failed",
      errorCode: "usage_update_failed",
    });
    return json(500, { error: "Failed to update usage limits" });
  }

  // Podcast existence check
  const { data: podcastData, error: podcastError } = await supabase
    .from("podcasts")
    .select("id, slug")
    .eq("slug", podcastSlug)
    .maybeSingle();
  if (podcastError) {
    await logUsage({
      userKey,
      podcastSlug,
      model: openAiChatModel,
      requestChars: message.length,
      status: "failed",
      errorCode: "podcast_validation_failed",
    });
    return json(500, { error: "Failed to validate podcast scope" });
  }
  if (!podcastData) {
    await logUsage({
      userKey,
      podcastSlug,
      model: openAiChatModel,
      requestChars: message.length,
      status: "rejected",
      errorCode: "podcast_not_found",
    });
    return json(404, { error: "Podcast not found" });
  }

  // 1) Embed query (Gemini first, OpenAI fallback)
  let queryEmbedding: number[] | null = null;
  let embeddingModelUsed = "openai:text-embedding-3-small";
  try {
    if (geminiKey) {
      queryEmbedding = await embedWithGemini(geminiKey, message, "RETRIEVAL_QUERY");
      embeddingModelUsed = "gemini:text-embedding-004";
    } else {
      queryEmbedding = await embedWithOpenAi(openAiKey, message);
      embeddingModelUsed = "openai:text-embedding-3-small";
    }
  } catch {
    try {
      queryEmbedding = await embedWithOpenAi(openAiKey, message);
      embeddingModelUsed = "openai:text-embedding-3-small";
    } catch {
      await logUsage({
        userKey,
        podcastSlug,
        model: embeddingModelUsed,
        requestChars: message.length,
        status: "failed",
        errorCode: "embedding_failed",
      });
      return json(502, { error: "Embedding request failed" });
    }
  }

  // 2) Retrieve context (allowlisted segment types only)
  const { data: chunkData, error: chunkError } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: 0.0,
    match_count: MAX_CONTEXT_CHUNKS,
    filter_guest_id: null,
    filter_theme_id: null,
    filter_segment_types: ["interview", "lightning_round"],
  });
  if (chunkError) {
    await logUsage({
      userKey,
      podcastSlug,
      model: `${embeddingModelUsed}+${openAiChatModel}`,
      requestChars: message.length,
      status: "failed",
      errorCode: "retrieval_failed",
    });
    return json(500, { error: "Context retrieval failed" });
  }

  const chunks = (chunkData ?? []) as ChunkRow[];
  const bestSimilarity = chunks.length ? Math.max(...chunks.map((c) => c.similarity ?? 0)) : 0;
  if (!chunks.length || bestSimilarity < MIN_SIMILARITY) {
    await logUsage({
      userKey,
      podcastSlug,
      model: `${embeddingModelUsed}+${openAiChatModel}`,
      requestChars: message.length,
      contextChunks: chunks.length,
      bestSimilarity,
      status: "fallback",
      errorCode: "insufficient_context",
    });
    return json(200, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "I don't have enough data on this yet.",
      references: [],
    });
  }

  const guestIds = [...new Set(chunks.map((c) => c.guest_id).filter(Boolean))] as string[];
  const episodeIds = [...new Set(chunks.map((c) => c.episode_id).filter(Boolean))] as string[];

  const [{ data: guestRows }, { data: episodeRows }] = await Promise.all([
    guestIds.length
      ? supabase.from("guests").select("id, full_name").in("id", guestIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
    episodeIds.length
      ? supabase.from("episodes").select("id, title").in("id", episodeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
  ]);

  const guestMap = new Map((guestRows ?? []).map((g) => [g.id, g.full_name]));
  const episodeMap = new Map((episodeRows ?? []).map((e) => [e.id, e.title]));

  const context = chunks
    .map((chunk) => {
      const guestName = chunk.guest_id ? guestMap.get(chunk.guest_id) ?? chunk.guest_id : "Unknown guest";
      const episodeTitle = chunk.episode_id ? episodeMap.get(chunk.episode_id) ?? chunk.episode_id : "Unknown episode";
      return `[${chunk.chunk_id}] Guest: ${guestName} | Episode: ${episodeTitle}\n${chunk.text}`;
    })
    .join("\n\n");

  const systemPrompt = [
    "You are an assistant for Espresso.",
    "Answer only using the provided context.",
    "If the context does not contain enough evidence, explicitly say so.",
    "Return JSON with this exact shape:",
    "{",
    '  "direct_answer": "string",',
    '  "consensus": ["string"],',
    '  "disagreement": ["string"],',
    '  "minority_views": ["string"]',
    "}",
    "Keep output concise and evidence-grounded.",
  ].join("\n");

  // 3) Generate answer with OpenAI
  const completionRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: `${embeddingModelUsed}+${openAiChatModel}`,
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestion:\n${message}`,
        },
      ],
    }),
  });

  if (!completionRes.ok) {
    await logUsage({
      userKey,
      podcastSlug,
      model: `${embeddingModelUsed}+${openAiChatModel}`,
      requestChars: message.length,
      contextChunks: chunks.length,
      bestSimilarity,
      status: "failed",
      errorCode: "llm_failed",
    });
    return json(502, { error: "LLM request failed" });
  }

  const completionJson = await completionRes.json();
  const modelContent = completionJson?.choices?.[0]?.message?.content as string | undefined;
  let parsed = modelContent ? parseJsonAnswer(modelContent) : null;
  if (!parsed && modelContent) {
    const repairRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: openAiChatModel,
        temperature: 0,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Convert the input to valid JSON with keys: direct_answer (string), consensus (string[]), disagreement (string[]), minority_views (string[]).',
          },
          { role: "user", content: modelContent },
        ],
      }),
    });
    if (repairRes.ok) {
      const repairJson = await repairRes.json();
      const repaired = repairJson?.choices?.[0]?.message?.content as string | undefined;
      parsed = repaired ? parseJsonAnswer(repaired) : null;
    }
  }
  const status: "success" | "fallback" = parsed ? "success" : "fallback";
  if (!parsed) parsed = fallbackAnswer();

  const totalTokens = Number(completionJson?.usage?.total_tokens ?? 0);
  const promptTokens = Number(completionJson?.usage?.prompt_tokens ?? 0);
  const completionTokens = Number(completionJson?.usage?.completion_tokens ?? 0);
  const nextDayTokenCount = dayTokenCount + totalTokens;
  await supabase
    .from("usage_limits")
    .update({
      day_token_count: nextDayTokenCount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_key", userKey);

  await logUsage({
    userKey,
    podcastSlug,
    model: `${embeddingModelUsed}+${openAiChatModel}`,
    requestChars: message.length,
    contextChunks: chunks.length,
    bestSimilarity,
    tokensIn: promptTokens,
    tokensOut: completionTokens,
    status,
    errorCode: status === "fallback" ? "json_parse_fallback" : undefined,
  });

  const references = chunks.slice(0, MAX_CONTEXT_CHUNKS).map((chunk) => ({
    guest_name: chunk.guest_id ? guestMap.get(chunk.guest_id) ?? "Unknown guest" : "Unknown guest",
    episode_title: chunk.episode_id ? episodeMap.get(chunk.episode_id) ?? "Unknown episode" : "Unknown episode",
    timestamp: chunk.time_stamp ?? undefined,
  }));

  return json(200, {
    id: crypto.randomUUID(),
    role: "assistant",
    content: formatAnswer(parsed),
    references,
  });
});


