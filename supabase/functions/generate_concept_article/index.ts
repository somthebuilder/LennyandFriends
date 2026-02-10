import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/* ------------------------------------------------------------------ */
/*  CORS                                                               */
/* ------------------------------------------------------------------ */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */
const GEMINI_CHAT_MODEL = "gemini-2.0-flash";
const GEMINI_EMBED_MODEL = "models/text-embedding-004";
const OPENAI_CHAT_MODEL =
  Deno.env.get("OPENAI_CHAT_MODEL") ?? "gpt-4.1-mini";
const OPENAI_EMBED_MODEL = "text-embedding-3-small";

/**
 * 9-section structure split into 3 batches.
 * Each batch is a small, reliable LLM call (~250-400 words output).
 * Total assembled target: ~800-1200 words.
 */
const SECTION_BATCHES = [
  {
    id: "A",
    sections: [
      "1. Concept Overview",
      "2. Why This Concept Matters",
      "3. How the Concept Works in Practice",
    ],
    wordTarget: 400,
    guidance: `Section 1 (Concept Overview, ~120 words): 2-3 paragraphs explaining the concept clearly. Set context: where it is used, why it exists, and why it matters today. Weave in at least one speaker quote with attribution and timestamp link.
Section 2 (Why This Concept Matters, ~120 words): The real problems it solves, business/product/career impact, and what goes wrong when teams ignore it. Reinforce with inline speaker quotes.
Section 3 (How the Concept Works in Practice, ~160 words): Break down key components, step-by-step flow, metrics or signals, and decision logic. Anchor explanations with inline source callouts.`,
  },
  {
    id: "B",
    sections: [
      "4. Real-World Applications",
      "5. Common Mistakes & Anti-Patterns",
      "6. Advanced Insights & Nuances",
    ],
    wordTarget: 350,
    guidance: `Section 4 (Real-World Applications, ~130 words): Concrete examples across product teams, growth, leadership, career, team building. Each major example gets a reference link.
Section 5 (Common Mistakes & Anti-Patterns, ~110 words): Misinterpretations, shallow implementations, what experts warn against. Include at least one direct quote.
Section 6 (Advanced Insights & Nuances, ~110 words): Tradeoffs, when NOT to use it, scaling complexity, long-term impact. Premium content.`,
  },
  {
    id: "C",
    sections: [
      "7. How This Connects to Other Concepts",
      "8. Key Takeaways (Actionable)",
      "9. Source References",
    ],
    wordTarget: 250,
    guidance: `Section 7 (How This Connects, ~80 words): Narrative form - what this concept builds on, enables, or is often confused with.
Section 8 (Key Takeaways, ~80 words): Bulleted practical summary - when to use, how to start, what to measure. Use checkmark bullets.
Section 9 (Source References, ~90 words): Clean numbered list of ALL cited speakers/episodes with timestamps and URLs. Format: [N] Speaker - Episode - Timestamp - URL.`,
  },
] as const;

const ALL_SECTION_HEADINGS = SECTION_BATCHES.flatMap((b) => b.sections);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type ReferenceRow = {
  quote: string | null;
  timestamp: string | null;
  time_seconds: number | null;
  episode_url: string | null;
  display_order: number;
  guests: { full_name: string } | null;
  episodes: { title: string | null } | null;
};

type EnrichedRef = {
  guest: string;
  episode: string;
  timestamp: string;
  url: string;
  quote: string;
  source: "stored" | "knn";
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getFirstEnv(names: string[]): string | null {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeDashes(text: string): string {
  return text.replace(/[\u2013\u2014]/g, "-");
}

function repairJsonString(raw: string): string {
  let text = raw
    .replace(/^```(?:json)?\s*/gm, "")
    .replace(/```\s*$/gm, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return raw;
  text = text.slice(start, end + 1);
  try {
    JSON.parse(text);
    return text;
  } catch {
    /* needs repair */
  }
  const out: string[] = [];
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      if ('"\\\/bfnrtu'.includes(c)) out.push(c);
      else out.push("\\", c);
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
      if (c === "\n") {
        out.push("\\n");
        continue;
      }
      if (c === "\r") {
        out.push("\\r");
        continue;
      }
      if (c === "\t") {
        out.push("\\t");
        continue;
      }
      if (c.charCodeAt(0) < 0x20) continue;
    }
    out.push(c);
  }
  const repaired = out.join("");
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    /* give up */
  }
  return raw;
}

