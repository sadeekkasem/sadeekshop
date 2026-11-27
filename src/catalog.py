# -*- coding: utf-8 -*-
"""Loads products.json, checks every field and prints clear Arabic messages.
If anything is wrong the build stops, so the live site is never replaced by a broken one."""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "products.json")
IMAGES = os.path.join(HERE, "images")
STATIC = os.path.join(HERE, "static")
# Field (domain) of a product. Kept the old keys so existing products and the control panel keep working.
CATS = {"acc", "stock", "hr", "clinic", "price", "shop", "ship", "home", "auto", "edu"}
# Product type (what the customer receives). Optional: defaults to excel, or n8n for the automation field.
TYPES = {"excel", "gsheets", "web", "n8n", "custom"}
def default_type(cat): return "n8n" if cat == "auto" else "excel"
LANGS = {"ar", "en", "fi"}
BADGES = {"alv", "x365"}
STATUSES = {"", "soon"}
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
URL = re.compile(r"^https://[^\s\"'<>]+$")
DL = re.compile(r"^downloads/[A-Za-z0-9][A-Za-z0-9._-]*\.(zip|xlsx)$")
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")


def fail(errors):
    print("\n========== لم يتم تحديث الموقع ==========")
    print("الموقع الحالي ما زال يعمل كما هو. صحّح الأخطاء التالية ثم احفظ مرة أخرى:\n")
    for m in errors:
        print(" - " + m)
        if os.environ.get("GITHUB_ACTIONS"):
            print("::error title=خطأ في بيانات القوالب::" + m.replace("\n", " "))
    print("=========================================\n")
    sys.exit(1)


def find_image(name):
    for ext in IMG_EXT:
        f = os.path.join(IMAGES, name + ext)
        if os.path.exists(f):
            return f
    return None


SB_URL = "https://opauvtpuiqrywpsgcorv.supabase.co"
SB_KEY = "sb_publishable_FqN53bpc23Le9WVCuUnc5g_ZQQTqnDD"  # public (publishable) key: it can only read what the public may see


