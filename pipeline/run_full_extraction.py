#!/usr/bin/env python3
"""
Full Concept & Insight Extraction Pipeline (Enhanced)
=====================================================

HDBSCAN clustering + 5 enhancement strategies + Gemini LLM naming + insight extraction.

Phases:
  1.  Pull embeddings from Supabase (cached)
  2.  UMAP dimensionality reduction
  3.  HDBSCAN clustering
  4.  Cluster analysis (TF-IDF, representatives)
  5.  Classification & relevance scoring
  6.  ENHANCEMENTS:
      6a. Noise recovery (kNN rescue)
      6b. Case study rescue (high-relevance 2-guest clusters)
      6c. Sub-clustering large clusters
      6d. Lower guest threshold for high-relevance
  7.  Co-occurrence graph + community detection
  8.  LLM naming via Gemini (batched)
  9.  Merge duplicate/near-duplicate concept names
  10. Insight extraction from co-occurrence pairs via Gemini
  11. Save JSON results

Usage:
  # Set your Gemini key first:
  $env:GEMINI_API_KEY = "your-key-here"

  # Full run:
  python pipeline/run_full_extraction.py

  # Dry run (skip LLM calls):
  python pipeline/run_full_extraction.py --dry-run

  # Force re-pull data from Supabase:
  python pipeline/run_full_extraction.py --force-refresh
"""

import argparse
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np
import requests
from sklearn.cluster import HDBSCAN
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_distances
from sklearn.neighbors import NearestNeighbors
import networkx as nx

try:
    import umap
    HAS_UMAP = True
except ImportError:
    HAS_UMAP = False
    print("WARNING: umap-learn not installed. Using PCA fallback (lower quality).")

# ============================================================
# Configuration
# ============================================================

SUPABASE_URL = "https://rhzpjvuutpjtdsbnskdy.supabase.co"
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoenBqdnV1dHBqdGRzYm5za2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzQxMjUsImV4cCI6MjA4NTc1MDEyNX0.1PjJnJr33fJ41eavn5e6dSVUDwR0-2D5_d0SqyhndqM",
)
REST_URL = f"{SUPABASE_URL}/rest/v1"
CACHE_DIR = Path(__file__).parent / ".cache"
PODCAST_ID = "lennys-podcast"

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

# Pipeline parameters (tuned from dry runs)
PARAMS = {
    "min_tokens": 50,
    "umap_n_components": 30,
    "umap_n_neighbors": 15,
    "umap_min_dist": 0.0,
    "hdbscan_min_cluster_size": 15,
    "hdbscan_min_samples": 8,
    "hdbscan_method": "leaf",
    # Enhancement thresholds
    "knn_rescue_k": 5,
    "knn_rescue_agreement": 4,       # 4/5 neighbors must agree
    "case_study_min_relevance": 0.6,  # rescue 2-guest clusters above this
    "subcluster_threshold": 80,       # re-cluster clusters with 80+ chunks
    "subcluster_min_size": 8,
    "low_guest_min_relevance": 0.7,   # allow 2-guest if relevance >= 0.7
    "low_guest_min_chunks": 20,       # and chunk count >= 20
    "insight_min_shared_eps": 3,      # min shared episodes for insight pair
    "insight_strong_eps": 5,          # strong pair threshold
}


def log(msg, end="\n"):
    ts = datetime.utcnow().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", end=end, flush=True)


def progress_bar(current, total, width=40, prefix=""):
    pct = current / max(total, 1)
    filled = int(width * pct)
    bar = "#" * filled + "." * (width - filled)
    print(f"\r  {prefix}[{bar}] {current}/{total} ({pct:.0%})", end="", flush=True)
    if current >= total:
        print()


# ============================================================
# Phase 1: Data Pull
# ============================================================

def pull_data(min_tokens=50, force_refresh=False):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    emb_cache = CACHE_DIR / "embeddings.npz"
    meta_cache = CACHE_DIR / "metadata.json"

    if emb_cache.exists() and meta_cache.exists() and not force_refresh:
        log(f"Loading cached data from {CACHE_DIR}")
        data = np.load(emb_cache)
        embeddings = data["embeddings"]
        with open(meta_cache) as f:
            cached = json.load(f)
        metadata, texts = cached["metadata"], cached["texts"]
        log(f"  Loaded {len(embeddings):,} embeddings ({embeddings.shape[1]}-dim)")
    else:
        log("Pulling from Supabase REST API (will cache for next run)...")
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
        all_rows = []
        batch_size = 500
        offset = 0
        select = "id,chunk_id,guest_id,episode_id,token_count,text,embedding"

        while True:
            params = {
                "select": select,
                "order": "id.asc",
                "limit": batch_size,
                "offset": offset,
            }
            if min_tokens > 0:
                params["token_count"] = f"gte.{min_tokens}"

            resp = requests.get(f"{REST_URL}/chunk_embeddings", headers=headers, params=params)
            resp.raise_for_status()
            rows = resp.json()
            if not rows:
                break
            all_rows.extend(rows)
            offset += batch_size
            progress_bar(len(all_rows), len(all_rows) + batch_size, prefix="Pulling: ")

        print()
        log(f"  Total: {len(all_rows):,} rows")

        texts = [r["text"] for r in all_rows]
        metadata = [
            {k: r[k] for k in ("id", "chunk_id", "guest_id", "episode_id", "token_count")}
            for r in all_rows
        ]
        embeddings_list = []
        for row in all_rows:
            emb = row["embedding"]
            if isinstance(emb, str):
                emb = json.loads(emb)
            embeddings_list.append(emb)

        embeddings = np.array(embeddings_list, dtype=np.float32)
        log(f"  Parsed {embeddings.shape[0]:,} x {embeddings.shape[1]}-dim")

        np.savez_compressed(emb_cache, embeddings=embeddings)
        with open(meta_cache, "w") as f:
            json.dump({"metadata": metadata, "texts": texts}, f)
        log(f"  Cached to {CACHE_DIR}")

    # Filter by min_tokens
    if min_tokens > 0:
        mask = [m["token_count"] >= min_tokens for m in metadata]
        if not all(mask):
            n_before = len(metadata)
            embeddings = embeddings[np.array(mask)]
            metadata = [m for m, k in zip(metadata, mask) if k]
            texts = [t for t, k in zip(texts, mask) if k]
            log(f"  Filtered: {n_before:,} → {len(metadata):,} (min_tokens={min_tokens})")

    return embeddings, metadata, texts


