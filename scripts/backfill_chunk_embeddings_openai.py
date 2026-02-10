#!/usr/bin/env python3
"""
Backfill chunk_embeddings using OpenAI text-embedding-3-small.

Hard rules:
- Only uses segments of type: interview, lightning_round
- Writes segment_type explicitly for retrieval allowlist
"""

import argparse
import os
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import tiktoken
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client
from tqdm import tqdm


ALLOWED_SEGMENT_TYPES = ("interview", "lightning_round")
EMBEDDING_MODEL = "text-embedding-3-small"


@dataclass
class Chunk:
    chunk_id: str
    text: str
    guest_id: str
    episode_id: str
    segment_type: str
    timestamp: Optional[str]
    token_count: int


def split_into_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def chunk_text_by_tokens(text: str, enc, target_tokens: int, overlap_tokens: int) -> List[Tuple[str, int]]:
    sentences = split_into_sentences(text)
    if not sentences:
        return []

    chunks: List[Tuple[str, int]] = []
    current: List[str] = []
    current_tokens = 0

    for sent in sentences:
        stoks = len(enc.encode(sent))
        if current and current_tokens + stoks > target_tokens:
            content = " ".join(current).strip()
            ctoks = len(enc.encode(content))
            if content:
                chunks.append((content, ctoks))

            # overlap from tail
            overlap: List[str] = []
            overlap_count = 0
            for s in reversed(current):
                toks = len(enc.encode(s))
                if overlap_count + toks > overlap_tokens:
                    break
                overlap.insert(0, s)
                overlap_count += toks
            current = overlap + [sent]
            current_tokens = overlap_count + stoks
        else:
            current.append(sent)
            current_tokens += stoks

    if current:
        content = " ".join(current).strip()
        ctoks = len(enc.encode(content))
        if content:
            chunks.append((content, ctoks))

    return chunks


def fetch_all_rows(client, table: str, select: str, filters: Optional[List[Tuple[str, str, str]]] = None, page_size: int = 1000):
    offset = 0
    out = []
    while True:
        q = client.table(table).select(select).range(offset, offset + page_size - 1)
        if filters:
            for op, col, val in filters:
                if op == "eq":
                    q = q.eq(col, val)
                elif op == "in":
                    q = q.in_(col, val)
        res = q.execute()
        rows = res.data or []
        out.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return out


def main():
    parser = argparse.ArgumentParser(description="Backfill chunk_embeddings from segments using OpenAI embeddings")
    parser.add_argument("--target-tokens", type=int, default=450, help="Target tokens per chunk")
    parser.add_argument("--overlap-tokens", type=int, default=60, help="Token overlap across chunks")
    parser.add_argument("--embed-batch-size", type=int, default=64, help="Embedding batch size")
    parser.add_argument("--upsert-batch-size", type=int, default=100, help="Supabase upsert batch size")
    parser.add_argument("--limit-segments", type=int, default=0, help="Optional max number of segments to process")
    parser.add_argument("--reset-allowed", action="store_true", help="Delete existing allowed segment rows before backfill")
    parser.add_argument("--dry-run", action="store_true", help="Process without writing to DB")
    args = parser.parse_args()

    load_dotenv()
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY/SUPABASE_SERVICE_ROLE_KEY are required")
    if not openai_key and not args.dry_run:
        raise ValueError("OPENAI_API_KEY is required unless --dry-run is used")

    sb = create_client(supabase_url, supabase_key)
    enc = tiktoken.get_encoding("cl100k_base")
    oai = OpenAI(api_key=openai_key) if openai_key else None

    print("Loading episodes map...")
    episodes = fetch_all_rows(sb, "episodes", "id,guest_id")
    episode_guest: Dict[str, str] = {e["id"]: e.get("guest_id") for e in episodes if e.get("id") and e.get("guest_id")}

    print("Loading segments (interview + lightning_round)...")
    segments = sb.table("segments").select("id,episode_id,segment_type,content,start_time").in_(
        "segment_type", list(ALLOWED_SEGMENT_TYPES)
    ).order("episode_id").order("display_order").execute().data or []
    if args.limit_segments and args.limit_segments > 0:
        segments = segments[: args.limit_segments]

    print(f"Fetched {len(segments)} segments")

    if args.reset_allowed and not args.dry_run:
        print("Deleting existing chunk_embeddings for allowed segment types...")
        # Delete in two operations due API filters
        sb.table("chunk_embeddings").delete().eq("segment_type", "interview").execute()
        sb.table("chunk_embeddings").delete().eq("segment_type", "lightning_round").execute()

    chunks: List[Chunk] = []
    for seg in tqdm(segments, desc="Chunking segments"):
        episode_id = seg.get("episode_id")
        guest_id = episode_guest.get(episode_id)
        if not episode_id or not guest_id:
            continue
        content = (seg.get("content") or "").strip()
        if not content:
            continue
        seg_type = seg.get("segment_type")
        start_time = seg.get("start_time")
        seg_id = seg.get("id")
        for idx, (chunk_text, token_count) in enumerate(
            chunk_text_by_tokens(content, enc, args.target_tokens, args.overlap_tokens)
        ):
            chunks.append(
                Chunk(
                    chunk_id=f"{episode_id}:{seg_id}:{idx}",
                    text=chunk_text,
                    guest_id=guest_id,
                    episode_id=episode_id,
                    segment_type=seg_type,
                    timestamp=start_time,
                    token_count=token_count,
                )
            )

    print(f"Generated {len(chunks)} chunks")
    if args.dry_run:
        return

    records = []
    for i in tqdm(range(0, len(chunks), args.embed_batch_size), desc="Embedding + preparing records"):
        batch = chunks[i : i + args.embed_batch_size]
        texts = [c.text for c in batch]
        emb_res = oai.embeddings.create(model=EMBEDDING_MODEL, input=texts)
        vectors = [d.embedding for d in emb_res.data]

        for c, vec in zip(batch, vectors):
            records.append(
                {
                    "chunk_id": c.chunk_id,
                    "text": c.text,
                    "embedding": vec,
                    "guest_id": c.guest_id,
                    "episode_id": c.episode_id,
                    "theme_id": None,
                    "speaker": None,
                    "timestamp": c.timestamp,
                    "token_count": c.token_count,
                    "segment_type": c.segment_type,
                }
            )

    print(f"Upserting {len(records)} chunk_embeddings records...")
    for i in tqdm(range(0, len(records), args.upsert_batch_size), desc="Upserting to Supabase"):
        batch = records[i : i + args.upsert_batch_size]
        sb.table("chunk_embeddings").upsert(batch).execute()

    print("Backfill complete.")


if __name__ == "__main__":
    main()


