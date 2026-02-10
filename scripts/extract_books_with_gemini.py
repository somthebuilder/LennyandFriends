import json
import os
import time
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None

try:
    from google import genai as genai_sdk
except ImportError:  # pragma: no cover
    genai_sdk = None

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover
    tqdm = None


INPUT_JSON = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/tmp_lightning_books.json"
BOOKS_JSON = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/tmp_books_payload.json"
RECS_JSON = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/tmp_book_recommendations_payload.json"
SUMMARY_CACHE = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/.cache_gemini_book_summaries.json"
ENRICHMENT_CACHE = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/.cache_gemini_book_enrichment.json"
EXTRACTION_CACHE = "/Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/.cache_gemini_book_extraction.json"

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def load_cache(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_cache(path, cache):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


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
            "because", "can't", "done", "have", "maybe", "definitely", "okay", "what",
            "lenny", "i've", "i'll", "from", "if",
        }
        if tokens[0].lower() in single_noise:
            return True
    return False


def _vertex_config():
    project = os.getenv("VERTEX_PROJECT_ID")
    location = os.getenv("VERTEX_LOCATION")
    if not project:
        raise ValueError("VERTEX_PROJECT_ID must be set for Vertex AI usage.")
    if not location:
        raise ValueError("VERTEX_LOCATION must be set for Vertex AI usage.")
    return project, location


def gemini_call(api_key, prompt, use_adc=False):
    if use_adc and genai_sdk:
        try:
            project, location = _vertex_config()
            client = genai_sdk.Client(vertexai=True, project=project, location=location)
            model_name = GEMINI_MODEL
            if "/" not in model_name:
                model_name = f"publishers/google/models/{model_name}"
            resp = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config={"temperature": 0.2},
            )
            return (resp.text or "").strip()
        except Exception:
            return None

    if not api_key or not requests:
        return None
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
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError):
        return None


def _extract_json(raw):
    if not raw:
        return ""
    if "```" in raw:
        start = raw.find("```json")
        if start != -1:
            start += len("```json")
        else:
            start = raw.find("```") + len("```")
        end = raw.find("```", start)
        if end != -1:
            return raw[start:end].strip()
    arr_start = raw.find("[")
    arr_end = raw.rfind("]") + 1
    if arr_start != -1 and arr_end > arr_start:
        return raw[arr_start:arr_end]
    obj_start = raw.find("{")
    obj_end = raw.rfind("}") + 1
    if obj_start != -1 and obj_end > obj_start:
        return raw[obj_start:obj_end]
    return raw.strip()


def extract_books(api_key, cache, text, use_adc=False):
    if text in cache:
        return cache[text]
    prompt = (
        "Extract book recommendations from the text below. "
        "Return a JSON array of objects with keys: "
        "\"title\" (string, the book title only), "
        "\"author\" (string, if known or mentioned, else null), "
        "\"reason\" (string, short reason if present, else null), "
        "\"is_book\" (boolean; false if not actually a book). "
        "Do not include authors or publishers as titles. "
        "Return JSON only.\n\n"
        f"Text:\n{text}"
    )
    raw = gemini_call(api_key, prompt, use_adc=use_adc)
    if not raw:
        return []
    try:
        data = json.loads(_extract_json(raw))
    except json.JSONDecodeError:
        data = []
    cache[text] = data
    time.sleep(0.2)
    return data


def enrich_book(api_key, cache, title, use_adc=False):
    cached = cache.get(title)
    if isinstance(cached, dict):
        return cached
    if isinstance(cached, str):
        return {"author": None, "summary": cached}
    prompt = (
        "Provide details for the book below using general knowledge. "
        "Return JSON with keys: "
        "\"author\" (string or null), "
        "\"summary\" (1-2 sentences, or \"Summary not available.\"). "
        "Return JSON only.\n\n"
        f"Book: {title}"
    )
    raw = gemini_call(api_key, prompt, use_adc=use_adc)
    summary = "Summary not available."
    author = None
    if raw:
        try:
            data = json.loads(_extract_json(raw))
            author = data.get("author")
            summary = data.get("summary") or summary
        except (json.JSONDecodeError, AttributeError):
            summary = raw
    cache[title] = {"author": author, "summary": summary}
    time.sleep(0.2)
    return cache[title]


def main():
    env_path = Path(__file__).resolve().parents[1] / ".env"
    load_dotenv(dotenv_path=env_path)
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
    use_adc = os.getenv("USE_ADC", "").strip().lower() in {"1", "true", "yes"}
    if not api_key and not use_adc:
        print("GEMINI_API_KEY/GOOGLE_API_KEY not set and USE_ADC not enabled; cannot run extraction.")
        return

    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        entries = json.load(f)

    extraction_cache = load_cache(EXTRACTION_CACHE)
    summary_cache = load_cache(ENRICHMENT_CACHE)

    books = {}
    recs = []

    total_entries = len(entries)
    print(f"Processing {total_entries} lightning-round entries...")
    entry_iter = tqdm(entries, desc="Extracting books", unit="entry") if tqdm else entries

    for idx, entry in enumerate(entry_iter, 1):
        guest_name = entry.get("guest_name")
        guest_role = entry.get("current_role")
        guest_company = entry.get("current_company")
        text = entry.get("books") or ""
        if not text.strip():
            continue

        extracted = extract_books(api_key, extraction_cache, text, use_adc=use_adc)
        for item in extracted:
            if item.get("is_book") is False:
                continue
            title = (item.get("title") or "").strip()
            if not title or is_noise_title(title):
                continue
            reason = item.get("reason")
            author = item.get("author")

            if title not in books:
                books[title] = {
                    "title": title,
                    "author": author,
                    "genre": None,
                    "summary": None,
                    "summary_source": "gemini",
                    "summary_generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            elif author and not books[title].get("author"):
                books[title]["author"] = author

            recs.append(
                {
                    "title": title,
                    "guest_name": guest_name,
                    "guest_role": guest_role,
                    "guest_company": guest_company,
                    "quote": reason,
                    "source_summary": text,
                }
            )

        if not tqdm and (idx % 25 == 0 or idx == total_entries):
            print(f"Processed {idx}/{total_entries} entries")

    book_items = list(books.items())
    total_books = len(book_items)
    print(f"Enriching {total_books} books with author/summary...")
    book_iter = tqdm(book_items, desc="Enriching books", unit="book") if tqdm else book_items

    for idx, (title, item) in enumerate(book_iter, 1):
        enriched = enrich_book(api_key, summary_cache, title, use_adc=use_adc)
        item["summary"] = enriched.get("summary")
        if enriched.get("author") and not item.get("author"):
            item["author"] = enriched.get("author")

        if not tqdm and (idx % 50 == 0 or idx == total_books):
            print(f"Enriched {idx}/{total_books} books")

    save_cache(EXTRACTION_CACHE, extraction_cache)
    save_cache(ENRICHMENT_CACHE, summary_cache)

    with open(BOOKS_JSON, "w", encoding="utf-8") as f:
        json.dump(list(books.values()), f, ensure_ascii=False, indent=2)

    with open(RECS_JSON, "w", encoding="utf-8") as f:
        json.dump(recs, f, ensure_ascii=False, indent=2)

    print(f"Wrote {BOOKS_JSON} ({len(books)} books)")
    print(f"Wrote {RECS_JSON} ({len(recs)} recommendations)")


if __name__ == "__main__":
    main()