def fetch_db():
    """Reads the products table from Supabase (the control panel). Returns None if it cannot be reached,
    so the build then simply uses src/products.json and the site never breaks."""
    import urllib.request
    import urllib.error
    base = "slug,name_ar,name_en,name_fi,description,price_eur,category,languages,active,file_path,sort_order"
    try:
        # product_type is optional: older databases without the column are read without it.
        for cols in (base + ",product_type,checkout_url", base + ",product_type", base):
            req = urllib.request.Request(
                SB_URL + "/rest/v1/products?select=" + cols + "&order=sort_order.asc",
                headers={"apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY})
            try:
                with urllib.request.urlopen(req, timeout=20) as r:
                    rows = json.loads(r.read().decode("utf-8"))
                return rows if isinstance(rows, list) else None
            except urllib.error.HTTPError as he:
                if he.code == 400 and cols != base:
                    continue
                raise
        return None
    except Exception as ex:  # network, auth, JSON...
        print("تنبيه: تعذّر قراءة لوحة التحكم (Supabase)، سيُستخدم products.json فقط:", type(ex).__name__)
        return None


def store_of(url):
    """Which store a sale link from the control panel belongs to: payhip / etsy / sikka / gumroad / store (any other https shop)."""
    if not isinstance(url, str) or not URL.match(url.strip()):
        return None
    from urllib.parse import urlparse
    host = (urlparse(url.strip()).hostname or "").lower()
    for key, names in (("payhip", ("payhip.com",)), ("etsy", ("etsy.com", "etsy.me")), ("sikka", ("sikka.me", "sikka.sa")), ("gumroad", ("gumroad.com", "gum.co"))):
        if any(host == n or host.endswith("." + n) for n in names):
            return key
    return "store"


def merge_db(items):
    """The control panel wins for: name, description, price, category, languages, visible/hidden, order,
    and whether the template is sold from this site (a private file is uploaded)."""
    rows = fetch_db()
    if rows is None:
        return items
    by = {r.get("slug"): r for r in rows if r.get("slug")}
    order = {r["slug"]: i for i, r in enumerate(rows) if r.get("slug")}
    out = []
    for p in items:
        r = by.get(p.get("slug"))
        if not r:
            out.append(p); continue
        q = dict(p)
        for k_db, k in (("name_ar", "name_ar"), ("name_en", "name_en"), ("name_fi", "name_fi"), ("description", "desc_ar")):
            if isinstance(r.get(k_db), str) and r[k_db].strip():
                q[k] = r[k_db].strip()
        try:
            pr = float(r.get("price_eur"))
            if pr > 0:
                q["price"] = pr
        except (TypeError, ValueError):
            pass
        if r.get("category") in CATS:
            q["category"] = r["category"]
        if r.get("product_type") in TYPES:
            q["type"] = r["product_type"]
        if isinstance(r.get("languages"), list) and r["languages"] and set(r["languages"]) <= LANGS:
            q["languages"] = r["languages"]
        link = (r.get("checkout_url") or "").strip()
        st = store_of(link)
        if st:  # the sale link typed in the control panel wins for its own store
            q["store_url" if st == "store" else st] = link
            q["primary"] = "store_url" if st == "store" else st
        has_ext = any(q.get(k) for k in ("payhip", "etsy", "sikka", "gumroad", "store_url")) or p.get("download")
        q["_site"] = bool(r.get("file_path"))
        if r.get("active"):
            q["hidden"] = False
            q["status"] = "" if has_ext else "soon"  # بلا رابط متجر خارجي = عرض فقط بعلامة "قريبًا"
        else:
            if p.get("status") == "soon":
                pass
            else:
                q["hidden"] = True
        out.append(q)
    known = {p.get("slug") for p in items}
    for slug, r in by.items():
        if slug in known or not r.get("active") or not SLUG.match(slug):
            continue
        if not (os.path.exists(os.path.join(STATIC, "assets", "img", f"{slug}-480.webp")) or find_image(slug)):
            print(f"تنبيه: القالب الجديد {slug} فعّال في اللوحة لكن صورته غير موجودة. ارفع src/images/{slug}.jpg ليظهر في الموقع.")
            continue
        ar = (r.get("name_ar") or slug).strip(); desc = (r.get("description") or ar).strip()
        try: pr = float(r.get("price_eur") or 0)
        except (TypeError, ValueError): pr = 0
        if pr <= 0:
            print(f"تنبيه: القالب الجديد {slug} يحتاج سعرًا أكبر من صفر ليظهر.")
            continue
        link = (r.get("checkout_url") or "").strip(); st = store_of(link)
        links = dict(payhip="", etsy="", gumroad="", sikka="", store_url="")
        if st:
            links["store_url" if st == "store" else st] = link
        out.append(dict(slug=slug, hidden=False, name_ar=ar, name_en=(r.get("name_en") or ar).strip(), name_fi=(r.get("name_fi") or r.get("name_en") or ar).strip(),
                        desc_ar=desc, desc_en=desc, desc_fi=desc, price=pr, languages=r.get("languages") or ["ar"],
                        category=r.get("category") if r.get("category") in CATS else "acc",
                        type=r.get("product_type") if r.get("product_type") in TYPES else default_type(r.get("category")), badges=[], **links,
                        status="" if st else "soon", wide=False, demo=[], _site=bool(r.get("file_path"))))
    out.sort(key=lambda x: order.get(x.get("slug"), 9999))
    print(f"تمت مزامنة {len(by)} قالبًا من لوحة التحكم.")
    return out


def load():
    try:
        raw = open(DATA, encoding="utf-8").read()
    except FileNotFoundError:
        fail(["الملف src/products.json غير موجود."])
    try:
        doc = json.loads(raw)
    except json.JSONDecodeError as ex:
        fail([f"الملف src/products.json فيه خطأ في الكتابة عند السطر {ex.lineno} (العمود {ex.colno}). "
              "غالبًا: فاصلة , ناقصة أو زائدة، أو علامة \" ناقصة."])
    items = doc.get("products") if isinstance(doc, dict) else None
    if not isinstance(items, list):
        fail(["الملف src/products.json يجب أن يحتوي على قائمة \"products\"."])
    items = merge_db(items)
    errors, seen, out = [], set(), []
    for i, p in enumerate(items, 1):
        if not isinstance(p, dict):
            errors.append(f"القالب رقم {i}: ليس بالشكل الصحيح {{ ... }}."); continue
        who = f"القالب رقم {i} ({p.get('slug') or 'بدون slug'})"
        slug = p.get("slug", "")
        if not isinstance(slug, str) or not SLUG.match(slug):
            errors.append(f"{who}: الحقل slug يجب أن يكون بحروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل invoice-pro.")
        elif slug in seen:
            errors.append(f"{who}: الـ slug مكرر. كل قالب يحتاج slug مختلف.")
        seen.add(slug)
        for k in ("name_ar", "name_en", "name_fi", "desc_ar", "desc_en", "desc_fi"):
            v = p.get(k)
            if not isinstance(v, str) or not v.strip():
                errors.append(f"{who}: الحقل {k} فارغ أو ناقص.")
        pr = p.get("price")
        if isinstance(pr, str):
            try: pr = float(pr.replace(",", ".").replace("€", "").strip())
            except ValueError: pass
        status = p.get("status") or ""
        if status not in STATUSES:
            errors.append(f"{who}: الحقل status يجب أن يكون \"soon\" أو فارغًا \"\".")
        download = p.get("download") or ""
        if download and (not isinstance(download, str) or not DL.match(download)):
            errors.append(f"{who}: الحقل download يجب أن يكون مسارًا مثل downloads/file.zip أو فارغًا.")
        elif download and not os.path.exists(os.path.join(STATIC, download)):
            errors.append(f"{who}: ملف التحميل غير موجود. ضعه في src/static/{download}")
        if status == "soon" and download:
            errors.append(f"{who}: القالب بعلامة قريبًا لا يوضع له ملف تحميل.")
        is_free = bool(download) and status != "soon"
        min_price = 0 if is_free else 0.0001
        if isinstance(pr, bool) or not isinstance(pr, (int, float)) or pr < min_price or pr > 10000:
            if is_free:
                errors.append(f"{who}: السعر price للقالب المجاني يجب أن يكون 0 أو رقمًا أكبر من صفر.")
            else:
                errors.append(f"{who}: السعر price يجب أن يكون رقمًا أكبر من صفر، مثل 17.")
        elif float(pr).is_integer():
            pr = int(pr)
        langs = p.get("languages")
        if not isinstance(langs, list) or not langs or not set(langs) <= LANGS:
            errors.append(f"{who}: اللغات languages يجب أن تكون من ar و en و fi، مثل [\"ar\", \"en\"].")
        if p.get("category") not in CATS:
            errors.append(f"{who}: التصنيف category يجب أن يكون واحدًا من: {', '.join(sorted(CATS))}.")
        ptype = p.get("type") or default_type(p.get("category"))
        if ptype not in TYPES:
            errors.append(f"{who}: النوع type يجب أن يكون واحدًا من: {', '.join(sorted(TYPES))} أو يُترك فارغًا.")
        badges = p.get("badges", [])
        if not isinstance(badges, list) or not set(badges) <= BADGES:
            errors.append(f"{who}: الشارات badges يجب أن تكون من alv و x365 أو فارغة [].")
        payhip, etsy, sikka = p.get("payhip", "") or "", p.get("etsy", "") or "", p.get("sikka", "") or ""
        has_payhip = isinstance(payhip, str) and URL.match(payhip)
        has_etsy = isinstance(etsy, str) and URL.match(etsy)
        has_sikka = isinstance(sikka, str) and URL.match(sikka)
        has_other = any(isinstance(p.get(k), str) and URL.match(p.get(k) or "") for k in ("gumroad", "store_url"))
        if p.get("hidden") is not True and status != "soon" and not download and not p.get("_site") and not (has_payhip or (payhip == "" and has_etsy) or (payhip == "" and etsy == "" and has_sikka) or has_other):
            errors.append(f"{who}: رابط payhip أو etsy أو sikka مطلوب ويجب أن يبدأ بـ https:// (إلا إذا كان القالب مجانيًا بملف download أو بعلامة قريبًا).")
        for k in ("payhip", "etsy", "gumroad", "sikka"):
            v = p.get(k, "")
            if v and (not isinstance(v, str) or not URL.match(v)):
                errors.append(f"{who}: رابط {k} يجب أن يبدأ بـ https:// أو يبقى فارغًا \"\".")
        demo = p.get("demo", [])
        if not isinstance(demo, list) or any(not isinstance(d, dict) for d in demo):
            errors.append(f"{who}: الحقل demo يجب أن يكون قائمة أو فارغًا []."); demo = []
        if p.get("hidden") is True:
            continue
        if isinstance(slug, str) and SLUG.match(slug):
            has_built = os.path.exists(os.path.join(STATIC, "assets", "img", f"{slug}-480.webp"))
            if not has_built and not find_image(slug):
                errors.append(f"{who}: صورة القالب غير موجودة. ارفع الصورة باسم src/images/{slug}.jpg")
            for n in range(1, len(demo) + 1):
                if not os.path.exists(os.path.join(STATIC, "assets", "demo", f"{slug}-{n}.webp")) and not find_image(f"{slug}-{n}"):
                    errors.append(f"{who}: صورة العرض رقم {n} غير موجودة. ارفعها باسم src/images/{slug}-{n}.jpg أو احذف وصفها من demo.")
        out.append(dict(id=slug, price=pr, cat=p.get("category"), type=p.get("type") or default_type(p.get("category")), langs=langs or [], tags=badges or [],
                        payhip=p.get("payhip", ""), etsy=p.get("etsy", ""), gumroad=p.get("gumroad", ""), sikka=p.get("sikka", ""), store_url=p.get("store_url", ""), primary=p.get("primary", ""),
                        status=status, download=download, wide=p.get("wide") is True, site=bool(p.get("_site")),
                        name=dict(ar=p.get("name_ar", ""), en=p.get("name_en", ""), fi=p.get("name_fi", "")),
                        ben=dict(ar=p.get("desc_ar", ""), en=p.get("desc_en", ""), fi=p.get("desc_fi", "")),
                        demo=[(d.get("en", ""), d.get("ar", ""), d.get("fi", "")) for d in demo]))
    if not out and not errors:
        errors.append("لا يوجد أي قالب ظاهر في الموقع (كل القوالب مخفية).")
    if errors:
        fail(errors)
    return out


def prepare_assets(out_dir):
    """Copy the fixed site files, then make web images for any template that has only an uploaded photo."""
    import shutil
    from PIL import Image
    shutil.copytree(STATIC, out_dir, dirs_exist_ok=True)
    img_dir = os.path.join(out_dir, "assets", "img"); demo_dir = os.path.join(out_dir, "assets", "demo")
    for p in PRODUCTS:
        pid = p["id"]
        src = find_image(pid)
        if src:  # an uploaded photo always wins over the older built image
            im = Image.open(src).convert("RGB")
            for w in (480, 800):
                im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(
                    os.path.join(img_dir, f"{pid}-{w}.webp"), "WEBP", quality=78, method=6)
        for n in range(1, len(p["demo"]) + 1):
            src = find_image(f"{pid}-{n}")
            if not src:
                continue  # older templates keep their built slides from static/
            im = Image.open(src).convert("RGB")
            if im.width > 1000:
                im = im.resize((1000, round(im.height * 1000 / im.width)), Image.LANCZOS)
            im.save(os.path.join(demo_dir, f"{pid}-{n}.webp"), "WEBP", quality=78, method=6)


PRODUCTS = load()
DEMO = {p["id"]: p["demo"] for p in PRODUCTS}