function extractField(raw: string, key: string): string {
  const repaired = repairJsonString(raw);
  try {
    const parsed = JSON.parse(repaired);
    return String(parsed[key] ?? "").trim();
  } catch {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
    const match = repaired.match(re);
    return match
      ? match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"')
      : "";
  }
}

/* ------------------------------------------------------------------ */
/*  Embedding generation (for KNN query)                               */
/* ------------------------------------------------------------------ */
async function embedTextGemini(
  geminiKey: string,
  text: string
): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBED_MODEL}:embedContent?key=${encodeURIComponent(
      geminiKey
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_EMBED_MODEL,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: 1536,
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini embed ${res.status}`);
  const data = await res.json();
  const values = data?.embedding?.values as number[] | undefined;
  if (!values?.length) throw new Error("Gemini embedding empty");
  return values;
}

async function embedTextOpenAi(
  openAiKey: string,
  text: string
): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: [text] }),
  });
  if (!res.ok) throw new Error(`OpenAI embed ${res.status}`);
  const data = await res.json();
  return data?.data?.[0]?.embedding as number[];
}

async function embedText(
  geminiKey: string | null,
  openAiKey: string | null,
  text: string
): Promise<number[]> {
  if (geminiKey) {
    try {
      return await embedTextGemini(geminiKey, text);
    } catch {
      if (openAiKey) return await embedTextOpenAi(openAiKey, text);
      throw new Error("Embedding failed - no fallback available");
    }
  }
  if (openAiKey) return await embedTextOpenAi(openAiKey, text);
  throw new Error("No embedding key available");
}

/* ------------------------------------------------------------------ */
/*  Chat generation                                                    */
/* ------------------------------------------------------------------ */
async function geminiGenerate(
  geminiKey: string,
  prompt: string
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CHAT_MODEL}:generateContent?key=${encodeURIComponent(
      geminiKey
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          responseMimeType: "application/json",
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const payload = await res.json();
  const text =
    (payload?.candidates?.[0]?.content?.parts?.[0]?.text as
      | string
      | undefined) ?? "";
  if (!text) throw new Error("Gemini returned empty text");
  return text;
}

async function openAiGenerate(
  openAiKey: string,
  prompt: string
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_CHAT_MODEL,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return valid JSON. Ground every claim in provided references.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content as string | undefined) ?? "";
}

/* ------------------------------------------------------------------ */
/*  Generate one section batch                                         */
/* ------------------------------------------------------------------ */
async function generateBatch(
  batchDef: (typeof SECTION_BATCHES)[number],
  conceptTitle: string,
  category: string,
  referenceBlock: string,
  themeHints: string,
  geminiKey: string | null,
  openAiKey: string | null,
  geminiOnly: boolean
): Promise<{ content: string; model: string; geminiError: string | null }> {
  const prompt = [
    `You are writing sections of a concept article titled "${conceptTitle}".`,
    `Category: ${category}`,
    `Adjacent themes: ${themeHints || "n/a"}`,
    "",
    `Write ONLY these sections (~${batchDef.wordTarget} words total):`,
    ...batchDef.sections.map((s) => `  - ${s}`),
    "",
    "Section guidance:",
    batchDef.guidance,
    "",
    "CRITICAL RULES:",
    "- Use the EXACT section headings (e.g. '## 1. Concept Overview').",
    "- Weave interview quotes INLINE between paragraphs, like:",
    '  As [Speaker] explains at [timestamp]: "quote excerpt..." - [url]',
    "- Ground all claims in the provided references ONLY. Do not invent.",
    "- Do NOT use em dashes or en dashes. Use hyphen '-' only.",
    "- Lens: product, growth, career, team building, leadership, operations.",
    "- Include tactics (what works/doesn't), mindsets, attitudes when evidence supports it.",
    "",
    'Return JSON: { "content": "your markdown text" }',
    "Escape newlines as \\n. No code fences.",
    "",
    "Available references:",
    referenceBlock,
  ].join("\n");

  let geminiError: string | null = null;

  // Try Gemini (up to 2 attempts)
  if (geminiKey) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await geminiGenerate(geminiKey, prompt);
        const content = extractField(raw, "content");
        if (content && wordCount(content) >= 30) {
          return {
            content: normalizeDashes(content),
            model: `gemini:${GEMINI_CHAT_MODEL}`,
            geminiError: null,
          };
        }
        geminiError = `Attempt ${attempt + 1}: too short (${wordCount(content)}w)`;
      } catch (err) {
        geminiError = `Attempt ${attempt + 1}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  // Fallback to OpenAI
  if (!geminiOnly && openAiKey) {
    const raw = await openAiGenerate(openAiKey, prompt);
    const content = extractField(raw, "content");
    if (content && wordCount(content) >= 20) {
      return {
        content: normalizeDashes(content),
        model: `openai:${OPENAI_CHAT_MODEL}`,
        geminiError,
      };
    }
    throw new Error(`OpenAI fallback also failed for batch ${batchDef.id}`);
  }

  throw new Error(`Batch ${batchDef.id} failed. geminiError=${geminiError}`);
}

/* ------------------------------------------------------------------ */
/*  MAIN HANDLER                                                       */
/* ------------------------------------------------------------------ */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiKey = getFirstEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);
    const openAiKey = getFirstEnv(["OPENAI_API_KEY", "OpenAI_API_KEY"]);
    if (!supabaseUrl || !serviceRole || (!geminiKey && !openAiKey)) {
      return json(500, {
        error: "Missing required secrets",
        missing: {
          SUPABASE_URL: !supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: !serviceRole,
          GEMINI_OR_OPENAI_KEY: !geminiKey && !openAiKey,
        },
      });
    }

    const body = await req.json().catch(() => ({}));
    const conceptId = body.conceptId ? String(body.conceptId).trim() : "";
    const conceptSlug = body.conceptSlug
      ? String(body.conceptSlug).trim()
      : "";
    const podcastSlug = String(body.podcastSlug ?? "lennys-podcast").trim();
    const dryRun = Boolean(body.dryRun ?? false);
    const force = Boolean(body.force ?? false);
    const geminiOnly = Boolean(body.geminiOnly ?? false);
    const minWords = Math.max(
      500,
      Math.min(1200, Number(body.minWords ?? 800))
    );
    // KNN enrichment config
    const knnChunks = Math.max(0, Math.min(20, Number(body.knnChunks ?? 12)));

    if (!conceptId && !conceptSlug) {
      return json(400, { error: "Provide conceptId or conceptSlug" });
    }

    const supabase = createClient(supabaseUrl, serviceRole);

    // Fetch podcast
    const { data: podcast, error: podcastError } = await supabase
      .from("podcasts")
      .select("id,name,slug")
      .eq("slug", podcastSlug)
      .maybeSingle();
    if (podcastError || !podcast)
      return json(404, { error: "Podcast not found", podcastSlug });

    // Fetch concept
    let conceptQuery = supabase
      .from("concepts")
      .select("id,title,summary,body,category,theme_label,podcast_id")
      .eq("podcast_id", podcast.id)
      .limit(1);
    conceptQuery = conceptId
      ? conceptQuery.eq("id", conceptId)
      : conceptQuery.eq("slug", conceptSlug);
    const { data: concept, error: conceptError } =
      await conceptQuery.maybeSingle();
    if (conceptError || !concept)
      return json(404, { error: "Concept not found", conceptId, conceptSlug });

    // Skip if already long enough and not forced
    if (!force && wordCount(concept.body) >= minWords) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "Body already meets minimum length",
        conceptId: concept.id,
        currentWords: wordCount(concept.body),
      });
    }

    // ========== GATHER REFERENCES ==========

    // 1. Stored concept_references
    const { data: refs } = await supabase
      .from("concept_references")
      .select(
        "quote,timestamp,time_seconds,episode_url,display_order,guests(full_name),episodes(title)"
      )
      .eq("concept_id", concept.id)
      .order("display_order", { ascending: true })
      .limit(20);
    const storedRefs: EnrichedRef[] = ((refs ?? []) as ReferenceRow[]).map(
      (r) => ({
        guest: r.guests?.full_name ?? "Unknown guest",
        episode: r.episodes?.title ?? "Unknown episode",
        timestamp: r.timestamp ?? "n/a",
        url: r.episode_url ?? "n/a",
        quote: String(r.quote ?? "n/a")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300),
        source: "stored" as const,
      })
    );

    // 2. KNN-enriched chunks via vector similarity search
    let knnRefs: EnrichedRef[] = [];
    let knnError: string | null = null;

    if (knnChunks > 0) {
      try {
        const queryEmbedding = await embedText(
          geminiKey,
          openAiKey,
          concept.title
        );

        const { data: knnData, error: matchError } = await supabase.rpc(
          "match_chunks",
          {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: knnChunks,
            filter_segment_types: ["interview", "lightning_round"],
          }
        );

        if (matchError) {
          knnError = matchError.message;
        } else if (knnData?.length) {
          // Resolve guest & episode names
          const guestIds = [
            ...new Set(
              knnData
                .map((c: { guest_id: string }) => c.guest_id)
                .filter(Boolean)
            ),
          ];
          const episodeIds = [
            ...new Set(
              knnData
                .map((c: { episode_id: string }) => c.episode_id)
                .filter(Boolean)
            ),
          ];

          const [guestRes, episodeRes] = await Promise.all([
            guestIds.length
              ? supabase
                  .from("guests")
                  .select("id,full_name")
                  .in("id", guestIds)
              : { data: [] },
            episodeIds.length
              ? supabase
                  .from("episodes")
                  .select("id,title,youtube_url")
                  .in("id", episodeIds)
              : { data: [] },
          ]);

          const guestMap = new Map(
            ((guestRes.data ?? []) as { id: string; full_name: string }[]).map(
              (g) => [g.id, g.full_name]
            )
          );
          const episodeMap = new Map(
            (
              (episodeRes.data ?? []) as {
                id: string;
                title: string;
                youtube_url: string | null;
              }[]
            ).map((e) => [e.id, { title: e.title, url: e.youtube_url }])
          );

          // Deduplicate: skip chunks from same episode+timestamp as stored refs
          const storedKeys = new Set(
            storedRefs.map((r) => `${r.episode}|${r.timestamp}`)
          );

          for (const chunk of knnData) {
            const guest = guestMap.get(chunk.guest_id) ?? chunk.speaker ?? "Guest";
            const ep = episodeMap.get(chunk.episode_id);
            const episode = ep?.title ?? "Episode";
            const ts = chunk.time_stamp ?? "n/a";
            const key = `${episode}|${ts}`;
            if (storedKeys.has(key)) continue;
            storedKeys.add(key);

            // Build YouTube URL with timestamp
            let url = ep?.url ?? "n/a";
            if (
              url !== "n/a" &&
              chunk.time_stamp &&
              !url.includes("&t=")
            ) {
              // Parse timestamp to seconds
              const parts = String(chunk.time_stamp).split(":").map(Number);
              let secs = 0;
              if (parts.length === 3)
                secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
              else if (parts.length === 2)
                secs = parts[0] * 60 + parts[1];
              if (secs > 0) url += `&t=${secs}`;
            }

            knnRefs.push({
              guest,
              episode,
              timestamp: ts,
              url,
              quote: String(chunk.text ?? "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 300),
              source: "knn",
            });
          }
        }
      } catch (err) {
        knnError = err instanceof Error ? err.message : String(err);
      }
    }

    // Merge: stored refs first, then KNN-enriched
    const allRefs = [...storedRefs, ...knnRefs];
    if (!allRefs.length) {
      return json(400, {
        error: "No references available (stored or KNN). Cannot generate.",
        conceptId: concept.id,
      });
    }

    // Build reference block
    const referenceBlock = allRefs
      .map(
        (ref, idx) =>
          `[${idx + 1}] ${ref.guest} | ${ref.episode} | timestamp=${ref.timestamp} | url=${ref.url} | quote="${ref.quote}"`
      )
      .join("\n");

    // Fetch theme hints
    const { data: themeRows } = await supabase
      .from("themes")
      .select("label")
      .not("label", "is", null)
      .order("updated_at", { ascending: false })
      .limit(12);
    const themeHints = (themeRows ?? [])
      .map((row) => String((row as { label?: string }).label ?? "").trim())
      .filter(Boolean)
      .join(", ");

    const category = `${concept.category ?? "general"} / ${concept.theme_label ?? "general"}`;

    // ========== SECTIONED ASSEMBLY (3 batches) ==========
    const batchResults: {
      batchId: string;
      content: string;
      model: string;
      geminiError: string | null;
      words: number;
    }[] = [];

    for (const batch of SECTION_BATCHES) {
      const result = await generateBatch(
        batch,
        concept.title,
        category,
        referenceBlock,
        themeHints,
        geminiKey,
        openAiKey,
        geminiOnly
      );
      batchResults.push({
        batchId: batch.id,
        content: result.content,
        model: result.model,
        geminiError: result.geminiError,
        words: wordCount(result.content),
      });
    }

    // Assemble
    const assembledBody = batchResults.map((b) => b.content).join("\n\n");
    const totalWords = wordCount(assembledBody);
    const primaryModel =
      batchResults.find((b) => b.model.startsWith("gemini"))?.model ??
      batchResults[0].model;

    // Quick summary generation
    let summary = concept.summary;
    try {
      if (geminiKey) {
        const summaryPrompt = [
          `Write a 2-3 sentence summary of this concept: "${concept.title}".`,
          'Return JSON: { "summary": "text" }',
          "",
          batchResults[0].content.slice(0, 1200),
        ].join("\n");
        const raw = await geminiGenerate(geminiKey, summaryPrompt);
        const s = extractField(raw, "summary");
        if (s) summary = normalizeDashes(s);
      }
    } catch {
      /* keep existing */
    }

    // Validate
    const missingHeadings = ALL_SECTION_HEADINGS.filter(
      (h) => !assembledBody.toLowerCase().includes(h.toLowerCase())
    );

    // Persist
    if (!dryRun) {
      const { error: updateError } = await supabase
        .from("concepts")
        .update({
          body: assembledBody,
          summary: summary ?? concept.summary,
        })
        .eq("id", concept.id);
      if (updateError)
        return json(500, {
          error: `Update failed: ${updateError.message}`,
        });
    }

    return json(200, {
      ok: true,
      dryRun,
      conceptId: concept.id,
      conceptTitle: concept.title,
      totalWords,
      primaryModel,
      storedRefs: storedRefs.length,
      knnRefs: knnRefs.length,
      knnError,
      batchDetails: batchResults.map((b) => ({
        batch: b.batchId,
        words: b.words,
        model: b.model,
        geminiError: b.geminiError,
      })),
      missingHeadings:
        missingHeadings.length > 0 ? missingHeadings : undefined,
      preview: assembledBody.slice(0, 500),
    });
  } catch (error) {
    return json(500, {
      error: "Unhandled article generation error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});
