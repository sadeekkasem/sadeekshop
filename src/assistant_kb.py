# -*- coding: utf-8 -*-
"""Builds assets/assistant-kb.json for the SadeekShop help widget from the site's own content,
and adds the widget script to every public page. Runs at the end of build.py.
Only whitelisted public fields are copied (names, descriptions, prices, public store links,
public FAQ text). Nothing secret is ever read, and the output is scanned before it is written."""
import json, os, re, glob, html

WHATSAPP = "https://wa.me/358402550588"
# Google Sheet "SadeekShop - أسئلة الزبائن" web app: POST = save an unanswered question, GET = answered rows only.
QUESTIONS_URL = "https://script.google.com/macros/s/AKfycbxMZXB-2sbMleIstdHsEfI4Dg95wlTbVvpGoNUMB4hMVvRJIfjDK8kiilXR99q4_Juv/exec"
SKIP_PAGES = {"admin.html", "shipops.html"}  # admin tool and the full-screen app iframe

def _text(s):
    return html.unescape(re.sub(r"<[^>]+>", " ", s or "")).strip()

def _page_info(path):
    raw = open(path, encoding="utf-8").read()
    m = re.search(r"<title[^>]*>(.*?)</title>", raw, re.S)
    d = re.search(r'<meta name="description" content="([^"]*)"', raw)
    return raw, (_text(m.group(1)) if m else ""), (html.unescape(d.group(1)) if d else "")

def _shipops(out):
    p = os.path.join(out, "shipops-sales.html")
    if not os.path.exists(p):
        return None
    raw, title, desc = _page_info(p)
    plans = []
    for m in re.finditer(r'<div class="plan[^"]*">.*?<h3>(.*?)</h3><div class="p">\s*([\d.,]+)\s*([$€])', raw, re.S):
        plans.append({"name": _text(m.group(1)), "price": m.group(2), "cur": m.group(3)})
    pay = re.search(r'class="note"><b>[^<]*</b>(.*?)</p>', raw, re.S)
    feats = [_text(h) for h in re.findall(r'<ul class="fgrid">(.*?)</ul>', raw, re.S)[0:1] for h in re.findall(r"<h3>(.*?)</h3>", h)] if 'class="fgrid"' in raw else []
    return {"url": "shipops-sales.html", "title": title, "desc": desc, "plans": plans,
            "pay": _text(pay.group(1)) if pay else "", "features": feats}

def _sheet_answers():
    """Answers sadeek wrote in the questions sheet. Fail-safe: offline or error -> []."""
    import urllib.request
    try:
        with urllib.request.urlopen(QUESTIONS_URL, timeout=15) as r:
            items = json.loads(r.read().decode("utf-8")).get("items", [])
    except Exception as ex:
        print("questions sheet not reachable, building without it:", type(ex).__name__)
        return []
    res = []
    for it in items if isinstance(items, list) else []:
        q, a = str(it.get("q", ""))[:200].strip(), str(it.get("a", ""))[:2000].strip()
        if not q or not a:
            continue
        kw = [q] + [str(k)[:80] for k in it.get("kw", []) if str(k).strip()][:20]
        lang = it.get("lang") if it.get("lang") in ("ar", "en", "fi") else "ar"
        res.append({"kw": {lang: kw}, "a": {"ar": a, "en": a, "fi": a}, "links": []})
    print("questions sheet answers:", len(res))
    return res

def _learned():
    """Answers added from forwarded questions (src/assistant-learned.json). Keys starting with _ are skipped."""
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assistant-learned.json")
    if not os.path.exists(f):
        return []
    try:
        doc = json.load(open(f, encoding="utf-8"))
    except json.JSONDecodeError as ex:
        raise SystemExit(f"src/assistant-learned.json: JSON error at line {ex.lineno}, column {ex.colno}")
    res = []
    for i, en in enumerate(doc.get("entries", []), 1):
        kw = {l: [k for k in en.get("keywords", {}).get(l, []) if isinstance(k, str) and k.strip()] for l in ("ar", "en", "fi")}
        ans = en.get("answer", {})
        if not any(kw.values()) or not all(isinstance(ans.get(l), str) and ans[l].strip() for l in ("ar", "en", "fi")):
            raise SystemExit(f"src/assistant-learned.json entry {i}: needs keywords and an answer in ar, en and fi")
        links = [{"t": l["t"], "h": l["h"]} for l in en.get("links", []) if isinstance(l, dict) and l.get("h")]
        res.append({"kw": kw, "a": {l: ans[l] for l in ("ar", "en", "fi")}, "links": links})
    return res

