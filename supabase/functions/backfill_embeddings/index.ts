import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_SEGMENT_TYPES = ["interview", "lightning_round"] as const;
const OPENAI_MODEL = "text-embedding-3-small";
const GEMINI_MODEL = "models/text-embedding-004";

type SegmentRow = {
  id: string;
  episode_id: string;
  segment_type: "interview" | "lightning_round";
  content: string;
  start_time: string | null;
};

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunkText(text: string, maxChars = 1800, overlapSentences = 1): string[] {
  const sentences = splitIntoSentences(text);
  if (!sentences.length) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const sentence of sentences) {
    const nextLen = sentence.length + 1;
    if (current.length > 0 && currentLen + nextLen > maxChars) {
      chunks.push(current.join(" ").trim());
      const overlap = current.slice(Math.max(0, current.length - overlapSentences));
      current = [...overlap, sentence];
      currentLen = current.join(" ").length;
    } else {
      current.push(sentence);
      currentLen += nextLen;
    }
  }
  if (current.length) chunks.push(current.join(" ").trim());
  return chunks.filter(Boolean);
}

function getFirstEnv(names: string[]): string | null {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return null;
}

async function embedBatchOpenAi(openAiKey: string, texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: texts,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding call failed: ${res.status} ${err}`);
  }
  const json = await res.json();
  return (json.data ?? []).map((d: { embedding: number[] }) => d.embedding);
}

async function embedOneGemini(geminiKey: string, text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${GEMINI_MODEL}:embedContent?key=${encodeURIComponent(geminiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: 1536,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embedding call failed: ${res.status} ${err}`);
  }
  const json = await res.json();
  const values = json?.embedding?.values as number[] | undefined;
  if (!values?.length) throw new Error("Gemini embedding response missing values");
  return values;
}

async function embedBatchGemini(geminiKey: string, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const text of texts) {
    out.push(await embedOneGemini(geminiKey, text));
  }
  return out;
}

Deno.serve(async (req: Request) => {
  try {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const openAiKey = getFirstEnv(["OPENAI_API_KEY", "OpenAI_API_KEY"]);
  const geminiKey = getFirstEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);
  if (!supabaseUrl || !serviceRoleKey || (!geminiKey && !openAiKey)) {
    return new Response(
      JSON.stringify({
        error: "Missing required secrets",
        missing: {
          SUPABASE_URL: !supabaseUrl,
          SUPABASE_SERVICE_ROLE_OR_ANON_KEY: !serviceRoleKey,
          GEMINI_OR_OPENAI_KEY: !geminiKey && !openAiKey,
        },
      }),
      { status: 500 }
    );
  }

  const { offset = 0, limit = 100, maxChars = 1800, dryRun = false } = await req.json().catch(() => ({}));
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.min(500, Math.max(1, Number(limit))) : 100;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const segmentsRes = await supabase
    .from("segments")
    .select("id, episode_id, segment_type, content, start_time")
    .in("segment_type", [...ALLOWED_SEGMENT_TYPES])
    .order("id", { ascending: true })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (segmentsRes.error) {
    return new Response(JSON.stringify({ error: `Failed loading segments: ${segmentsRes.error.message}` }), { status: 500 });
  }

  const segments = (segmentsRes.data ?? []) as SegmentRow[];
  if (!segments.length) {
    return new Response(JSON.stringify({ done: true, offset: safeOffset, limit: safeLimit, segmentsProcessed: 0, chunksUpserted: 0 }), { status: 200 });
  }

  const episodeIds = [...new Set(segments.map((s) => s.episode_id))];
  const episodesRes = await supabase.from("episodes").select("id, guest_id").in("id", episodeIds);
  if (episodesRes.error) {
    return new Response(JSON.stringify({ error: `Failed loading episodes: ${episodesRes.error.message}` }), { status: 500 });
  }
  const guestByEpisode = new Map<string, string>(
    (episodesRes.data ?? [])
      .filter((e: { id: string; guest_id: string | null }) => !!e.guest_id)
      .map((e: { id: string; guest_id: string }) => [e.id, e.guest_id])
  );

  const rows: Array<Record<string, unknown>> = [];
  for (const seg of segments) {
    const guestId = guestByEpisode.get(seg.episode_id);
    if (!guestId || !seg.content?.trim()) continue;

    const textChunks = chunkText(seg.content, maxChars, 1);
    for (let i = 0; i < textChunks.length; i++) {
      const text = textChunks[i];
      const tokenCount = Math.max(1, Math.round(text.split(/\s+/).length * 1.3));
      rows.push({
        chunk_id: `${seg.episode_id}:${seg.id}:${i}`,
        text,
        guest_id: guestId,
        episode_id: seg.episode_id,
        theme_id: null,
        speaker: null,
        timestamp: seg.start_time,
        token_count: tokenCount,
        segment_type: seg.segment_type,
      });
    }
  }

  if (dryRun) {
    return new Response(
      JSON.stringify({
        done: false,
        offset: safeOffset,
        nextOffset: safeOffset + segments.length,
        segmentsProcessed: segments.length,
        chunksGenerated: rows.length,
        chunksUpserted: 0,
      }),
      { status: 200 }
    );
  }

  // Embed + upsert in batches
  const EMBED_BATCH = 64;
  const UPSERT_BATCH = 100;
  const withEmbeddings: Array<Record<string, unknown>> = [];
  const embeddingProvider = geminiKey ? "gemini" : "openai";

  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const batch = rows.slice(i, i + EMBED_BATCH);
    const texts = batch.map((r) => String(r.text));
    let vectors: number[][] = [];
    if (geminiKey) {
      try {
        vectors = await embedBatchGemini(geminiKey, texts);
      } catch {
        if (!openAiKey) throw new Error("Gemini embedding failed and OpenAI fallback key missing");
        vectors = await embedBatchOpenAi(openAiKey, texts);
      }
    } else {
      vectors = await embedBatchOpenAi(openAiKey!, texts);
    }
    for (let j = 0; j < batch.length; j++) {
      withEmbeddings.push({
        ...batch[j],
        embedding: vectors[j],
      });
    }
  }

  for (let i = 0; i < withEmbeddings.length; i += UPSERT_BATCH) {
    const batch = withEmbeddings.slice(i, i + UPSERT_BATCH);
      const upsertRes = await supabase.from("chunk_embeddings").upsert(batch, { onConflict: "chunk_id" });
    if (upsertRes.error) {
      return new Response(JSON.stringify({ error: `Upsert failed: ${upsertRes.error.message}` }), { status: 500 });
    }
  }

  return new Response(
    JSON.stringify({
      done: false,
      offset: safeOffset,
      nextOffset: safeOffset + segments.length,
      segmentsProcessed: segments.length,
      embeddingProvider,
      chunksGenerated: rows.length,
      chunksUpserted: withEmbeddings.length,
    }),
    { status: 200 }
  );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Unhandled backfill error",
        detail: error instanceof Error ? error.message : String(error),
      }),
      { status: 500 }
    );
  }
});