# ============================================================
# Phase 2: Normalize + UMAP
# ============================================================

def normalize_l2(embeddings):
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    return embeddings / norms


def reduce_umap(embeddings, n_components=30, n_neighbors=15, min_dist=0.0):
    if HAS_UMAP:
        log(f"  UMAP: {embeddings.shape[1]} → {n_components} dims")
        reducer = umap.UMAP(
            n_components=n_components, n_neighbors=n_neighbors,
            min_dist=min_dist, metric="cosine", random_state=42,
            low_memory=True, verbose=False,
        )
        return reducer.fit_transform(embeddings), "umap"
    else:
        from sklearn.decomposition import PCA
        log(f"  PCA fallback: {embeddings.shape[1]} → {n_components} dims")
        pca = PCA(n_components=n_components, svd_solver="full", random_state=42)
        reduced = pca.fit_transform(embeddings)
        log(f"  Explained variance: {pca.explained_variance_ratio_.sum():.1%}")
        return reduced, "pca"


# ============================================================
# Phase 3: HDBSCAN Clustering
# ============================================================

def run_hdbscan(data, min_cluster_size=15, min_samples=8, method="leaf"):
    log(f"  HDBSCAN(min_cluster={min_cluster_size}, min_samples={min_samples}, method={method})")
    clusterer = HDBSCAN(
        min_cluster_size=min_cluster_size, min_samples=min_samples,
        cluster_selection_method=method, metric="euclidean",
    )
    labels = clusterer.fit_predict(data)
    n_clusters = len(set(labels) - {-1})
    n_noise = (labels == -1).sum()
    log(f"  Found {n_clusters} clusters, {n_noise:,} noise ({n_noise/len(labels):.1%})")

    non_noise = labels != -1
    if n_clusters > 1 and non_noise.sum() > n_clusters:
        try:
            sil = silhouette_score(data[non_noise], labels[non_noise], metric="euclidean",
                                   sample_size=min(5000, int(non_noise.sum())))
            log(f"  Silhouette: {sil:.3f}")
        except Exception:
            pass

    return labels, clusterer


# ============================================================
# Phase 4: Cluster Analysis
# ============================================================

def analyze_clusters(embeddings_full, labels, metadata, texts):
    cluster_ids = sorted(set(labels) - {-1})
    clusters = {}

    # TF-IDF per cluster
    all_cluster_texts = []
    for cid in cluster_ids:
        mask = labels == cid
        combined = " ".join(texts[i] for i in range(len(texts)) if mask[i])
        all_cluster_texts.append(combined)

    try:
        tfidf = TfidfVectorizer(max_features=3000, stop_words="english",
                                ngram_range=(1, 2), min_df=1, max_df=0.7)
        tfidf_matrix = tfidf.fit_transform(all_cluster_texts)
        feature_names = tfidf.get_feature_names_out()
    except Exception:
        tfidf_matrix, feature_names = None, None

    for idx, cid in enumerate(cluster_ids):
        mask = labels == cid
        indices = np.where(mask)[0]

        cluster_embeds = embeddings_full[mask]
        centroid = cluster_embeds.mean(axis=0)
        centroid_norm = centroid / (np.linalg.norm(centroid) + 1e-10)
        cosine_sims = cluster_embeds @ centroid_norm
        rep_local = np.argsort(-cosine_sims)[:10]
        rep_global = indices[rep_local]

        guest_ids = sorted(set(metadata[i]["guest_id"] for i in indices))
        episode_ids = sorted(set(metadata[i]["episode_id"] for i in indices))

        keywords = []
        if tfidf_matrix is not None:
            scores = tfidf_matrix[idx].toarray().flatten()
            top_idx = scores.argsort()[-15:][::-1]
            keywords = [feature_names[i] for i in top_idx if scores[i] > 0]

        clusters[cid] = {
            "size": int(mask.sum()),
            "n_guests": len(guest_ids),
            "guest_ids": guest_ids,
            "n_episodes": len(episode_ids),
            "episode_ids": episode_ids,
            "keywords": keywords,
            "chunk_indices": indices.tolist(),
            "representatives": [
                {
                    "index": int(rep_global[j]),
                    "text": texts[rep_global[j]][:400],
                    "guest_id": metadata[rep_global[j]]["guest_id"],
                    "episode_id": metadata[rep_global[j]]["episode_id"],
                    "chunk_id": metadata[rep_global[j]].get("chunk_id", ""),
                    "similarity": float(cosine_sims[rep_local[j]]),
                }
                for j in range(min(10, len(rep_local)))
            ],
        }

    return clusters


# ============================================================
# Phase 5: Classification (same as original)
# ============================================================

