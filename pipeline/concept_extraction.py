#!/usr/bin/env python3
"""
Concept & Insight Extraction Pipeline
======================================
Embeddings → Dimensionality Reduction → HDBSCAN → Cluster Analysis → Co-occurrence Graph

Approach (based on principled ML pipeline):
  A. Concepts: Embeddings → HDBSCAN clustering → LLM naming → keyword validation
  B. Insights: Concept co-occurrence graph → contrast/comparison → LLM interpretation

Usage:
  python concept_extraction.py --dry-run                        # Full dataset
  python concept_extraction.py --dry-run --sample 3000          # Quick sample
  python concept_extraction.py --dry-run --min-cluster-size 15  # Tweak params
"""

import argparse
import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np
import requests
from sklearn.cluster import HDBSCAN
from sklearn.decomposition import PCA
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_distances
import networkx as nx
from tabulate import tabulate

# Try UMAP, fall back gracefully
try:
    import umap
    HAS_UMAP = True
except ImportError:
    HAS_UMAP = False

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


def log(msg, end="\n"):
    ts = datetime.utcnow().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", end=end, flush=True)


# ============================================================
# Phase 1: Data Pull with Caching
# ============================================================

def pull_data(min_tokens=30, force_refresh=False):
    """
    Pull all chunk embeddings + metadata from Supabase REST API.
    Caches locally as .npz + .json for fast subsequent runs.

    Returns:
        embeddings: np.ndarray (N, 1536)
        metadata:   list of dicts {id, chunk_id, guest_id, episode_id, token_count}
        texts:      list of strings
    """
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
        log("Pulling from Supabase REST API (first run — will cache)...")
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
            print(f"\r    Pulled {len(all_rows):,} rows...", end="", flush=True)

        print()
        log(f"  Total: {len(all_rows):,} rows")

        # Parse
        texts = [r["text"] for r in all_rows]
        metadata = [
            {k: r[k] for k in ("id", "chunk_id", "guest_id", "episode_id", "token_count")}
            for r in all_rows
        ]

        # Parse embedding vectors (pgvector → numpy)
        dim = None
        embeddings_list = []
        for i, row in enumerate(all_rows):
            emb = row["embedding"]
            if isinstance(emb, str):
                emb = json.loads(emb)
            if dim is None:
                dim = len(emb)
            embeddings_list.append(emb)

        embeddings = np.array(embeddings_list, dtype=np.float32)
        log(f"  Parsed {embeddings.shape[0]:,} × {embeddings.shape[1]}-dim embeddings")

        # Cache
        np.savez_compressed(emb_cache, embeddings=embeddings)
        with open(meta_cache, "w") as f:
            json.dump({"metadata": metadata, "texts": texts}, f)
        log(f"  Cached to {CACHE_DIR}")

    # Apply min_tokens filter on cached data
    if min_tokens > 0:
        mask = [m["token_count"] >= min_tokens for m in metadata]
        if not all(mask):
            n_before = len(metadata)
            embeddings = embeddings[mask]
            metadata = [m for m, keep in zip(metadata, mask) if keep]
            texts = [t for t, keep in zip(texts, mask) if keep]
            log(f"  Filtered: {n_before:,} → {len(metadata):,} (min_tokens={min_tokens})")

    return embeddings, metadata, texts


def sample_data(embeddings, metadata, texts, n):
    """Randomly sample n items (deterministic seed)."""
    rng = np.random.RandomState(42)
    indices = rng.choice(len(embeddings), size=min(n, len(embeddings)), replace=False)
    indices.sort()
    return (
        embeddings[indices],
        [metadata[i] for i in indices],
        [texts[i] for i in indices],
    )


# ============================================================
# Phase 2: Dimensionality Reduction
# ============================================================

def normalize_embeddings(embeddings):
    """
    L2-normalize embeddings. Critical for:
    - Converting cosine similarity to euclidean distance (||a-b||² = 2 - 2·cos(a,b))
    - Preventing numerical overflow in PCA
    - Making HDBSCAN euclidean distance meaningful for text embeddings
    """
    # Check for NaN/inf
    nan_mask = np.isnan(embeddings).any(axis=1) | np.isinf(embeddings).any(axis=1)
    if nan_mask.any():
        log(f"  ⚠ Found {nan_mask.sum()} rows with NaN/inf — replacing with zeros")
        embeddings[nan_mask] = 0.0

    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)  # avoid division by zero
    normalized = embeddings / norms

    log(f"  L2 normalized: norm range [{np.linalg.norm(normalized, axis=1).min():.3f}, "
        f"{np.linalg.norm(normalized, axis=1).max():.3f}]")
    return normalized


