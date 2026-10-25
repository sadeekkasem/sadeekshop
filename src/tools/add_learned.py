# -*- coding: utf-8 -*-
"""Add an answer to src/assistant-learned.json for the SadeekShop help widget.
Usage (interactive):  python src/tools/add_learned.py
Usage (one line):     python src/tools/add_learned.py --kw-ar "فروع,اكثر من فرع" --kw-en "branches" --ar "..." --en "..." --fi "..." [--link-url URL --link-ar .. --link-en .. --link-fi ..]
Then rebuild (python src/build.py) and commit. This file is public: never put passwords or private data in it."""
import argparse, json, os, re
F = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assistant-learned.json")
ap = argparse.ArgumentParser()
for k in ("kw-ar", "kw-en", "kw-fi", "ar", "en", "fi", "link-url", "link-ar", "link-en", "link-fi"):
    ap.add_argument("--" + k, default=None)
a = vars(ap.parse_args())
def get(k, prompt):
    v = a[k.replace("-", "_")]
    return v if v is not None else input(prompt + ": ").strip()
kw = {l: [x.strip() for x in get("kw-" + l, f"keywords {l} (comma-separated, may be empty)").split(",") if x.strip()] for l in ("ar", "en", "fi")}
ans = {l: get(l, f"answer {l}") for l in ("ar", "en", "fi")}
if not any(kw.values()) or not all(ans.values()):
    raise SystemExit("Need at least one keyword and an answer in ar, en and fi.")
if re.search(r"(?i)pass(word)?|salasana|كلمة (السر|المرور)\s*[:=]", " ".join(ans.values())) and re.search(r"[:=]\s*\S+", " ".join(ans.values())):
    raise SystemExit("This looks like it contains a password. This file is public: do not add it.")
e = {"keywords": kw, "answer": ans}
url = get("link-url", "link URL (optional, Enter to skip)")
if url:
    e["links"] = [{"t": {l: get("link-" + l, f"link text {l}") or url for l in ("ar", "en", "fi")}, "h": url}]
doc = json.load(open(F, encoding="utf-8"))
doc.setdefault("entries", []).append(e)
json.dump(doc, open(F, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"Added. {len(doc['entries'])} learned answers now. Rebuild with: python src/build.py")