RELEVANCE_DOMAINS = {
    "product": {
        "keywords": {"product", "pm", "pms", "product manager", "roadmap", "feature", "ship",
                     "mvp", "product strategy", "user", "customer", "ux", "design",
                     "prototype", "backlog", "sprint", "okr", "okrs", "north star", "metric",
                     "activation", "retention", "onboarding", "churn", "engagement"},
        "weight": 1.0,
    },
    "growth": {
        "keywords": {"growth", "acquisition", "retention", "conversion", "funnel", "seo",
                     "paid", "performance marketing", "virality", "referral", "network effect",
                     "marketplace", "supply", "demand", "gmv", "plg", "product led",
                     "freemium", "experiment", "ab test"},
        "weight": 1.0,
    },
    "startup": {
        "keywords": {"startup", "founder", "fundraising", "pitch", "yc", "venture", "seed",
                     "series", "pivot", "product market fit", "pmf",
                     "launch", "early stage", "scale", "hypergrowth", "enterprise"},
        "weight": 1.0,
    },
    "leadership": {
        "keywords": {"leadership", "manager", "managing", "ceo", "cpo", "vp", "director",
                     "coaching", "feedback", "culture", "hiring", "firing", "promoted",
                     "career", "team", "org", "organizational", "decision", "strategy"},
        "weight": 0.9,
    },
    "engineering": {
        "keywords": {"engineering", "technical", "code", "ai", "ml", "infrastructure",
                     "platform", "api", "developer", "devtools", "copilot", "agents",
                     "llm", "chatgpt", "automation", "data", "analytics"},
        "weight": 1.0,
    },
    "marketing": {
        "keywords": {"marketing", "brand", "positioning", "messaging", "content",
                     "storytelling", "copywriting", "category", "differentiation",
                     "pricing", "sales", "pitch", "customer success"},
        "weight": 0.9,
    },
    "personal_growth": {
        "keywords": {"career", "interview", "resume", "promotion", "skills", "learning",
                     "coach", "mentor", "advice", "book", "books", "reading", "writing",
                     "speaking", "communication", "productivity", "habits", "mindset",
                     "imposter", "resilience", "focus", "energy"},
        "weight": 0.8,
    },
    "wisdom": {
        "keywords": {"book", "books", "favorite", "recommend", "motto", "life lesson",
                     "movie", "podcast", "interview question", "lightning", "habit"},
        "weight": 0.7,
    },
}

LIGHTNING_SIGNALS = {
    "book", "books", "favorite", "recommend", "motto", "lightning",
    "movie", "interview question", "podcast", "habit", "life lesson",
}
NOISE_SIGNALS = {
    "rachitsky 01", "rachitsky 00", "lenny rachitsky", "lenny 01",
    "00 05", "00 07", "00 00", "00 59",
}


def classify_clusters(clusters):
    for cid, c in clusters.items():
        kw_set = set(c["keywords"][:15])
        kw_text = " ".join(c["keywords"][:15]).lower()
        all_text = " ".join(r.get("text", "")[:200].lower() for r in c.get("representatives", []))

        # Noise check
        noise_matches = len(kw_set & NOISE_SIGNALS)
        real_kw = [k for k in c["keywords"][:8]
                   if not any(n in k for n in ("rachitsky", "lenny", "00 ", "01 "))]
        is_noise = noise_matches >= 3 and len(real_kw) <= 1

        # Lightning round
        lr_matches = len(kw_set & LIGHTNING_SIGNALS)
        is_lr = (lr_matches >= 2 or "lightning" in kw_text or "favorite" in kw_text
                 or ("book" in kw_text and "recommend" in all_text) or "motto" in kw_text)

        # Domain scoring
        domain_scores = {}
        for domain, info in RELEVANCE_DOMAINS.items():
            matches = sum(1 for kw in info["keywords"] if kw in kw_text or kw in all_text)
            domain_scores[domain] = matches * info["weight"]

        best_domain = max(domain_scores, key=domain_scores.get) if domain_scores else "other"
        best_score = domain_scores.get(best_domain, 0)
        relevance = min(1.0, best_score / 3.0)
        guest_boost = min(0.2, c["n_guests"] / 50.0)
        relevance = min(1.0, relevance + guest_boost)

        if is_noise:
            subcategory = "noise"
            relevance = 0.0
        elif is_lr:
            subcategory = "lightning_round"
            relevance = max(relevance, 0.5)
        elif c["n_guests"] <= 2:
            subcategory = "case_study"
            relevance = max(relevance, 0.3)
        else:
            subcategory = "topical"

        # Standard keep rule
        keep = (relevance >= 0.3 and (c["n_guests"] >= 3 or subcategory == "lightning_round"))

        c.update({
            "category": best_domain,
            "subcategory": subcategory,
            "relevance_score": round(relevance, 3),
            "keep": keep,
            "domain_scores": {k: round(v, 2) for k, v in sorted(
                domain_scores.items(), key=lambda x: -x[1])[:3]},
        })

    return clusters


# ============================================================
# Phase 6: Enhancement Strategies
# ============================================================

def enhance_noise_recovery(embeddings_full, labels, metadata, texts, clusters, params):
    """
    Strategy 1: kNN rescue — absorb noise points into clusters if their
    k nearest clustered neighbors strongly agree on the cluster.
    """
    k = params["knn_rescue_k"]
    agreement_threshold = params["knn_rescue_agreement"]

    noise_mask = labels == -1
    noise_indices = np.where(noise_mask)[0]
    clustered_indices = np.where(~noise_mask)[0]

    if len(noise_indices) == 0 or len(clustered_indices) == 0:
        return labels, clusters

    log(f"  Noise recovery: {len(noise_indices):,} noise points, k={k}, threshold={agreement_threshold}")

    # Build kNN index on clustered points using original embeddings
    nn = NearestNeighbors(n_neighbors=k, metric="cosine", algorithm="brute")
    nn.fit(embeddings_full[clustered_indices])

    # For each noise point, find k nearest clustered neighbors
    distances, neighbor_local = nn.kneighbors(embeddings_full[noise_indices])
    neighbor_global = clustered_indices[neighbor_local]

    rescued = 0
    new_labels = labels.copy()
    for i, noise_idx in enumerate(noise_indices):
        neighbor_labels = [labels[n] for n in neighbor_global[i]]
        label_counts = Counter(neighbor_labels)
        most_common_label, count = label_counts.most_common(1)[0]

        if count >= agreement_threshold and most_common_label != -1:
            new_labels[noise_idx] = most_common_label
            rescued += 1

    log(f"  Rescued {rescued:,} noise points into existing clusters")

    # Rebuild cluster stats for affected clusters
    if rescued > 0:
        affected_clusters = set(new_labels[noise_indices[new_labels[noise_indices] != -1]])
        for cid in affected_clusters:
            if cid in clusters:
                mask = new_labels == cid
                indices = np.where(mask)[0]
                clusters[cid]["size"] = int(mask.sum())
                clusters[cid]["n_guests"] = len(set(metadata[i]["guest_id"] for i in indices))
                clusters[cid]["guest_ids"] = sorted(set(metadata[i]["guest_id"] for i in indices))
                clusters[cid]["n_episodes"] = len(set(metadata[i]["episode_id"] for i in indices))
                clusters[cid]["episode_ids"] = sorted(set(metadata[i]["episode_id"] for i in indices))
                clusters[cid]["chunk_indices"] = indices.tolist()

    return new_labels, clusters