SECRET_PATTERNS = [r"AKIA[0-9A-Z]{16}", r"\bsk-[A-Za-z0-9]{20,}", r"\bghp_[A-Za-z0-9]{20,}", r"AIza[0-9A-Za-z_\-]{30,}",
                   r"(?i)\b(pass(word)?|كلمة السر|كلمة المرور)\s*[:=]\s*\S+"]

def scan_secrets(out):
    """Stop the build if anything that looks like a key or a written-out password reaches the public output.
    Extra private values can be checked by putting them in the SECRET_SCAN env var (comma-separated) in CI."""
    extra = [s for s in os.environ.get("SECRET_SCAN", "").split(",") if s.strip()]
    bad = []
    for f in glob.glob(os.path.join(out, "**", "*"), recursive=True):
        if not f.endswith((".html", ".js", ".json", ".css", ".xml", ".txt")):
            continue
        s = open(f, encoding="utf-8", errors="ignore").read()
        for pat in SECRET_PATTERNS:
            if re.search(pat, s):
                bad.append(f"{os.path.relpath(f, out)}: {pat}")
        for x in extra:
            if x.strip() in s:
                bad.append(f"{os.path.relpath(f, out)}: SECRET_SCAN value")
    if bad:
        raise SystemExit("Secret-like content found in the site output:\n" + "\n".join(bad))

def build(out, PRODUCTS, T, FREE, EMAIL, PAYHIP_STORE, ETSY_SHOP, SIKKA_SHOP):
    prods = []
    for p in PRODUCTS:
        buy = []
        for via, k in (("Payhip", "payhip"), ("Etsy", "etsy"), ("SIKKA", "sikka"), ("Gumroad", "gumroad")):
            if p.get(k):
                buy.append({"via": via, "url": p[k]})
        prods.append({"id": p["id"], "name": p["name"], "desc": p["ben"], "price": p["price"],
                      "cat": p["cat"], "langs": p["langs"], "buy": buy})
    faq, n = [], 1
    while f"faq.{n}q" in T:
        faq.append({"q": T[f"faq.{n}q"], "a": T[f"faq.{n}a"]}); n += 1
    how = [{"t": T[f"how.{i}t"], "d": T[f"how.{i}d"]} for i in range(1, 10) if f"how.{i}t" in T]
    cats = {k[7:]: v for k, v in T.items() if k.startswith("filter.") and k != "filter.all"}
    kb = {
        "contact": {"whatsapp": WHATSAPP, "email": EMAIL},
        "stores": {"payhip": PAYHIP_STORE, "etsy": ETSY_SHOP, "sikka": SIKKA_SHOP},
        "products": prods,
        "cats": cats,
        "faq": faq,
        "how": how,
        "free": {"url": FREE["payhip"], "title": T.get("free.title"), "text": T.get("free.text")},
        "custom": {"url": "custom-template.html", "title": T.get("req.title"), "lead": T.get("req.lead"),
                   "reply": T.get("req.how.2d")},
        "shipops": _shipops(out),
        "learned": _learned() + _sheet_answers(),
        "qurl": QUESTIONS_URL,
    }
    data = json.dumps(kb, ensure_ascii=False, separators=(",", ":"))
    os.makedirs(os.path.join(out, "assets"), exist_ok=True)
    open(os.path.join(out, "assets", "assistant-kb.json"), "w", encoding="utf-8").write(data)
    # add the widget to every public page (new pages are picked up automatically)
    tag = '<script src="assets/assistant.js" defer></script>'
    for f in glob.glob(os.path.join(out, "*.html")):
        name = os.path.basename(f)
        s = open(f, encoding="utf-8").read()
        if name in SKIP_PAGES or tag in s or "</body>" not in s or "<html" not in s:
            continue
        open(f, "w", encoding="utf-8").write(s.replace("</body>", tag + "\n</body>", 1))
    scan_secrets(out)
    print("written assets/assistant-kb.json", len(data), "products:", len(prods))