def compute_distances(embeddings, method="auto", n_components=50):
    """
    Prepare distance information for HDBSCAN.

    Methods:
    - 'precomputed': Full cosine distance matrix (best quality, O(N²) memory)
    - 'umap': UMAP reduction then euclidean (good quality, low memory)
    - 'pca': PCA reduction then euclidean (fast, lower quality)
    - 'auto': precomputed if N <= 8000, else umap/pca

    Returns:
        data:   distance matrix or reduced embeddings
        metric: 'precomputed' or 'euclidean' (for HDBSCAN)
        method_used: string name
    """
    N = embeddings.shape[0]

    if method == "auto":
        if N <= 8000:
            method = "precomputed"
        elif HAS_UMAP:
            method = "umap"
        else:
            method = "pca"

    if method == "precomputed":
        log(f"  Computing full cosine distance matrix ({N:,}×{N:,})...")
        # For L2-normalized vectors: cosine_dist = 1 - dot(a, b)
        # cosine_distances handles this correctly
        dist_matrix = cosine_distances(embeddings)
        # Ensure symmetry and zero diagonal
        dist_matrix = (dist_matrix + dist_matrix.T) / 2
        np.fill_diagonal(dist_matrix, 0)
        mem_mb = dist_matrix.nbytes / 1024 / 1024
        log(f"  Distance matrix: {N:,}×{N:,} ({mem_mb:.0f} MB)")
        log(f"  Distance stats: min={dist_matrix[dist_matrix > 0].min():.4f}, "
            f"mean={dist_matrix[dist_matrix > 0].mean():.4f}, "
            f"max={dist_matrix.max():.4f}")
        return dist_matrix, "precomputed", "precomputed_cosine"

    elif method == "umap" and HAS_UMAP:
        log(f"  UMAP: {embeddings.shape[1]} → {n_components} dims "
            f"(n_neighbors=15, min_dist=0.0, metric=cosine)")
        reducer = umap.UMAP(
            n_components=n_components,
            n_neighbors=15,
            min_dist=0.0,
            metric="cosine",
            random_state=42,
            low_memory=True,
            verbose=False,
        )
        reduced = reducer.fit_transform(embeddings)
        return reduced, "euclidean", "umap"

    else:
        log(f"  PCA: {embeddings.shape[1]} → {n_components} dims (full SVD)")
        pca = PCA(n_components=n_components, svd_solver="full", random_state=42)
        reduced = pca.fit_transform(embeddings)
        explained = pca.explained_variance_ratio_.sum()
        log(f"  PCA explained variance: {explained:.1%}")
        return reduced, "euclidean", "pca"


# ============================================================
# Phase 3: HDBSCAN Clustering
# ============================================================

def cluster_embeddings(data, metric, min_cluster_size=20, min_samples=10,
                       cluster_selection_method="leaf"):
    """
    HDBSCAN clustering.
    - data: precomputed distance matrix OR reduced embeddings
    - metric: 'precomputed' or 'euclidean'
    - cluster_selection_method: 'eom' (fewer, broader) or 'leaf' (more, granular)
    """
    log(f"  HDBSCAN(min_cluster_size={min_cluster_size}, min_samples={min_samples}, "
        f"method={cluster_selection_method}, metric={metric})")

    clusterer = HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        cluster_selection_method=cluster_selection_method,
        metric=metric,
    )
    labels = clusterer.fit_predict(data)

    n_clusters = len(set(labels) - {-1})
    n_noise = (labels == -1).sum()
    log(f"  Found {n_clusters} clusters, {n_noise} noise points ({n_noise/len(labels):.1%})")

    # Silhouette score
    non_noise = labels != -1
    if n_clusters > 1 and non_noise.sum() > n_clusters:
        try:
            sil_metric = metric if metric == "precomputed" else "euclidean"
            sil_data = data[non_noise][:, non_noise] if metric == "precomputed" else data[non_noise]
            sil = silhouette_score(
                sil_data, labels[non_noise],
                metric=sil_metric,
                sample_size=min(5000, int(non_noise.sum())),
            )
            log(f"  Silhouette score: {sil:.3f} (>0.25 = reasonable, >0.5 = good)")
        except Exception as e:
            log(f"  Silhouette score: failed ({e})")

    return labels, clusterer


# ============================================================
# Phase 4: Cluster Analysis
# ============================================================

def analyze_clusters(embeddings_full, labels, metadata, texts):
    """
    For each cluster:
    - Select representative chunks (nearest to centroid in original embedding space)
    - Extract TF-IDF keywords (discriminative per cluster)
    - Compute metadata statistics (guests, episodes)
    """
    cluster_ids = sorted(set(labels) - {-1})
    clusters = {}

    # Global TF-IDF for keyword contrast (each cluster = one document)
    all_cluster_texts = []
    for cid in cluster_ids:
        mask = labels == cid
        combined = " ".join(texts[i] for i in range(len(texts)) if mask[i])
        all_cluster_texts.append(combined)

    # Fit TF-IDF on cluster-level documents for discriminative keywords
    try:
        tfidf = TfidfVectorizer(
            max_features=3000,
            stop_words="english",
            ngram_range=(1, 2),
            min_df=1,
            max_df=0.7,
        )
        tfidf_matrix = tfidf.fit_transform(all_cluster_texts)
        feature_names = tfidf.get_feature_names_out()
    except Exception as e:
        log(f"  Warning: TF-IDF failed: {e}")
        tfidf_matrix = None
        feature_names = None

    for idx, cid in enumerate(cluster_ids):
        mask = labels == cid
        indices = np.where(mask)[0]

        # Representative selection: use ORIGINAL embeddings (full dim) for centroid
        cluster_embeds = embeddings_full[mask]
        centroid = cluster_embeds.mean(axis=0)
        # Cosine distance to centroid (for normalized vectors)
        centroid_norm = centroid / (np.linalg.norm(centroid) + 1e-10)
        cosine_sims = cluster_embeds @ centroid_norm
        # Most similar to centroid = representative
        rep_local = np.argsort(-cosine_sims)[:10]  # highest similarity first
        rep_global = indices[rep_local]

        # Metadata stats
        guest_ids = sorted(set(metadata[i]["guest_id"] for i in indices))
        episode_ids = sorted(set(metadata[i]["episode_id"] for i in indices))

        # TF-IDF keywords (discriminative for this cluster)
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
            "representatives": [
                {
                    "text": texts[rep_global[j]][:300],
                    "guest_id": metadata[rep_global[j]]["guest_id"],
                    "episode_id": metadata[rep_global[j]]["episode_id"],
                    "similarity": float(cosine_sims[rep_local[j]]),
                }
                for j in range(min(10, len(rep_local)))
            ],
        }

    return clusters