def enhance_case_study_rescue(clusters, params):
    """
    Strategy 2: Rescue high-relevance case studies (2-guest clusters).
    These are deep dives that still have valuable content.
    """
    min_rel = params["case_study_min_relevance"]
    rescued = 0

    for cid, c in clusters.items():
        if c["subcategory"] == "case_study" and not c["keep"]:
            if c["relevance_score"] >= min_rel:
                c["keep"] = True
                c["subcategory"] = "deep_dive"
                rescued += 1

    log(f"  Case study rescue: {rescued} clusters promoted to 'deep_dive' (relevance >= {min_rel})")
    return clusters


def enhance_subcluster_large(embeddings_full, labels, metadata, texts, clusters, params):
    """
    Strategy 3: Sub-cluster large clusters (80+ chunks) to find sub-concepts.
    """
    threshold = params["subcluster_threshold"]
    sub_min_size = params["subcluster_min_size"]
    large_clusters = [cid for cid, c in clusters.items() if c["size"] >= threshold and c["keep"]]

    if not large_clusters:
        log(f"  Sub-clustering: no clusters with {threshold}+ chunks to split")
        return labels, clusters

    log(f"  Sub-clustering: {len(large_clusters)} clusters with {threshold}+ chunks")
    next_cid = max(clusters.keys()) + 1
    new_sub_count = 0

    for cid in large_clusters:
        indices = np.array(clusters[cid]["chunk_indices"])
        sub_embeddings = embeddings_full[indices]

        # Run HDBSCAN on the sub-cluster at finer resolution
        sub_reduced = normalize_l2(sub_embeddings.copy())
        try:
            sub_clusterer = HDBSCAN(
                min_cluster_size=sub_min_size, min_samples=max(3, sub_min_size // 2),
                cluster_selection_method="leaf", metric="cosine",
            )
            sub_labels = sub_clusterer.fit_predict(sub_reduced)
        except Exception:
            continue

        n_sub = len(set(sub_labels) - {-1})
        if n_sub <= 1:
            continue  # No meaningful split

        log(f"    C{cid} ({clusters[cid]['size']} chunks) → {n_sub} sub-clusters")

        # Keep the original cluster for the largest sub-cluster, create new for others
        sub_ids = sorted(set(sub_labels) - {-1})
        sub_sizes = [(sid, (sub_labels == sid).sum()) for sid in sub_ids]
        sub_sizes.sort(key=lambda x: -x[1])

        for rank, (sid, sz) in enumerate(sub_sizes):
            if rank == 0:
                continue  # Keep original cluster for largest sub-cluster
            if sz < sub_min_size:
                continue

            sub_indices = indices[sub_labels == sid]
            new_cid = next_cid
            next_cid += 1

            # Update labels
            for idx in sub_indices:
                labels[idx] = new_cid

            # Create new cluster entry
            guest_ids = sorted(set(metadata[i]["guest_id"] for i in sub_indices))
            episode_ids = sorted(set(metadata[i]["episode_id"] for i in sub_indices))

            # Pick representatives
            sub_embs = embeddings_full[sub_indices]
            cent = sub_embs.mean(axis=0)
            cent_norm = cent / (np.linalg.norm(cent) + 1e-10)
            sims = sub_embs @ cent_norm
            rep_local = np.argsort(-sims)[:10]
            rep_global = sub_indices[rep_local]

            clusters[new_cid] = {
                "size": int(sz),
                "n_guests": len(guest_ids),
                "guest_ids": guest_ids,
                "n_episodes": len(episode_ids),
                "episode_ids": episode_ids,
                "keywords": [],  # Will be filled after TF-IDF re-run
                "chunk_indices": sub_indices.tolist(),
                "representatives": [
                    {
                        "index": int(rep_global[j]),
                        "text": texts[rep_global[j]][:400],
                        "guest_id": metadata[rep_global[j]]["guest_id"],
                        "episode_id": metadata[rep_global[j]]["episode_id"],
                        "chunk_id": metadata[rep_global[j]].get("chunk_id", ""),
                        "similarity": float(sims[rep_local[j]]),
                    }
                    for j in range(min(10, len(rep_local)))
                ],
                "category": clusters[cid].get("category", "other"),
                "subcategory": "topical",
                "relevance_score": clusters[cid].get("relevance_score", 0.5),
                "keep": True,
                "parent_cluster": cid,
            }
            new_sub_count += 1

        # Update original cluster (now smaller)
        remaining = indices[sub_labels == sub_sizes[0][0]]
        for idx in indices:
            if idx not in remaining and labels[idx] == cid:
                pass  # Already reassigned above
        clusters[cid]["size"] = int((labels == cid).sum())
        clusters[cid]["chunk_indices"] = np.where(labels == cid)[0].tolist()
        clusters[cid]["n_guests"] = len(set(metadata[i]["guest_id"]
                                            for i in clusters[cid]["chunk_indices"]))
        clusters[cid]["n_episodes"] = len(set(metadata[i]["episode_id"]
                                              for i in clusters[cid]["chunk_indices"]))

    log(f"  Created {new_sub_count} new sub-clusters")
    return labels, clusters


def enhance_lower_guest_threshold(clusters, params):
    """
    Strategy 4: Allow 2-guest clusters if they have high relevance + enough chunks.
    """
    min_rel = params["low_guest_min_relevance"]
    min_chunks = params["low_guest_min_chunks"]
    rescued = 0

    for cid, c in clusters.items():
        if not c["keep"] and c["n_guests"] >= 2 and c["subcategory"] != "noise":
            if c["relevance_score"] >= min_rel and c["size"] >= min_chunks:
                c["keep"] = True
                if c["subcategory"] == "case_study":
                    c["subcategory"] = "focused"
                rescued += 1

    log(f"  Lower guest threshold rescue: {rescued} clusters (rel >= {min_rel}, chunks >= {min_chunks})")
    return clusters


def run_all_enhancements(embeddings_full, labels, metadata, texts, clusters, params):
    """Run all 4 enhancement strategies in sequence."""
    log("\n[ENHANCEMENTS]")

    # 6a: Noise recovery
    t0 = time.time()
    labels, clusters = enhance_noise_recovery(
        embeddings_full, labels, metadata, texts, clusters, params)
    log(f"  ({time.time()-t0:.1f}s)")

    # 6b: Case study rescue
    clusters = enhance_case_study_rescue(clusters, params)

    # 6c: Sub-cluster large clusters
    t0 = time.time()
    labels, clusters = enhance_subcluster_large(
        embeddings_full, labels, metadata, texts, clusters, params)
    log(f"  ({time.time()-t0:.1f}s)")

    # 6d: Lower guest threshold
    clusters = enhance_lower_guest_threshold(clusters, params)

    # Re-classify after enhancements (updates keep/subcategory for new clusters)
    # Only classify clusters that don't have classification yet
    for cid, c in clusters.items():
        if "subcategory" not in c:
            c["subcategory"] = "topical"
            c["keep"] = True

    kept = sum(1 for c in clusters.values() if c.get("keep"))
    total = len(clusters)
    log(f"\n  After enhancements: {kept} kept / {total} total clusters")

    return labels, clusters


# ============================================================
# Phase 7: Co-occurrence Graph
# ============================================================

def build_cooccurrence_graph(metadata, labels, clusters):
    cluster_ids = sorted(set(labels) - {-1})
    episode_clusters = defaultdict(set)
    for i, m in enumerate(metadata):
        if labels[i] != -1:
            episode_clusters[m["episode_id"]].add(int(labels[i]))

    G = nx.Graph()
    for cid in cluster_ids:
        G.add_node(cid, size=clusters.get(cid, {}).get("size", 0))

    for episode, ep_clusters in episode_clusters.items():
        ep_list = sorted(ep_clusters)
        for i, c1 in enumerate(ep_list):
            for c2 in ep_list[i + 1:]:
                if G.has_edge(c1, c2):
                    G[c1][c2]["weight"] += 1
                else:
                    G.add_edge(c1, c2, weight=1)

    return G, episode_clusters


# ============================================================
# Phase 8: LLM Naming via Gemini
# ============================================================

def call_gemini(prompt, max_retries=3):
    """Call Gemini API with structured JSON output."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not set!")

    url = f"{GEMINI_URL}?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.3,
            "maxOutputTokens": 4096,
        },
    }

    for attempt in range(max_retries):
        try:
            resp = requests.post(url, json=payload, timeout=60)
            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                log(f"    Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text)
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            log(f"    Failed to parse Gemini response: {e}")
            return None
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            log(f"    Gemini API error: {e}")
            return None

    return None


def batch_name_clusters(clusters, batch_size=5):
    """
    Name clusters using Gemini in batches.
    Returns dict: cluster_id -> {title, definition, category, is_coherent}
    """
    kept_ids = sorted(cid for cid, c in clusters.items() if c.get("keep"))
    log(f"  Naming {len(kept_ids)} clusters in batches of {batch_size}...")

    names = {}
    for batch_start in range(0, len(kept_ids), batch_size):
        batch_ids = kept_ids[batch_start:batch_start + batch_size]
        progress_bar(batch_start + len(batch_ids), len(kept_ids), prefix="Naming: ")

        # Build prompt for this batch
        cluster_descriptions = []
        for cid in batch_ids:
            c = clusters[cid]
            kw = ", ".join(c["keywords"][:10])
            reps = "\n".join(
                f"  - \"{r['text'][:200]}...\""
                for r in c["representatives"][:5]
            )
            cluster_descriptions.append(
                f"CLUSTER {cid} ({c['size']} chunks, {c['n_guests']} guests, {c['n_episodes']} episodes):\n"
                f"  Keywords: {kw}\n"
                f"  Type: {c.get('subcategory', 'topical')}\n"
                f"  Sample quotes:\n{reps}"
            )

        prompt = f"""You are analyzing podcast transcript clusters from Lenny's Podcast (tech/product leadership).
Each cluster below is a group of transcript chunks that were clustered together by HDBSCAN.
Your job: give each cluster a clear, concise concept name and definition.

Target audience: people building tech products (PMs, founders, growth leads, engineering leaders).

For each cluster, return:
- "title": A clear 3-7 word concept name (e.g., "Product-Market Fit Signals", "The Art of Giving Feedback")
- "definition": One sentence (15-25 words) defining what this concept is about
- "category": One of: product, growth, startup, leadership, engineering, marketing, personal_growth, wisdom
- "is_coherent": true if the cluster represents a clear, nameable concept; false if it's too scattered

Return a JSON array with one object per cluster, in order. Each object must have keys:
"cluster_id", "title", "definition", "category", "is_coherent"

{chr(10).join(cluster_descriptions)}
"""
        result = call_gemini(prompt)
        if result and isinstance(result, list):
            for item in result:
                cid = item.get("cluster_id")
                if cid is not None:
                    names[int(cid)] = item
        elif result and isinstance(result, dict) and "clusters" in result:
            for item in result["clusters"]:
                cid = item.get("cluster_id")
                if cid is not None:
                    names[int(cid)] = item

        time.sleep(0.5)  # Brief pause between batches

    log(f"  Named {len(names)} clusters")
    coherent = sum(1 for n in names.values() if n.get("is_coherent", True))
    log(f"  Coherent: {coherent}, Incoherent: {len(names) - coherent}")
    return names


def merge_similar_names(names, clusters):
    """
    Merge clusters that got identical or near-identical names.
    Returns updated names dict with merged entries.
    """
    # Group by normalized title
    by_title = defaultdict(list)
    for cid, name_info in names.items():
        if not name_info.get("is_coherent", True):
            continue
        normalized = name_info.get("title", "").strip().lower()
        normalized = re.sub(r'[^a-z0-9\s]', '', normalized)
        by_title[normalized].append(cid)

    merged = 0
    merge_map = {}  # old_cid -> keep_cid
    for title, cids in by_title.items():
        if len(cids) <= 1:
            continue
        # Keep the cluster with the most guests
        cids.sort(key=lambda c: clusters.get(c, {}).get("n_guests", 0), reverse=True)
        keep_cid = cids[0]
        for drop_cid in cids[1:]:
            merge_map[drop_cid] = keep_cid
            merged += 1
            # Merge stats
            if keep_cid in clusters and drop_cid in clusters:
                clusters[keep_cid]["guest_ids"] = sorted(
                    set(clusters[keep_cid].get("guest_ids", []) +
                        clusters[drop_cid].get("guest_ids", [])))
                clusters[keep_cid]["n_guests"] = len(clusters[keep_cid]["guest_ids"])
                clusters[keep_cid]["episode_ids"] = sorted(
                    set(clusters[keep_cid].get("episode_ids", []) +
                        clusters[drop_cid].get("episode_ids", [])))
                clusters[keep_cid]["n_episodes"] = len(clusters[keep_cid]["episode_ids"])
                clusters[keep_cid]["size"] += clusters[drop_cid]["size"]
                clusters[drop_cid]["keep"] = False

    if merged > 0:
        log(f"  Merged {merged} duplicate-named clusters")
        # Remove merged entries from names
        for drop_cid in merge_map:
            names.pop(drop_cid, None)

    return names, clusters, merge_map


# ============================================================
# Phase 9: Insight Extraction
# ============================================================

def extract_insights(clusters, names, graph, metadata, labels, texts, params, batch_size=8):
    """
    Extract insights from co-occurrence pairs between named concepts.
    Uses Gemini to interpret the relationship.
    """
    min_shared = params["insight_min_shared_eps"]
    kept_set = set(cid for cid, c in clusters.items() if c.get("keep") and cid in names)

    # Get significant pairs
    pairs = []
    for u, v, d in graph.edges(data=True):
        if u in kept_set and v in kept_set and d["weight"] >= min_shared:
            pairs.append((u, v, d["weight"]))
    pairs.sort(key=lambda x: -x[2])

    # Cap at top 200 pairs to keep LLM costs reasonable
    pairs = pairs[:200]
    log(f"  Extracting insights from {len(pairs)} concept pairs...")

    if not pairs:
        return []

    insights = []
    for batch_start in range(0, len(pairs), batch_size):
        batch = pairs[batch_start:batch_start + batch_size]
        progress_bar(batch_start + len(batch), len(pairs), prefix="Insights: ")

        pair_descriptions = []
        for u, v, weight in batch:
            name_u = names.get(u, {}).get("title", f"Cluster {u}")
            name_v = names.get(v, {}).get("title", f"Cluster {v}")
            def_u = names.get(u, {}).get("definition", "")
            def_v = names.get(v, {}).get("definition", "")

            # Find shared episodes and grab evidence chunks
            eps_u = set(clusters[u].get("episode_ids", []))
            eps_v = set(clusters[v].get("episode_ids", []))
            shared_eps = eps_u & eps_v

            # Get representative quotes from shared episodes
            evidence_quotes = []
            for rep in clusters[u].get("representatives", [])[:3]:
                if rep.get("episode_id") in shared_eps:
                    evidence_quotes.append(f"  [on {name_u}] \"{rep['text'][:150]}...\"")
            for rep in clusters[v].get("representatives", [])[:3]:
                if rep.get("episode_id") in shared_eps:
                    evidence_quotes.append(f"  [on {name_v}] \"{rep['text'][:150]}...\"")

            if not evidence_quotes:
                # Fallback: use top reps even if not from shared episodes
                for rep in clusters[u].get("representatives", [])[:2]:
                    evidence_quotes.append(f"  [on {name_u}] \"{rep['text'][:150]}...\"")
                for rep in clusters[v].get("representatives", [])[:2]:
                    evidence_quotes.append(f"  [on {name_v}] \"{rep['text'][:150]}...\"")

            evidence_text = "\n".join(evidence_quotes[:6])
            pair_descriptions.append(
                f"PAIR: \"{name_u}\" ↔ \"{name_v}\" (shared in {weight} episodes)\n"
                f"  Concept A: {name_u} — {def_u}\n"
                f"  Concept B: {name_v} — {def_v}\n"
                f"  Evidence:\n{evidence_text}"
            )

        prompt = f"""You are analyzing concept pairs from Lenny's Podcast (tech/product leadership).
These concept pairs frequently co-occur in the same episodes. Your job: identify the NON-OBVIOUS insight
about WHY these concepts connect and what that means for someone building tech products.

Rules:
- Each insight must be a non-obvious relationship, NOT just "both topics exist"
- The takeaway must be actionable for PMs, founders, or tech leaders
- Signal types: "high_consensus" (most guests agree), "split_view" (guests disagree), "emerging" (new trend)
- Only create an insight if the relationship is genuinely interesting. Set "skip": true if it's trivial.

For each pair, return:
- "concept_a": title of first concept
- "concept_b": title of second concept
- "title": A compelling 5-10 word insight title
- "takeaway": One sentence insight (20-40 words)
- "signal": "high_consensus", "split_view", or "emerging"
- "explanation": Array of 2-3 sentences explaining the insight with evidence
- "category": product, growth, startup, leadership, engineering, marketing, personal_growth, wisdom
- "skip": true if the relationship is trivial/uninteresting

Return a JSON array with one object per pair, in order.

{chr(10).join(pair_descriptions)}
"""
        result = call_gemini(prompt)
        if result:
            items = []
            if isinstance(result, list):
                items = result
            elif isinstance(result, dict) and "insights" in result:
                items = result["insights"]
            elif isinstance(result, dict):
                items = [result]

            for item in items:
                # Handle nested lists (Gemini sometimes wraps in extra array)
                if isinstance(item, list):
                    for sub in item:
                        if isinstance(sub, dict) and not sub.get("skip", False):
                            insights.append(sub)
                elif isinstance(item, dict) and not item.get("skip", False):
                    insights.append(item)

        time.sleep(0.5)

    log(f"  Generated {len(insights)} insights from {len(pairs)} pairs")
    return insights


# ============================================================
# Phase 10: Build Final Output
# ============================================================

def slugify(text):
    slug = text.lower().strip()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug[:80].strip('-')


def build_output(clusters, names, insights, metadata, texts):
    """Build the final JSON output for DB writing."""
    concepts_out = []
    for cid, name_info in sorted(names.items()):
        if not name_info.get("is_coherent", True):
            continue
        c = clusters.get(cid, {})
        if not c.get("keep"):
            continue

        title = name_info.get("title", f"Concept {cid}")
        references = []
        seen_guests = set()
        for rep in c.get("representatives", [])[:8]:
            guest_id = rep.get("guest_id")
            if guest_id in seen_guests:
                continue
            seen_guests.add(guest_id)
            references.append({
                "guest_id": guest_id,
                "episode_id": rep.get("episode_id"),
                "quote": rep.get("text", "")[:500],
                "chunk_id": rep.get("chunk_id", ""),
                "display_order": len(references) + 1,
            })

        concepts_out.append({
            "title": title,
            "slug": slugify(title),
            "summary": name_info.get("definition", ""),
            "category": name_info.get("category", c.get("category", "product")),
            "theme_label": c.get("subcategory", "topical"),
            "guest_count": c.get("n_guests", 0),
            "episode_count": c.get("n_episodes", 0),
            "cluster_id": cid,
            "cluster_size": c.get("size", 0),
            "relevance_score": c.get("relevance_score", 0),
            "references": references,
        })

    insights_out = []
    for ins in insights:
        title = ins.get("title", "Untitled Insight")
        explanation = ins.get("explanation", [])
        if isinstance(explanation, str):
            explanation = [explanation]

        insights_out.append({
            "title": title,
            "slug": slugify(title),
            "takeaway": ins.get("takeaway", ""),
            "signal": ins.get("signal", "high_consensus"),
            "category": ins.get("category", "product"),
            "explanation": explanation,
            "concept_a": ins.get("concept_a", ""),
            "concept_b": ins.get("concept_b", ""),
        })

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "podcast_id": PODCAST_ID,
        "stats": {
            "total_concepts": len(concepts_out),
            "total_insights": len(insights_out),
            "total_articles": len(concepts_out) + len(insights_out),
        },
        "concepts": concepts_out,
        "insights": insights_out,
    }


# ============================================================
# Main Pipeline
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Full Concept & Insight Extraction Pipeline")
    parser.add_argument("--dry-run", action="store_true",
                        help="Skip LLM calls — clustering and analysis only")
    parser.add_argument("--force-refresh", action="store_true",
                        help="Force re-pull from Supabase (ignore cache)")
    parser.add_argument("--skip-insights", action="store_true",
                        help="Skip insight extraction (concepts only)")
    args = parser.parse_args()

    if not args.dry_run and not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY environment variable not set!")
        print("  Set it: $env:GEMINI_API_KEY = \"your-key\"")
        print("  Or run with --dry-run to skip LLM calls")
        sys.exit(1)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print()
    print("=" * 62)
    print("  ENHANCED CONCEPT & INSIGHT EXTRACTION PIPELINE")
    print("  HDBSCAN + 5 Strategies + Gemini Naming + Insights")
    print("=" * 62)
    print()

    total_start = time.time()

    # ── Phase 1: Pull data ──
    log("[1/10] Pulling embeddings...")
    t0 = time.time()
    embeddings, metadata, texts = pull_data(
        min_tokens=PARAMS["min_tokens"], force_refresh=args.force_refresh)
    log(f"  {len(embeddings):,} chunks, {len(set(m['guest_id'] for m in metadata)):,} guests, "
        f"{len(set(m['episode_id'] for m in metadata)):,} episodes ({time.time()-t0:.1f}s)")

    # ── Phase 2: Normalize + UMAP ──
    log("\n[2/10] Normalizing + dimensionality reduction...")
    t0 = time.time()
    embeddings_norm = normalize_l2(embeddings.copy())
    reduced, method = reduce_umap(
        embeddings_norm, n_components=PARAMS["umap_n_components"],
        n_neighbors=PARAMS["umap_n_neighbors"], min_dist=PARAMS["umap_min_dist"])
    log(f"  Method: {method} ({time.time()-t0:.1f}s)")

    # ── Phase 3: HDBSCAN ──
    log("\n[3/10] HDBSCAN clustering...")
    t0 = time.time()
    labels, clusterer = run_hdbscan(
        reduced, min_cluster_size=PARAMS["hdbscan_min_cluster_size"],
        min_samples=PARAMS["hdbscan_min_samples"], method=PARAMS["hdbscan_method"])
    log(f"  ({time.time()-t0:.1f}s)")

    # ── Phase 4: Analyze ──
    log("\n[4/10] Analyzing clusters...")
    t0 = time.time()
    clusters = analyze_clusters(embeddings_norm, labels, metadata, texts)
    log(f"  {len(clusters)} clusters analyzed ({time.time()-t0:.1f}s)")

    # ── Phase 5: Classify ──
    log("\n[5/10] Classifying clusters...")
    clusters = classify_clusters(clusters)
    kept_before = sum(1 for c in clusters.values() if c.get("keep"))
    by_sub = Counter(c["subcategory"] for c in clusters.values())
    for sub, cnt in by_sub.most_common():
        k = sum(1 for c in clusters.values() if c["subcategory"] == sub and c.get("keep"))
        log(f"  {sub}: {cnt} total, {k} kept")
    log(f"  Total kept (before enhancements): {kept_before}")

    # ── Phase 6: Enhancements ──
    log("\n[6/10] Running enhancement strategies...")
    labels, clusters = run_all_enhancements(
        embeddings_norm, labels, metadata, texts, clusters, PARAMS)

    # ── Phase 7: Co-occurrence graph ──
    log("\n[7/10] Building co-occurrence graph...")
    t0 = time.time()
    graph, episode_clusters = build_cooccurrence_graph(metadata, labels, clusters)
    kept_set = set(c for c, cl in clusters.items() if cl.get("keep"))
    kept_edges = [(u, v, d) for u, v, d in graph.edges(data=True)
                  if u in kept_set and v in kept_set and d["weight"] >= PARAMS["insight_min_shared_eps"]]
    strong_edges = [e for e in kept_edges if e[2]["weight"] >= PARAMS["insight_strong_eps"]]
    log(f"  {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges")
    log(f"  Significant pairs (kept, 3+ eps): {len(kept_edges)}")
    log(f"  Strong pairs (5+ eps): {len(strong_edges)}")
    log(f"  ({time.time()-t0:.1f}s)")

    # ── Summary before LLM phase ──
    kept_count = sum(1 for c in clusters.values() if c.get("keep"))
    print()
    print("-" * 55)
    print(f"  PRE-LLM SUMMARY")
    print(f"  Clusters to name: {kept_count:>3}")
    print(f"  Insight pairs:    {len(kept_edges):>3}")
    print(f"  Estimated output: ~{int(kept_count*0.85)}-{kept_count} concepts + ~{int(len(kept_edges)*0.3)}-{int(len(kept_edges)*0.4)} insights")
    print("-" * 55)
    print()

    if args.dry_run:
        log("DRY RUN — skipping LLM naming and insight extraction")
        log("Re-run without --dry-run to complete the pipeline")

        # Save dry run results
        dry_results = {
            "timestamp": datetime.utcnow().isoformat(),
            "mode": "dry_run",
            "stats": {
                "total_chunks": len(embeddings),
                "raw_clusters": len(clusters),
                "kept_clusters": kept_count,
                "noise_points": int((labels == -1).sum()),
                "noise_pct": float((labels == -1).sum() / len(labels)),
                "significant_pairs": len(kept_edges),
                "strong_pairs": len(strong_edges),
            },
            "clusters": {
                str(k): {
                    "size": v["size"], "n_guests": v["n_guests"], "n_episodes": v["n_episodes"],
                    "keywords": v["keywords"][:10], "category": v.get("category"),
                    "subcategory": v.get("subcategory"), "relevance_score": v.get("relevance_score"),
                    "keep": v.get("keep"),
                }
                for k, v in clusters.items()
            },
        }
        out_file = CACHE_DIR / "dry_run_enhanced.json"
        with open(out_file, "w") as f:
            json.dump(dry_results, f, indent=2)
        log(f"Dry run results saved to: {out_file}")

        elapsed = time.time() - total_start
        log(f"\nTotal time: {elapsed:.1f}s")
        return

    # ── Phase 8: LLM Naming ──
    log("\n[8/10] LLM naming via Gemini...")
    t0 = time.time()
    names = batch_name_clusters(clusters, batch_size=5)
    log(f"  ({time.time()-t0:.1f}s)")

    # Save naming results immediately (so we don't lose them if insights crash)
    naming_cache = CACHE_DIR / "naming_results.json"
    with open(naming_cache, "w") as f:
        json.dump({str(k): v for k, v in names.items()}, f, indent=2, ensure_ascii=False)
    log(f"  Naming results cached to {naming_cache}")

    # ── Phase 9: Merge duplicates ──
    log("\n[9/10] Merging duplicate names...")
    names, clusters, merge_map = merge_similar_names(names, clusters)
    final_concepts = sum(1 for n in names.values() if n.get("is_coherent", True))
    log(f"  Final concept count: {final_concepts}")

    # ── Phase 10: Insight extraction ──
    insights = []
    if not args.skip_insights:
        log("\n[10/10] Extracting insights from co-occurrence pairs...")
        t0 = time.time()
        insights = extract_insights(clusters, names, graph, metadata, labels, texts, PARAMS)
        log(f"  ({time.time()-t0:.1f}s)")
    else:
        log("\n[10/10] Skipping insights (--skip-insights)")

    # ── Build and save output ──
    log("\nBuilding final output...")
    output = build_output(clusters, names, insights, metadata, texts)

    out_file = CACHE_DIR / "extraction_results.json"
    with open(out_file, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    elapsed = time.time() - total_start

    print()
    print("=" * 62)
    print("  EXTRACTION COMPLETE")
    print("-" * 62)
    print(f"  Concepts:  {output['stats']['total_concepts']:>4}")
    print(f"  Insights:  {output['stats']['total_insights']:>4}")
    print(f"  Total:     {output['stats']['total_articles']:>4} articles to generate")
    print(f"  Time:      {elapsed:.0f}s")
    print(f"  Output:    {out_file}")
    print("=" * 62)
    print()

    # Print concept list
    print("CONCEPTS:")
    for i, concept in enumerate(output["concepts"], 1):
        print(f"  {i:>3}. {concept['title']} ({concept['guest_count']}g, {concept['episode_count']}ep)")
    print()

    if output["insights"]:
        print("INSIGHTS:")
        for i, ins in enumerate(output["insights"], 1):
            print(f"  {i:>3}. {ins['title']} [{ins['signal']}]")
        print()


if __name__ == "__main__":
    main()
