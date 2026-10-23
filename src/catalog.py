# -*- coding: utf-8 -*-
"""Loads products.json, checks every field and prints clear Arabic messages.
If anything is wrong the build stops, so the live site is never replaced by a broken one."""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "products.json")
IMAGES = os.path.join(HERE, "images")
STATIC = os.path.join(HERE, "static")
CATS = {"acc", "stock", "price", "hr", "home"}
LANGS = {"ar", "en", "fi"}
BADGES = {"alv", "x365"}
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
URL = re.compile(r"^https://[^\s\"'<>]+$")
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
        if isinstance(pr, bool) or not isinstance(pr, (int, float)) or pr <= 0 or pr > 10000:
            errors.append(f"{who}: السعر price يجب أن يكون رقمًا أكبر من صفر، مثل 17.")
        elif float(pr).is_integer():
            pr = int(pr)
        langs = p.get("languages")
        if not isinstance(langs, list) or not langs or not set(langs) <= LANGS:
            errors.append(f"{who}: اللغات languages يجب أن تكون من ar و en و fi، مثل [\"ar\", \"en\"].")
        if p.get("category") not in CATS:
            errors.append(f"{who}: التصنيف category يجب أن يكون واحدًا من: {', '.join(sorted(CATS))}.")
        badges = p.get("badges", [])
        if not isinstance(badges, list) or not set(badges) <= BADGES:
            errors.append(f"{who}: الشارات badges يجب أن تكون من alv و x365 أو فارغة [].")
        if not isinstance(p.get("payhip"), str) or not URL.match(p.get("payhip", "")):
            errors.append(f"{who}: رابط payhip مطلوب ويجب أن يبدأ بـ https://")
        for k in ("etsy", "gumroad"):
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
        out.append(dict(id=slug, price=pr, cat=p.get("category"), langs=langs or [], tags=badges or [],
                        payhip=p.get("payhip", ""), etsy=p.get("etsy", ""), gumroad=p.get("gumroad", ""),
                        wide=p.get("wide") is True,
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
