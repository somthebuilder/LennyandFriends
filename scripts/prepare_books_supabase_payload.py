import json
import os
import time
from collections import OrderedDict

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None


INPUT_MD = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/book_recommendations_by_book.md"
BOOKS_JSON = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/tmp_books_payload.json"
RECS_JSON = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/tmp_book_recommendations_payload.json"
CACHE_JSON = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/.cache_gemini_book_summaries.json"

GEMINI_MODEL = "gemini-1.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def is_noise_title(title):
    if not title:
        return True
    tokens = title.split()
    if not tokens:
        return True
    noise_start = {
        "and", "or", "but", "so", "then", "also", "actually", "basically", "maybe",
        "this", "that", "these", "those", "it's", "its", "i", "we", "you", "he", "she", "they",
    }
    if tokens[0].lower() in noise_start:
        return True
    if tokens[-1].lower() in {"a", "an", "the", "of", "and", "in", "to", "for", "on", "with", "by", "from"}:
        return True
    if len(tokens) <= 2 and tokens[-1].endswith("'s"):
        return True
    if len(tokens) == 1:
        single_noise = {
            "actually", "beautiful", "fantastic", "fascinating", "basically", "coming",
            "even", "ever", "every", "everybody", "everything", "anything", "something",
            "great", "good", "nice", "interesting", "amazing", "powerful", "awesome",
            "because", "can't", "done", "have", "maybe", "definitely",
        }
        if tokens[0].lower() in single_noise:
            return True
    return False


def load_cache():
    if not os.path.exists(CACHE_JSON):
        return {}
    with open(CACHE_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def save_cache(cache):
    with open(CACHE_JSON, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def gemini_summary(title, api_key, cache):
    if title in cache:
        return cache[title]
    if not api_key or not requests:
        return None

    prompt = (
        "Provide a concise 1-2 sentence summary of the book below, based on general knowledge. "
        "Do not use podcast transcripts. If unsure, reply with \"Summary not available.\".\n\n"
        f"Book: {title}"
    )

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2},
    }
    resp = requests.post(
        GEMINI_URL,
        params={"key": api_key},
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    try:
        summary = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError):
        summary = "Summary not available."

    cache[title] = summary
    time.sleep(0.2)
    return summary


def parse_book_md(path):
    with open(path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()

    books = OrderedDict()
    current_title = None
    in_recs = False

    for line in lines:
        if line.startswith("## "):
            current_title = line[3:].strip()
            books[current_title] = {
                "title": current_title,
                "genre": None,
                "recommendations": [],
            }
            in_recs = False
            continue
        if current_title is None:
            continue
        if line.startswith("- Genre: "):
            books[current_title]["genre"] = line[len("- Genre: "):].strip()
            continue
        if line.startswith("- Recommended by:"):
            in_recs = True
            continue
        if in_recs and line.startswith("  - ") and " — " in line:
            guest, role = line[4:].split(" — ", 1)
            guest = guest.strip()
            role = role.strip()
            guest_role = None
            guest_company = None
            if role and role != "Role not listed":
                if " at " in role:
                    guest_role, guest_company = role.split(" at ", 1)
                else:
                    guest_role = role
            books[current_title]["recommendations"].append(
                {
                    "guest_name": guest,
                    "guest_role": guest_role,
                    "guest_company": guest_company,
                    "quote": None,
                }
            )
            continue
        if in_recs and line.startswith("    - Quote:"):
            quote = line.split("Quote:", 1)[1].strip()
            quote = quote.strip().strip('"')
            if books[current_title]["recommendations"]:
                books[current_title]["recommendations"][-1]["quote"] = quote
            continue

    return books


def main():
    api_key = os.getenv("GEMINI_API_KEY", "")
    cache = load_cache()

    books = parse_book_md(INPUT_MD)

    books_payload = []
    recs_payload = []

    for title, entry in books.items():
        if is_noise_title(title):
            continue
        summary = gemini_summary(title, api_key, cache) if api_key else None
        books_payload.append(
            {
                "title": title,
                "genre": entry.get("genre"),
                "summary": summary,
                "summary_source": "gemini" if summary else None,
                "summary_generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
        )
        for rec in entry["recommendations"]:
            recs_payload.append(
                {
                    "title": title,
                    "guest_name": rec.get("guest_name"),
                    "guest_role": rec.get("guest_role"),
                    "guest_company": rec.get("guest_company"),
                    "quote": rec.get("quote"),
                    "source_summary": None,
                }
            )

    with open(BOOKS_JSON, "w", encoding="utf-8") as f:
        json.dump(books_payload, f, ensure_ascii=False, indent=2)

    with open(RECS_JSON, "w", encoding="utf-8") as f:
        json.dump(recs_payload, f, ensure_ascii=False, indent=2)

    if api_key:
        save_cache(cache)

    print(f"Wrote {BOOKS_JSON} ({len(books_payload)} books)")
    print(f"Wrote {RECS_JSON} ({len(recs_payload)} recommendations)")
    if not api_key:
        print("GEMINI_API_KEY not set; summaries left null.")


if __name__ == "__main__":
    main()

