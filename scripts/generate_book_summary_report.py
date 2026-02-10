import json
import os
import re
import time
from collections import Counter, OrderedDict, defaultdict

try:
    import requests
except ImportError:  # pragma: no cover - only used when LLM key is available
    requests = None


INPUT_MD = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/book_recommendations_by_guest.md"
OUTPUT_MD = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/book_recommendations_by_book.md"
CACHE_PATH = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/.cache_book_summaries.json"

MODEL = "gpt-4o-mini"
API_URL = "https://api.openai.com/v1/chat/completions"


def load_cache():
    if not os.path.exists(CACHE_PATH):
        return {}
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_cache(cache):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def llm_summary(title, cache, api_key):
    cached = cache.get(title)
    if cached:
        return cached
    if not api_key or not requests:
        return None

    prompt = (
        "Provide a 1-2 sentence neutral summary of the book below, based on general knowledge. "
        "Do not use the podcast episode text. If you're unsure, say \"Summary not available.\""
        f"\n\nBook: {title}"
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are a helpful summarizer."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
    }

    resp = requests.post(API_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    summary = data["choices"][0]["message"]["content"].strip()
    cache[title] = summary
    time.sleep(0.2)
    return summary


def extract_quote(summary):
    if not summary:
        return None
    lower = summary.lower()
    reason_keywords = [
        "because",
        "so that",
        "helped",
        "useful",
        "recommend",
        "love",
        "favorite",
        "changed",
        "taught",
        "clarity",
        "insight",
        "great",
        "impact",
        "learn",
    ]
    if not any(k in lower for k in reason_keywords):
        return None
    sentence = re.split(r"(?<=[.!?])\s+", summary)[0]
    if len(sentence) > 220:
        sentence = sentence[:217].rstrip() + "..."
    return sentence


def is_noise_title(title):
    if not title:
        return True
    tokens = title.split()
    if not tokens:
        return True
    single_word_blocklist = {
        "actually",
        "anyone",
        "someone",
        "everyone",
        "everything",
        "anything",
        "something",
        "maybe",
        "also",
        "then",
        "so",
        "now",
        "just",
        "right",
        "here",
        "there",
        "it",
        "its",
        "but",
        "and",
        "the",
        "a",
        "an",
    }
    if len(tokens) == 1 and tokens[0].lower() in single_word_blocklist:
        return True
    if len(tokens) == 2 and tokens[0].lower() in single_word_blocklist:
        return True
    if tokens[-1].lower() in {"a", "an", "the", "of", "and", "in", "to", "for", "on", "with", "by", "from"}:
        return True
    if tokens[0].isdigit():
        if len(tokens) == 2 and tokens[1].lower().endswith("s"):
            keep = {"weeks", "powers", "rules", "principles", "commitments"}
            if tokens[1].lower() not in keep:
                return True
    return False


def parse_guest_md(path):
    with open(path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()

    books = defaultdict(lambda: {"genres": Counter(), "recommendations": []})

    guest = None
    role = None
    in_books = False
    current_book = None
    current_genre = None
    current_summary = None

    for line in lines:
        if line.startswith("## "):
            guest = line[3:].strip()
            role = None
            in_books = False
            current_book = None
            current_genre = None
            current_summary = None
            continue
        if line.startswith("- Role: "):
            role = line[len("- Role: "):].strip()
            continue
        if line.startswith("- Books:"):
            in_books = line.strip() == "- Books:"
            current_book = None
            continue
        if not in_books:
            continue
        if line.startswith("  - ") and not line.startswith("  - Genre") and not line.startswith("  - Summary"):
            current_book = line[4:].strip()
            if is_noise_title(current_book):
                current_book = None
                continue
            current_genre = None
            current_summary = None
            continue
        if line.startswith("    - Genre:"):
            current_genre = line[len("    - Genre:"):].strip()
            continue
        if line.startswith("    - Summary:"):
            current_summary = line[len("    - Summary:"):].strip()
            if current_book:
                books[current_book]["genres"][current_genre or "Unknown"] += 1
                books[current_book]["recommendations"].append(
                    {"guest": guest, "role": role or "Role not listed", "summary": current_summary}
                )
            continue

    return books


def choose_genre(counter):
    if not counter:
        return "Unknown"
    if len(counter) == 1:
        return next(iter(counter))
    # prefer non-Unknown when available
    if counter.get("Unknown", 0) < sum(counter.values()):
        counter = Counter({k: v for k, v in counter.items() if k != "Unknown"})
    return counter.most_common(1)[0][0]


def write_book_md(books, summaries):
    lines = []
    lines.append("# Book recommendations (by book)")
    lines.append("")
    if not summaries["llm_available"]:
        lines.append("LLM summaries are pending. Set `OPENAI_API_KEY` and rerun `scripts/generate_book_summary_report.py`.")
        lines.append("")

    for title in sorted(books.keys(), key=lambda t: t.lower()):
        entry = books[title]
        genre = choose_genre(entry["genres"])
        summary = summaries["summaries"].get(title) or "Summary pending (LLM required; set OPENAI_API_KEY)."

        lines.append(f"## {title}")
        lines.append(f"- Genre: {genre}")
        lines.append(f"- Summary: {summary}")
        lines.append("- Recommended by:")

        for rec in entry["recommendations"]:
            lines.append(f"  - {rec['guest']} — {rec['role']}")
            quote = extract_quote(rec.get("summary", "")) if rec.get("summary") else None
            if quote:
                lines.append(f"    - Quote: \"{quote}\"")
        lines.append("")

    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines).strip() + "\n")


def main():
    books = parse_guest_md(INPUT_MD)
    api_key = os.getenv("OPENAI_API_KEY", "")
    cache = load_cache()

    summaries = {}
    llm_available = bool(api_key and requests)
    for title in books.keys():
        if llm_available:
            summaries[title] = llm_summary(title, cache, api_key)
        else:
            summaries[title] = None

    if llm_available:
        save_cache(cache)

    write_book_md(books, {"summaries": summaries, "llm_available": llm_available})
    print(f"Wrote {OUTPUT_MD}")


if __name__ == "__main__":
    main()