# ============================================================
# Phase 4b: Cluster Classification & Relevance Scoring
# ============================================================

# Keywords that indicate tech-product relevance domains
RELEVANCE_DOMAINS = {
    "product": {
        "keywords": {"product", "pm", "pms", "product manager", "roadmap", "feature", "ship",
                     "mvp", "product strategy", "user", "customer", "ux", "design", "figma",
                     "prototype", "backlog", "sprint", "okr", "okrs", "north star", "metric",
                     "activation", "retention", "onboarding", "churn", "engagement"},
        "weight": 1.0,
    },
    "growth": {
        "keywords": {"growth", "acquisition", "retention", "conversion", "funnel", "seo",
                     "paid", "performance marketing", "virality", "referral", "network effect",
                     "marketplace", "supply", "demand", "gmv", "plg", "product led",
                     "freemium", "free trial", "experiment", "ab test", "experiment"},
        "weight": 1.0,
    },
    "startup": {
        "keywords": {"startup", "founder", "fundraising", "pitch", "yc", "venture", "seed",
                     "series", "pivot", "product market fit", "market fit", "pmf", "chasm",
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

# Keywords that identify lightning round / recommendation segments
LIGHTNING_ROUND_SIGNALS = {
    "book", "books", "favorite", "recommend", "motto", "lightning",
    "movie", "interview question", "podcast", "habit", "life lesson",
    "sci fi", "fiction", "nonfiction",
}

# Keywords that indicate structural noise (Lenny intros, timestamps, boilerplate)
NOISE_SIGNALS = {
    "rachitsky 01", "rachitsky 00", "lenny rachitsky", "lenny 01",
    "00 05", "00 07", "00 00", "00 59",
}


def classify_clusters(clusters):
    """
    Classify each cluster into:
      - category: primary domain (product, growth, startup, leadership, etc.)
      - subcategory: 'lightning_round', 'topical', 'case_study', 'meta'
      - relevance_score: 0-1, how relevant to tech product builders
      - keep: whether to include in final output

    IMPORTANT: Lightning round clusters are NOT noise — they contain valuable
    signals (book recommendations, life advice, hiring wisdom) that the
    tech-product audience cares about.
    """
    classified = {}

    for cid, c in clusters.items():
        kw_set = set(c["keywords"][:15])
        kw_text = " ".join(c["keywords"][:15]).lower()
        all_text = " ".join(r.get("text", "")[:200].lower() for r in c.get("representatives", []))

        # 1. Check for structural noise (Lenny intros, timestamps only)
        noise_matches = len(kw_set & NOISE_SIGNALS)
        # Only mark as noise if MOST top keywords are timestamps/intros AND no real content
        real_keywords = [k for k in c["keywords"][:8]
                        if not any(n in k for n in ("rachitsky", "lenny", "00 ", "01 "))]
        is_pure_noise = noise_matches >= 3 and len(real_keywords) <= 1

        # 2. Check if lightning round content
        lr_matches = len(kw_set & LIGHTNING_ROUND_SIGNALS)
        has_lr_content = (lr_matches >= 2 or
                         "lightning" in kw_text or
                         "favorite" in kw_text or
                         ("book" in kw_text and "recommend" in all_text) or
                         "motto" in kw_text or
                         "interview question" in kw_text)

        # 3. Score relevance across all domains
        domain_scores = {}
        for domain, info in RELEVANCE_DOMAINS.items():
            matches = sum(1 for kw in info["keywords"]
                         if kw in kw_text or kw in all_text)
            domain_scores[domain] = matches * info["weight"]

        best_domain = max(domain_scores, key=domain_scores.get) if domain_scores else "other"
        best_score = domain_scores.get(best_domain, 0)

        # Normalize relevance to 0-1 (most concepts match 1-5 keywords)
        relevance = min(1.0, best_score / 3.0)

        # Boost for multi-guest clusters (concepts that span many voices are more valuable)
        guest_boost = min(0.2, c["n_guests"] / 50.0)
        relevance = min(1.0, relevance + guest_boost)

        # 4. Determine subcategory
        if is_pure_noise:
            subcategory = "noise"
            relevance = 0.0
        elif has_lr_content:
            subcategory = "lightning_round"
            # Lightning round content IS relevant — book recs, life advice, product recs
            relevance = max(relevance, 0.5)
        elif c["n_guests"] <= 2:
            subcategory = "case_study"  # Deep dive into one guest's story
            relevance = max(relevance, 0.3)
        else:
            subcategory = "topical"  # Standard cross-guest concept

        # 5. Decide whether to keep
        #    Keep if: relevance >= 0.3 AND (3+ guests OR lightning round)
        keep = (relevance >= 0.3 and
                (c["n_guests"] >= 3 or subcategory == "lightning_round"))

        classified[cid] = {
            **c,
            "category": best_domain,
            "subcategory": subcategory,
            "relevance_score": round(relevance, 3),
            "keep": keep,
            "domain_scores": {k: round(v, 2) for k, v in sorted(
                domain_scores.items(), key=lambda x: -x[1])[:3]},
        }

    return classified


# ============================================================
# Phase 5: Co-occurrence Graph
# ============================================================

def build_cooccurrence_graph(metadata, labels, clusters):
    """
    Build a weighted graph where:
    - Nodes = clusters (concepts)
    - Edges = number of shared episodes between two concepts
    """
    cluster_ids = sorted(set(labels) - {-1})

    # Map: episode → set of clusters
    episode_clusters = defaultdict(set)
    for i, m in enumerate(metadata):
        if labels[i] != -1:
            episode_clusters[m["episode_id"]].add(int(labels[i]))

    # Also: guest → set of clusters
    guest_clusters = defaultdict(set)
    for i, m in enumerate(metadata):
        if labels[i] != -1:
            guest_clusters[m["guest_id"]].add(int(labels[i]))

    G = nx.Graph()
    for cid in cluster_ids:
        G.add_node(cid, size=clusters[cid]["size"], guests=clusters[cid]["n_guests"])

    for episode, ep_clusters in episode_clusters.items():
        ep_list = sorted(ep_clusters)
        for i, c1 in enumerate(ep_list):
            for c2 in ep_list[i + 1:]:
                if G.has_edge(c1, c2):
                    G[c1][c2]["weight"] += 1
                else:
                    G.add_edge(c1, c2, weight=1)

    return G, episode_clusters, guest_clusters


# ============================================================
# Phase 6: Temporal Analysis
# ============================================================

def temporal_analysis(metadata, labels, clusters):
    """
    Analyze how concept (cluster) frequency distributes across episodes.
    Since we don't have episode dates in chunk_embeddings, we use episode_id
    distribution as a proxy for breadth.
    """
    cluster_ids = sorted(set(labels) - {-1})
    temporal = {}

    for cid in cluster_ids:
        mask = labels == cid
        indices = np.where(mask)[0]
        episode_counts = Counter(metadata[i]["episode_id"] for i in indices)

        temporal[cid] = {
            "total_episodes": len(episode_counts),
            "chunks_per_episode": {
                "mean": np.mean(list(episode_counts.values())),
                "max": max(episode_counts.values()),
                "min": min(episode_counts.values()),
            },
            "top_episodes": episode_counts.most_common(5),
        }

    return temporal


# ============================================================
# Report Generation
# ============================================================

def print_report(clusters, graph, episode_clusters, guest_clusters, labels,
                 metadata, texts, temporal, params):
    """Comprehensive dry-run analysis report."""
    cluster_ids = sorted(clusters.keys())
    noise_count = int((labels == -1).sum())
    total = len(labels)

    print("\n" + "═" * 72)
    print("  CONCEPT EXTRACTION PIPELINE — DRY RUN REPORT")
    print("═" * 72)

    # ── Overview ──
    unique_guests = len(set(m["guest_id"] for m in metadata))
    unique_episodes = len(set(m["episode_id"] for m in metadata))

    print(f"\n{'─' * 72}")
    print("  📊 DATA SUMMARY")
    print(f"{'─' * 72}")
    overview = [
        ["Chunks analyzed", f"{total:,}"],
        ["Unique guests", f"{unique_guests:,}"],
        ["Unique episodes", f"{unique_episodes:,}"],
        ["Embedding dim", "1,536"],
        ["Min tokens filter", str(params.get("min_tokens", 30))],
        ["Sample", params.get("sample", "all")],
    ]
    print(tabulate(overview, tablefmt="simple"))

    # ── Pipeline params ──
    print(f"\n{'─' * 72}")
    print("  ⚙️  PIPELINE PARAMETERS")
    print(f"{'─' * 72}")
    param_table = [
        ["Dim reduction", params.get("reduction_method", "pca")],
        ["Reduced dims", str(params.get("n_components", 30))],
        ["HDBSCAN min_cluster_size", str(params.get("min_cluster_size", 20))],
        ["HDBSCAN min_samples", str(params.get("min_samples", 10))],
        ["HDBSCAN method", "eom (Excess of Mass)"],
    ]
    print(tabulate(param_table, tablefmt="simple"))

    # ── Clustering overview ──
    print(f"\n{'─' * 72}")
    print("  🔬 HDBSCAN CLUSTERING RESULTS")
    print(f"{'─' * 72}")

    sizes = [clusters[c]["size"] for c in cluster_ids]
    guests_per = [clusters[c]["n_guests"] for c in cluster_ids]
    episodes_per = [clusters[c]["n_episodes"] for c in cluster_ids]

    stats = [
        ["Clusters found", len(cluster_ids)],
        ["Noise points", f"{noise_count:,} ({noise_count/total:.1%})"],
        ["Clustered points", f"{total - noise_count:,} ({(total-noise_count)/total:.1%})"],
    ]
    if sizes:
        stats.extend([
            ["Cluster size (min/mean/median/max)",
             f"{min(sizes)}/{np.mean(sizes):.0f}/{np.median(sizes):.0f}/{max(sizes)}"],
            ["Guests per cluster (min/mean/max)",
             f"{min(guests_per)}/{np.mean(guests_per):.0f}/{max(guests_per)}"],
            ["Episodes per cluster (min/mean/max)",
             f"{min(episodes_per)}/{np.mean(episodes_per):.0f}/{max(episodes_per)}"],
        ])
    print(tabulate(stats, tablefmt="simple"))

    # ── Classification summary ──
    print(f"\n{'─' * 72}")
    print("  🏷️  CLUSTER CLASSIFICATION & RELEVANCE")
    print(f"{'─' * 72}")

    by_subcategory = Counter(clusters[c].get("subcategory", "?") for c in cluster_ids)
    by_category = Counter(clusters[c].get("category", "?") for c in cluster_ids if clusters[c].get("keep"))
    kept_ids = [c for c in cluster_ids if clusters[c].get("keep")]
    dropped_ids = [c for c in cluster_ids if not clusters[c].get("keep")]

    class_table = [
        ["Total clusters", len(cluster_ids)],
        ["Kept (relevant, 3+ guests or LR)", len(kept_ids)],
        ["Dropped (noise / irrelevant / solo-guest)", len(dropped_ids)],
    ]
    for sub, cnt in sorted(by_subcategory.items()):
        kept_in = sum(1 for c in cluster_ids if clusters[c].get("subcategory") == sub and clusters[c].get("keep"))
        class_table.append([f"  └ {sub}", f"{cnt} ({kept_in} kept)"])
    print(tabulate(class_table, tablefmt="simple"))

    print(f"\n  Domain breakdown (kept concepts):")
    for dom, cnt in by_category.most_common():
        print(f"    {dom:20s} {cnt:>3} concepts")

    # Lightning round concepts (these are signal, not noise!)
    lr_clusters = [c for c in cluster_ids
                   if clusters[c].get("subcategory") == "lightning_round" and clusters[c].get("keep")]
    if lr_clusters:
        print(f"\n  ⚡ Lightning Round Concepts ({len(lr_clusters)} found):")
        for cid in lr_clusters:
            c = clusters[cid]
            kw = ", ".join(c["keywords"][:5])
            print(f"    C{cid:>3} | {c['n_guests']:>3}g | {c['n_episodes']:>3}ep | rel={c.get('relevance_score', 0):.2f} | {kw}")
        print(f"    → These contain book recs, life advice, product favorites — valuable for audience!")

    # ── Cluster size distribution (bar chart) ──
    if sizes:
        max_bar = 50
        max_size = max(sizes)
        print(f"\n  Cluster Size Distribution (✓=kept, ✗=dropped):")
        for cid in cluster_ids:
            c = clusters[cid]
            bar_len = int(c["size"] / max_size * max_bar)
            bar = "█" * bar_len
            kw = ", ".join(c["keywords"][:3])
            status = "✓" if c.get("keep") else "✗"
            rel = c.get("relevance_score", 0)
            print(f"    {status} C{cid:>3} │{bar} {c['size']:>4} │ {c['n_guests']:>2}g │ r={rel:.1f} │ {kw}")

    # ── Detailed cluster analysis ──
    print(f"\n{'─' * 72}")
    print("  📋 CLUSTER DETAILS (potential concepts)")
    print(f"{'─' * 72}")

    for cid in cluster_ids:
        c = clusters[cid]
        status = "✓ KEEP" if c.get("keep") else "✗ DROP"
        cat = c.get("category", "?")
        sub = c.get("subcategory", "?")
        rel = c.get("relevance_score", 0)
        print(f"\n  ┌─ Cluster {cid} [{status}] ───────────────────────────────────────┐")
        print(f"  │ {c['size']} chunks | {c['n_guests']} guests | {c['n_episodes']} episodes")
        print(f"  │ Category: {cat} | Type: {sub} | Relevance: {rel:.2f}")
        print(f"  │ Keywords: {', '.join(c['keywords'][:8])}")
        print(f"  │ Top guests: {', '.join(c.get('guest_ids', c.get('top_guests', []))[:5])}")
        print(f"  │")
        print(f"  │ Representative chunks (most central to cluster):")
        for j, rep in enumerate(c["representatives"][:3]):
            text_preview = rep["text"][:150].replace("\n", " ").strip()
            sim = rep.get("similarity", rep.get("distance", 0))
            print(f"  │   {j+1}. \"{text_preview}...\"")
            print(f"  │      — {rep['guest_id']} ({rep.get('episode_id', '?')}) [sim={sim:.3f}]")
        print(f"  └{'─' * 60}┘")

    # ── Co-occurrence ──
    if graph and graph.edges():
        print(f"\n{'─' * 72}")
        print("  🔗 CO-OCCURRENCE ANALYSIS (concepts appearing in same episodes)")
        print(f"{'─' * 72}")

        edges = sorted(graph.edges(data=True), key=lambda x: x[2]["weight"], reverse=True)
        print(f"\n  Top concept pairs (by shared episodes):")
        cooc_table = []
        for c1, c2, data in edges[:15]:
            kw1 = ", ".join(clusters.get(c1, {}).get("keywords", [])[:2])
            kw2 = ", ".join(clusters.get(c2, {}).get("keywords", [])[:2])
            cooc_table.append([f"C{c1} ({kw1})", "↔", f"C{c2} ({kw2})", data["weight"]])
        print(tabulate(cooc_table, headers=["Concept A", "", "Concept B", "Shared Eps"], tablefmt="simple"))

        # Centrality (most connected concepts)
        centrality = nx.degree_centrality(graph)
        if centrality:
            print(f"\n  Most central concepts (connected to many others):")
            top_central = sorted(centrality.items(), key=lambda x: x[1], reverse=True)[:10]
            cent_table = []
            for cid, cent in top_central:
                kw = ", ".join(clusters.get(cid, {}).get("keywords", [])[:3])
                cent_table.append([f"C{cid}", kw, f"{cent:.3f}"])
            print(tabulate(cent_table, headers=["Cluster", "Keywords", "Centrality"], tablefmt="simple"))

        # Community detection (insight candidates)
        try:
            communities = list(nx.community.greedy_modularity_communities(graph))
            if communities:
                print(f"\n  Communities detected (groups of related concepts):")
                for i, comm in enumerate(communities[:5]):
                    members = []
                    for cid in sorted(comm):
                        kw = ", ".join(clusters.get(cid, {}).get("keywords", [])[:2])
                        members.append(f"C{cid}({kw})")
                    print(f"    Community {i+1}: {' | '.join(members)}")
        except Exception:
            pass

    # ── Comparison with existing ──
    print(f"\n{'─' * 72}")
    print("  📊 COMPARISON: HDBSCAN CLUSTERS vs EXISTING LLM CONCEPTS")
    print(f"{'─' * 72}")

    existing_concepts = [
        "Clear Messaging in Fundraising",
        "Embedding Data Scientists",
        "Network Effects in Platform Success",
        "Leadership: Liked vs Respected",
        "$10 Game for Prioritization",
        "Authenticity Drives User Engagement",
        "Empathy in Storytelling",
        "Context Over Control",
        "Feedback and Iteration",
        "Procrastination in Strategic Work",
        "Category Leadership",
        "Mental Resilience",
        "Asking for Help",
        "Strategic Focus in PM",
        "Product Operations",
        "AI Product Development",
        "Customer Conversations",
        "Culture and Hiring",
        "Founder-Led Sales",
        "Marketplace Supply and Demand",
    ]

    n_kept = len([c for c in cluster_ids if clusters[c].get("keep")])
    n_lr = len([c for c in cluster_ids
                if clusters[c].get("subcategory") == "lightning_round" and clusters[c].get("keep")])
    n_topical = len([c for c in cluster_ids
                     if clusters[c].get("subcategory") == "topical" and clusters[c].get("keep")])
    n_case = len([c for c in cluster_ids
                  if clusters[c].get("subcategory") == "case_study" and clusters[c].get("keep")])

    comp_table = [
        ["HDBSCAN raw clusters", len(cluster_ids)],
        ["  → Kept (pass relevance filter)", n_kept],
        ["     ├ Topical concepts", n_topical],
        ["     ├ Lightning round concepts", n_lr],
        ["     └ Case studies", n_case],
        ["  → Dropped", len(cluster_ids) - n_kept],
        ["Existing LLM concepts", len(existing_concepts)],
        ["HDBSCAN noise %", f"{noise_count/total:.1%}"],
        ["Avg guests per kept cluster", f"{np.mean([clusters[c]['n_guests'] for c in cluster_ids if clusters[c].get('keep')]):.1f}" if n_kept else "N/A"],
        ["Avg episodes per kept cluster", f"{np.mean([clusters[c]['n_episodes'] for c in cluster_ids if clusters[c].get('keep')]):.1f}" if n_kept else "N/A"],
    ]
    print(tabulate(comp_table, tablefmt="simple"))

    # ── Estimated insight yield ──
    # Insights come from co-occurrence pairs between KEPT concepts
    if graph:
        kept_set = set(c for c in cluster_ids if clusters[c].get("keep"))
        kept_edges = [(u, v, d) for u, v, d in graph.edges(data=True)
                      if u in kept_set and v in kept_set and d["weight"] >= 3]
        strong_edges = [e for e in kept_edges if e[2]["weight"] >= 5]

        print(f"\n  📈 ESTIMATED OUTPUT")
        est_table = [
            ["Concepts (after LLM naming ~10% fail)", f"~{int(n_kept * 0.9)}-{n_kept}"],
            ["  ├ Topical concepts", f"~{int(n_topical * 0.9)}-{n_topical}"],
            ["  ├ Lightning round concepts", f"~{n_lr}"],
            ["  └ Case studies", f"~{int(n_case * 0.9)}-{n_case}"],
            ["Co-occurrence pairs (3+ shared eps)", len(kept_edges)],
            ["Strong pairs (5+ shared eps)", len(strong_edges)],
            ["Estimated insights (30-40% of pairs)", f"~{int(len(kept_edges) * 0.3)}-{int(len(kept_edges) * 0.4)}"],
            ["Total articles (concepts + insights)", f"~{int(n_kept * 0.9 + len(kept_edges) * 0.3)}-{n_kept + int(len(kept_edges) * 0.4)}"],
        ]
        print(tabulate(est_table, tablefmt="simple"))

    verdict = (
        "MORE granular" if n_kept > 25
        else "SIMILAR granularity" if n_kept >= 15
        else "FEWER, broader" if n_kept >= 8
        else "VERY FEW — consider lowering min_cluster_size"
    )
    print(f"\n  → {n_kept} validated concepts vs 20 LLM concepts: {verdict}")
    if noise_count / total > 0.3:
        print(f"  ⚠ High noise ({noise_count/total:.0%}) — consider lowering min_cluster_size or min_samples")
    if noise_count / total < 0.05:
        print(f"  ⚠ Very low noise ({noise_count/total:.0%}) — clusters may be too loose, consider raising min_samples")

    # ── Recommendations ──
    print(f"\n{'─' * 72}")
    print("  💡 RECOMMENDATIONS FOR NEXT STEPS")
    print(f"{'─' * 72}")
    recs = []
    if not HAS_UMAP:
        recs.append("Install umap-learn for better cluster quality (PCA was used as fallback)")
    if noise_count / total > 0.3:
        recs.append(f"Lower min_cluster_size (current: {params.get('min_cluster_size')}) to capture more concepts")
    if noise_count / total < 0.05:
        recs.append(f"Raise min_samples (current: {params.get('min_samples')}) for tighter clusters")
    if len(cluster_ids) < 10:
        recs.append("Try lower min_cluster_size (10-15) for more granular concepts")
    if len(cluster_ids) > 50:
        recs.append("Try higher min_cluster_size (30-50) to consolidate concepts")
    if params.get("sample"):
        recs.append(f"Re-run without --sample for full dataset ({params.get('total_available', '~12K')} chunks)")
    recs.append("After tuning: add LLM naming step to auto-label each cluster")
    recs.append("Build insight extraction from co-occurrence graph communities")

    for i, rec in enumerate(recs, 1):
        print(f"  {i}. {rec}")

    print(f"\n{'═' * 72}")


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Concept Extraction Pipeline: Embeddings → HDBSCAN → Analysis",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--dry-run", action="store_true", default=True,
                        help="Dry run — analysis only, no DB writes (default: True)")
    parser.add_argument("--sample", type=int, default=None,
                        help="Random sample N chunks (default: use all)")
    parser.add_argument("--min-tokens", type=int, default=30,
                        help="Exclude chunks with fewer tokens (default: 30)")
    parser.add_argument("--min-cluster-size", type=int, default=20,
                        help="HDBSCAN min_cluster_size (default: 20)")
    parser.add_argument("--min-samples", type=int, default=10,
                        help="HDBSCAN min_samples (default: 10)")
    parser.add_argument("--cluster-method", choices=["eom", "leaf"], default="leaf",
                        help="HDBSCAN selection: eom (fewer, broader) or leaf (more, granular) (default: leaf)")
    parser.add_argument("--n-components", type=int, default=30,
                        help="Dimensionality reduction target (default: 30)")
    parser.add_argument("--reduction", choices=["auto", "precomputed", "umap", "pca"],
                        default="auto",
                        help="Distance method: precomputed (cosine), umap, pca (default: auto)")
    parser.add_argument("--force-refresh", action="store_true",
                        help="Force re-pull from API (ignore cache)")
    args = parser.parse_args()

    print("╔════════════════════════════════════════════════════════════════════╗")
    print("║  CONCEPT EXTRACTION PIPELINE                                      ║")
    print("║  Embeddings → Dim Reduction → HDBSCAN → Cluster Analysis          ║")
    print("╚════════════════════════════════════════════════════════════════════╝")
    print()

    # ── Phase 1: Pull data ──
    log("[1/6] Pulling embeddings...")
    t0 = time.time()
    embeddings, metadata, texts = pull_data(
        min_tokens=args.min_tokens,
        force_refresh=args.force_refresh,
    )
    total_available = len(embeddings)
    log(f"  Total available: {total_available:,} chunks × {embeddings.shape[1]} dims ({time.time()-t0:.1f}s)")

    if args.sample and args.sample < total_available:
        log(f"  Sampling {args.sample:,} of {total_available:,} chunks...")
        embeddings, metadata, texts = sample_data(embeddings, metadata, texts, args.sample)
        # Scale min_cluster_size proportionally
        scale = args.sample / total_available
        effective_mcs = max(5, int(args.min_cluster_size * scale))
        effective_ms = max(3, int(args.min_samples * scale))
        log(f"  Scaled params: min_cluster_size {args.min_cluster_size}→{effective_mcs}, "
            f"min_samples {args.min_samples}→{effective_ms}")
    else:
        effective_mcs = args.min_cluster_size
        effective_ms = args.min_samples

    log(f"  Working set: {len(embeddings):,} chunks, "
        f"{len(set(m['guest_id'] for m in metadata)):,} guests, "
        f"{len(set(m['episode_id'] for m in metadata)):,} episodes")

    # ── Phase 1b: Normalize embeddings ──
    log(f"\n[1b/6] Normalizing embeddings (L2)...")
    embeddings = normalize_embeddings(embeddings.copy())

    # ── Phase 2: Compute distances / reduce dimensions ──
    log(f"\n[2/6] Computing distances...")
    t0 = time.time()
    data, hdbscan_metric, distance_method = compute_distances(
        embeddings, method=args.reduction, n_components=args.n_components,
    )
    log(f"  Done ({time.time()-t0:.1f}s) — method: {distance_method}")

    # ── Phase 3: HDBSCAN clustering ──
    log(f"\n[3/6] HDBSCAN clustering...")
    t0 = time.time()
    labels, clusterer = cluster_embeddings(
        data, hdbscan_metric,
        min_cluster_size=effective_mcs, min_samples=effective_ms,
        cluster_selection_method=args.cluster_method,
    )
    log(f"  Done ({time.time()-t0:.1f}s)")

    # ── Phase 4: Cluster analysis ──
    log(f"\n[4/6] Analyzing clusters...")
    t0 = time.time()
    clusters = analyze_clusters(embeddings, labels, metadata, texts)
    log(f"  Done ({time.time()-t0:.1f}s)")

    # ── Phase 4b: Classification & relevance ──
    log(f"\n[4b/7] Classifying clusters & scoring relevance...")
    t0 = time.time()
    clusters = classify_clusters(clusters)
    kept = {k: v for k, v in clusters.items() if v["keep"]}
    dropped = {k: v for k, v in clusters.items() if not v["keep"]}
    log(f"  Classified: {len(kept)} kept, {len(dropped)} dropped")
    by_sub = Counter(v["subcategory"] for v in clusters.values())
    for sub, cnt in by_sub.most_common():
        kept_in_sub = sum(1 for v in clusters.values() if v["subcategory"] == sub and v["keep"])
        log(f"    {sub}: {cnt} total, {kept_in_sub} kept")
    log(f"  Done ({time.time()-t0:.1f}s)")

    # ── Phase 5: Co-occurrence graph ──
    log(f"\n[5/7] Building co-occurrence graph...")
    t0 = time.time()
    graph, episode_clusters, guest_clusters = build_cooccurrence_graph(
        metadata, labels, clusters,
    )
    log(f"  Done: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges ({time.time()-t0:.1f}s)")

    # ── Phase 6: Temporal analysis ──
    log(f"\n[6/7] Temporal analysis...")
    t0 = time.time()
    temporal = temporal_analysis(metadata, labels, clusters)
    log(f"  Done ({time.time()-t0:.1f}s)")

    # ── Report ──
    params = {
        "sample": args.sample,
        "total_available": total_available,
        "min_tokens": args.min_tokens,
        "min_cluster_size": effective_mcs,
        "min_samples": effective_ms,
        "n_components": args.n_components,
        "reduction_method": distance_method,
    }
    print_report(
        clusters, graph, episode_clusters, guest_clusters,
        labels, metadata, texts, temporal, params,
    )

    # ── Save results ──
    results_file = CACHE_DIR / "dry_run_results.json"
    results = {
        "timestamp": datetime.utcnow().isoformat(),
        "params": params,
        "stats": {
            "total_chunks": len(embeddings),
            "clusters": len(clusters),
            "noise": int((labels == -1).sum()),
            "noise_pct": float((labels == -1).sum() / len(labels)),
        },
        "clusters": {
            str(k): {
                "size": v["size"],
                "n_guests": v["n_guests"],
                "n_episodes": v["n_episodes"],
                "keywords": v["keywords"][:10],
                "top_guests": v.get("guest_ids", v.get("top_guests", []))[:10],
                "category": v.get("category", "unknown"),
                "subcategory": v.get("subcategory", "unknown"),
                "relevance_score": v.get("relevance_score", 0),
                "keep": v.get("keep", False),
                "representatives": [
                    {"text": r["text"][:200], "guest_id": r["guest_id"]}
                    for r in v["representatives"][:5]
                ],
            }
            for k, v in clusters.items()
        },
    }
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)
    log(f"\nResults saved to: {results_file}")


if __name__ == "__main__":
    main()

