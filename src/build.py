# -*- coding: utf-8 -*-
import json, html, os, sys
sys.path.insert(0, os.path.dirname(__file__))
# usage: python src/build.py <output folder>   (default: _site next to src)
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_site"))
from content import *
import catalog
catalog.prepare_assets(OUT)
SITE_URL = "https://sadeekkasem.github.io/sadeekshop/"
L = "ar"
def t(k): return T[k][L]
def e(s): return html.escape(s, quote=True)
def tx(k, tag="span", cls="", attrs=""):
    c = f' class="{cls}"' if cls else ""
    return f'<{tag}{c} data-i18n="{k}"{attrs}>{e(t(k))}</{tag}>'

ICON = {
 "pause": '<path d="M9 6v12M15 6v12"/>',
 "play": '<path d="M8 5l11 7-11 7z"/>',
 "lock": '<path d="M7 11V8a5 5 0 0 1 10 0v3"/><rect x="4" y="11" width="16" height="10" rx="2"/><circle cx="12" cy="16" r="1.5"/>',
 "cell": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/><rect x="10" y="11" width="10" height="8" fill="#ffd54a" stroke="none"/>',
 "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
 "receipt": '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
 "download": '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/>',
 "shield": '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
 "cart": '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11L21 7H6.2"/>',
 "check": '<path d="M5 12.5l4.5 4.5L19 7"/>',
 "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
 "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
 "chev": '<path d="M6 9l6 6 6-6"/>',
 "copy": '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
 "x": '<path d="M6 6l12 12M18 6L6 18"/>',
 "gift": '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8S10.5 3 8 4s0 4 4 4zm0 0s1.5-5 4-4 0 4-4 4z"/>',
}
def icon(n, cls="ic"):
    return f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[n]}</svg>'

def price(p):
    return {"ar": f"{p} €", "en": f"€{p}", "fi": f"{p} €"}

def card(p, i):
    pid = p["id"]
    langs = "".join(f'<li class="lg lg-{l}">{tx("lang."+l)}</li>' for l in p["langs"])
    tags = "".join(f'<span class="tag tag-{g}">{tx("tag."+g)}</span>' for g in p["tags"])
    pr = price(p["price"])
    buy_url, buy_via = (p['payhip'], "Payhip") if p.get('payhip') else (p['etsy'], "Etsy")
    alt_etsy = p.get('etsy') if p.get('payhip') else ''
    alt = (f'''    <div class="stores-alt">{tx("card.also","span","also")}
      {('<a class="store store-etsy" href="'+e(p['etsy'])+'" target="_blank" rel="noopener">Etsy</a>') if alt_etsy else ''}{('<a class="store store-gum" href="'+e(p['gumroad'])+'" target="_blank" rel="noopener">Gumroad</a>') if p.get('gumroad') else ''}{('<a class="store store-sikka" href="'+e(p['sikka'])+'" target="_blank" rel="noopener">'+tx("card.sikka")+'</a>') if p.get('sikka') else ''}
    </div>''') if (alt_etsy or p.get('gumroad') or p.get('sikka')) else ''
    lazy = 'loading="lazy" decoding="async"' if i > 2 else 'decoding="async"'
    return f'''
<article class="card{' wide' if pid in WIDE else ''}" data-cat="{p['cat']}">
  <a class="card-media" href="{e(buy_url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
    <img src="assets/img/{pid}-480.webp" srcset="assets/img/{pid}-480.webp 480w, assets/img/{pid}-800.webp 800w" sizes="(max-width:640px) 92vw, (max-width:1024px) 46vw, {'560px' if pid in WIDE else '380px'}" width="800" height="600" {lazy} alt="{e(t(f"p.{pid}.name"))}" data-alt-key="p.{pid}.name">
    {('<div class="tags">'+tags+'</div>') if tags else ''}
  </a>
  <div class="card-body">
    <ul class="langs">{langs}</ul>
    <h3 class="card-title" data-i18n="p.{pid}.name">{e(t(f"p.{pid}.name"))}</h3>
    <p class="card-text" data-i18n="p.{pid}.ben">{e(t(f"p.{pid}.ben"))}</p>
    <div class="card-foot">
      <div class="price"><bdi data-price='{json.dumps(pr)}'>{pr[L]}</bdi></div>
      <div class="actions">
        <a class="btn btn-buy" href="{e(buy_url)}" target="_blank" rel="noopener">{icon("cart")}{tx("card.buy")}<small class="via">{buy_via}</small></a>
      </div>
    </div>
{alt}
  </div>
</article>'''

def header(pre, cur=""):
    h = f'''<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="{pre or "#main"}" aria-label="SadeekShop"><img src="assets/icon-72.png" width="36" height="36" alt=""><span>Sadeek<b>Shop</b></span></a>
    <nav class="nav" aria-label="main">
      <a href="{pre}#products" data-i18n="nav.products">{e(t("nav.products"))}</a>
      <a href="{pre}#demo" data-i18n="nav.demo">{e(t("nav.demo"))}</a>
      <a href="{pre}#free" data-i18n="nav.free">{e(t("nav.free"))}</a>
      <a href="{pre}#why" data-i18n="nav.why">{e(t("nav.why"))}</a>
      <a href="{pre}#faq" data-i18n="nav.faq">{e(t("nav.faq"))}</a>
      <a href="{pre}#contact" data-i18n="nav.contact">{e(t("nav.contact"))}</a>
      <a href="shipops-sales.html" data-i18n="nav.shipops">{e(t("nav.shipops"))}</a>
      <a class="nav-cta" href="custom-template.html"{cur} data-i18n="nav.custom">{e(t("nav.custom"))}</a>
    </nav>
    <div class="lang" role="group" aria-label="{e(t("nav.lang"))}" data-i18n-aria="nav.lang">
      <button type="button" data-lang="ar" lang="ar" aria-pressed="true">عربي</button>
      <button type="button" data-lang="en" lang="en" aria-pressed="false">EN</button>
      <button type="button" data-lang="fi" lang="fi" aria-pressed="false">FI</button>
    </div>
  </div>
</header>'''
    return h

cats = ["all", "acc", "stock", "price", "hr", "home"]
filters = "".join(f'<button type="button" class="chip{" is-on" if c=="all" else ""}" data-filter="{c}" aria-pressed="{"true" if c=="all" else "false"}">{tx("filter."+c)}</button>' for c in cats)
WIDE = {p["id"] for p in PRODUCTS if p.get("wide")}
cards = "".join(card(p, i) for i, p in enumerate(PRODUCTS))
minp = min(p["price"] for p in PRODUCTS)

why = "".join(f'''<li class="why-item"><span class="why-ic">{icon(ic)}</span><h3 data-i18n="why.{n}t">{e(t(f"why.{n}t"))}</h3><p data-i18n="why.{n}d">{e(t(f"why.{n}d"))}</p></li>'''
              for n, ic in zip(range(1,7), ["lock","cell","globe","receipt","download","shield"]))
how = "".join(f'''<li class="step"><span class="step-n">{n}</span><span class="step-ic">{icon(ic)}</span><h3 data-i18n="how.{n}t">{e(t(f"how.{n}t"))}</h3><p data-i18n="how.{n}d">{e(t(f"how.{n}d"))}</p></li>'''
              for n, ic in zip(range(1,4), ["cart","download","cell"]))
faq = "".join(f'''<details class="qa"{" open" if n==1 else ""}><summary><span data-i18n="faq.{n}q">{e(t(f"faq.{n}q"))}</span>{icon("chev","ic chev")}</summary><p data-i18n="faq.{n}a">{e(t(f"faq.{n}a"))}</p></details>'''
              for n in range(1,7))

# ---- demo finder data ----
import shutil
SRC = os.path.dirname(os.path.abspath(__file__))
for f in ("demo.js", "demo.css"): shutil.copy(os.path.join(SRC, f), f"{OUT}/assets/{f}")
DEMO_DATA = []
for p in PRODUCTS:
    sl = []
    if not DEMO.get(p["id"]): continue
    for n, (en, ar, fi) in enumerate(DEMO[p["id"]], 1):
        src = f"assets/demo/{p['id']}-{n}.webp"
        assert os.path.exists(f"{OUT}/{src}"), src
        sl.append({"src": src, "cap": {"ar": ar, "en": en, "fi": fi}})
    d = {"id": p["id"], "name": p["name"], "payhip": p["payhip"], "etsy": p.get("etsy", ""), "gumroad": p.get("gumroad", ""), "sikka": p.get("sikka", ""), "slides": sl}
    if p.get("gumroad"): d["gumroad"] = p["gumroad"]
    DEMO_DATA.append(d)
DEMO_SEC = f'''
<section class="sec sec-tint" id="demo">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker" data-i18n="demo.kicker">{e(t("demo.kicker"))}</p>
      <h2 data-i18n="demo.title">{e(t("demo.title"))}</h2>
    </div>
    <div class="demo" id="demoFinder" data-cart="{e(icon("cart"))}">
      <div class="demo-search">
        <label for="demoInput" data-i18n="demo.label">{e(t("demo.label"))}</label>
        <div class="demo-field">
          <input id="demoInput" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="demoList" placeholder="{e(t("demo.ph"))}" data-i18n-ph="demo.ph">
          <button type="button" class="demo-clear" id="demoClear" aria-label="{e(t("demo.clear"))}" data-i18n-aria="demo.clear">{icon("x","ic sm")}</button>
        </div>
        <ul class="demo-list" id="demoList" role="listbox" hidden></ul>
      </div>
      <p class="demo-hint" id="demoHint" role="status" aria-live="polite" data-i18n="demo.hint">{e(t("demo.hint"))}</p>
      <div class="demo-view" id="demoView" hidden>
        <h3 class="demo-name" id="demoName"></h3>
        <div class="demo-stage">
          <img id="demoImg" src="data:," alt="" width="1000" height="750" decoding="async">
          <span class="demo-count" id="demoCount" dir="ltr"></span>
          <button type="button" class="demo-nav demo-prev" id="demoPrev" aria-label="{e(t("demo.prev"))}" data-i18n-aria="demo.prev">{icon("arrow")}</button>
          <button type="button" class="demo-nav demo-next" id="demoNext" aria-label="{e(t("demo.next"))}" data-i18n-aria="demo.next">{icon("arrow")}</button>
        </div>
        <p class="demo-cap" id="demoCap" aria-live="polite"></p>
        <div class="demo-ctrl">
          <button type="button" class="demo-pp" id="demoPP" aria-pressed="false" aria-label="{e(t("demo.pause"))}">{icon("pause","ic sm pause")}{icon("play","ic sm play")}</button>
          <div class="demo-dots" id="demoDots"></div>
        </div>
        <div class="demo-buy" id="demoBuy"></div>
      </div>
    </div>
  </div>
</section>
'''

T["stat.count"] = {"ar": str(len(PRODUCTS)), "en": str(len(PRODUCTS)), "fi": str(len(PRODUCTS))}
og_url = f'<meta property="og:url" content="{SITE_URL}">\n<link rel="canonical" href="{SITE_URL}">' if SITE_URL else ""
og_img = (SITE_URL + "assets/og-image.jpg") if SITE_URL else "assets/og-image.jpg"

ld = {"@context":"https://schema.org","@type":"Store","name":"SadeekShop","email":EMAIL,
      "address":{"@type":"PostalAddress","addressCountry":"FI"},"sameAs":[ETSY_SHOP, PAYHIP_STORE, SIKKA_SHOP]}

FOOT = f'''<footer class="foot">
  <div class="wrap foot-in">
    <div class="brand"><img src="assets/icon-72.png" width="28" height="28" alt="" loading="lazy"><span>Sadeek<b>Shop</b></span></div>
    <p data-i18n="footer.tagline">{e(t("footer.tagline"))}</p>
    <p class="foot-links"><a href="{PAYHIP_STORE}" target="_blank" rel="noopener">Payhip</a> · <a href="{ETSY_SHOP}" target="_blank" rel="noopener">Etsy</a> · <a href="{SIKKA_SHOP}" target="_blank" rel="noopener">SIKKA</a> · <a class="yt" href="https://www.youtube.com/@SadeekShopExcel" target="_blank" rel="noopener"><svg class="yt-ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15.1V8.9l5.8 3.1z"/></svg> <span data-i18n="footer.youtube">{e(t("footer.youtube"))}</span></a> · <a href="mailto:{EMAIL}"><bdi>{EMAIL}</bdi></a></p>
    <p class="tm"><span data-i18n="footer.tm">{e(t("footer.tm"))}</span><br>© 2026 SadeekShop</p>
  </div>
</footer>'''

doc = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title data-i18n="meta.title">{e(t("meta.title"))}</title>
<meta name="description" content="{e(t("meta.desc"))}" data-i18n-content="meta.desc">
<meta name="theme-color" content="#0e5a35">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SadeekShop">
<meta property="og:title" content="{e(t("meta.title"))}" data-i18n-content="meta.title">
<meta property="og:description" content="{e(t("meta.desc"))}" data-i18n-content="meta.desc">
<meta property="og:image" content="{og_img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:locale" content="ar_AR"><meta property="og:locale:alternate" content="en_US"><meta property="og:locale:alternate" content="fi_FI">
<meta name="twitter:card" content="summary_large_image">
{og_url}
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="assets/icon-32.png">
<link rel="apple-touch-icon" href="assets/icon-180.png">
<link rel="preload" href="assets/fonts/cairo.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/demo.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<script data-goatcounter="https://sadeekshop.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</head>
<body>
<a class="skip" href="#main" data-i18n="skip">{e(t("skip"))}</a>

<div class="promo" id="promo" data-until="2026-10-29T00:00:00+02:00" hidden>
  <div class="wrap promo-in">
    <p>{icon("gift")}<span data-i18n="promo.text">{e(t("promo.text"))}</span> <button type="button" class="code" id="copyCode" title="{e(t("promo.copy"))}"><bdi>OCT30</bdi>{icon("copy","ic sm")}<span class="sr" data-i18n="promo.copy">{e(t("promo.copy"))}</span></button> <span class="until" data-i18n="promo.until">{e(t("promo.until"))}</span></p>
    <button type="button" class="promo-x" id="promoClose" aria-label="{e(t("promo.close"))}" data-i18n-aria="promo.close">{icon("x","ic sm")}</button>
  </div>
</div>

{header("")}

<main id="main">
<div class="storebanner">
  <picture>
    <source media="(max-width:640px)" srcset="assets/banner-m-780.webp 780w, assets/banner-m-1170.webp 1170w" sizes="100vw" width="2420" height="680">
    <img src="assets/banner-1920.webp" srcset="assets/banner-1280.webp 1280w, assets/banner-1920.webp 1920w, assets/banner-2560.webp 2560w" sizes="(min-width:1440px) 1440px, 100vw" width="3360" height="840" alt="{e(t("banner.alt"))}" data-alt-key="banner.alt" fetchpriority="high" decoding="async">
  </picture>
</div>
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-copy">
      <p class="eyebrow" data-i18n="hero.eyebrow">{e(t("hero.eyebrow"))}</p>
      <h1 data-i18n="hero.title">{e(t("hero.title"))}</h1>
      <p class="lead" data-i18n="hero.lead">{e(t("hero.lead"))}</p>
      <div class="cta-row">
        <a class="btn btn-primary btn-lg" href="#products">{tx("hero.cta")}{icon("arrow","ic flip")}</a>
        <a class="btn btn-ghost btn-lg" href="#free">{icon("gift")}{tx("hero.cta2")}</a>
      </div>
      <ul class="stats">
        <li><b>{len(PRODUCTS)}</b>{tx("stat.templates")}</li>
        <li><b>3</b>{tx("stat.langs")}</li>
        <li>{tx("stat.from")}<b><bdi data-price='{json.dumps(price(minp))}'>{price(minp)[L]}</bdi></b></li>
        <li><b>{icon("check","ic sm")}</b>{tx("stat.nomacro")}</li>
      </ul>
      <p class="stores">{tx("hero.stores")} <a href="{PAYHIP_STORE}" target="_blank" rel="noopener">Payhip</a> · <a href="{ETSY_SHOP}" target="_blank" rel="noopener">Etsy</a></p>
    </div>
    <div class="hero-art" role="img" aria-label="{e(t("hero.alt"))}" data-i18n-aria="hero.alt">
      <img class="shot s1" src="assets/img/finnish-bookkeeping-vat-800.webp" width="800" height="600" alt="">
      <img class="shot s2" src="assets/img/sales-profit-dashboard-ar-480.webp" width="480" height="360" alt="">
      <img class="shot s3" src="assets/img/inventory-pro-480.webp" width="480" height="360" alt="">
      <span class="float f1">ALV 25,5 %</span>
      <span class="float f2"><span class="cellchip"></span>Excel</span>
    </div>
  </div>
</section>

<section class="sec" id="products">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker" data-i18n="products.kicker">{e(t("products.kicker"))}</p>
      <h2 data-i18n="products.title">{e(t("products.title"))}</h2>
      <p class="sub" data-i18n="products.sub">{e(t("products.sub"))}</p>
    </div>
    <div class="chips" role="group">{filters}</div>
    <div class="grid">{cards}
    </div>
  </div>
</section>

{DEMO_SEC}
<section class="sec" id="free">
  <div class="wrap">
    <div class="free">
      <div class="free-copy">
        <span class="badge-free" data-i18n="free.badge">{e(t("free.badge"))}</span>
        <h2 data-i18n="free.title">{e(t("free.title"))}</h2>
        <p data-i18n="free.text">{e(t("free.text"))}</p>
        <ul class="ticks">
          <li>{icon("check","ic sm")}{tx("free.p1")}</li>
          <li>{icon("check","ic sm")}{tx("free.p2")}</li>
          <li>{icon("check","ic sm")}{tx("free.p3")}</li>
        </ul>
        <div class="cta-row">
          <a class="btn btn-yellow btn-lg" href="{FREE['payhip']}" target="_blank" rel="noopener">{icon("download")}{tx("free.cta")}</a>
        </div>
        <p class="free-more"><a href="https://payhip.com/b/HwWAn" target="_blank" rel="noopener" data-i18n="free.more">{e(t("free.more"))}</a></p>
      </div>
      <div class="free-art"><img src="assets/img/free-calculator-800.webp" width="800" height="412" loading="lazy" decoding="async" alt="{e(t("free.alt"))}" data-alt-key="free.alt"></div>
    </div>
  </div>
</section>

<section class="sec sec-tint" id="why">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker" data-i18n="why.kicker">{e(t("why.kicker"))}</p>
      <h2 data-i18n="why.title">{e(t("why.title"))}</h2>
    </div>
    <ul class="why">{why}</ul>
    <p class="about" data-i18n="about">{e(t("about"))}</p>
  </div>
</section>

<section class="sec" id="how">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker" data-i18n="how.kicker">{e(t("how.kicker"))}</p>
      <h2 data-i18n="how.title">{e(t("how.title"))}</h2>
    </div>
    <ol class="steps">{how}</ol>
  </div>
</section>

<section class="sec sec-tint" id="faq">
  <div class="wrap narrow">
    <div class="sec-head">
      <p class="kicker" data-i18n="faq.kicker">{e(t("faq.kicker"))}</p>
      <h2 data-i18n="faq.title">{e(t("faq.title"))}</h2>
    </div>
    <div class="faq">{faq}</div>
  </div>
</section>

<section class="sec" id="custom">
  <div class="wrap">
    <div class="req-cta">
      <span class="contact-ic">{icon("cell")}</span>
      <div class="req-cta-copy">
        <p class="kicker" data-i18n="home.req.kicker">{e(t("home.req.kicker"))}</p>
        <h2 data-i18n="home.req.title">{e(t("home.req.title"))}</h2>
        <p data-i18n="home.req.text">{e(t("home.req.text"))}</p>
      </div>
      <a class="btn btn-primary btn-lg" href="custom-template.html">{tx("home.req.cta")}{icon("arrow","ic flip")}</a>
    </div>
  </div>
</section>

<section class="sec" id="contact">
  <div class="wrap">
    <div class="contact">
      <span class="contact-ic">{icon("mail")}</span>
      <p class="kicker" data-i18n="contact.kicker">{e(t("contact.kicker"))}</p>
      <h2 data-i18n="contact.title">{e(t("contact.title"))}</h2>
      <p data-i18n="contact.text">{e(t("contact.text"))}</p>
      <a class="btn btn-yellow btn-lg" href="mailto:{EMAIL}">{icon("mail")}{tx("contact.cta")}</a>
      <p class="mail"><a href="mailto:{EMAIL}"><bdi>{EMAIL}</bdi></a></p>
    </div>
  </div>
</section>
</main>

{FOOT}

<script>window.I18N={json.dumps(T, ensure_ascii=False, separators=(",",":")).replace("</","<\\/")};</script>
<script>window.DEMO={json.dumps(DEMO_DATA, ensure_ascii=False, separators=(",",":")).replace("</","<\\/")};</script>
<script src="assets/app.js" defer></script>
<script src="assets/demo.js" defer></script>
</body>
</html>
'''
open(f"{OUT}/index.html", "w", encoding="utf-8").write(doc)
print("written", len(doc))

# ---------- custom-template.html (Request a custom template) ----------
REQ_URL = SITE_URL + "custom-template.html"
req_steps = "".join(f'''<li class="step"><span class="step-n">{n}</span><span class="step-ic">{icon(ic)}</span><h3 data-i18n="req.how.{n}t">{e(t(f"req.how.{n}t"))}</h3><p data-i18n="req.how.{n}d">{e(t(f"req.how.{n}d"))}</p></li>'''
                    for n, ic in zip(range(1,4), ["mail","receipt","check"]))
req_opts = "".join(f'<option value="{k}" data-i18n="req.t.{k}">{e(t("req.t."+k))}</option>' for k in REQ_TYPES)
def lab(fid, key, req):
    extra = (f' <span class="req-star" aria-hidden="true">*</span><span class="sr" data-i18n="req.f.req">{e(t("req.f.req"))}</span>' if req
             else f' <span class="opt" data-i18n="req.f.opt">{e(t("req.f.opt"))}</span>')
    return f'<label for="{fid}"><span data-i18n="{key}">{e(t(key))}</span>{extra}</label>'
def err(fid, key):
    return f'<p class="f-err" id="{fid}-err" data-i18n="{key}" hidden>{e(t(key))}</p>'

req_types_li = "".join(f'<li>{icon("check","ic sm")}{tx("req.t."+k)}</li>' for k in REQ_TYPES[:5])

req_doc = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title data-i18n="req.meta.title">{e(t("req.meta.title"))}</title>
<meta name="description" content="{e(t("req.meta.desc"))}" data-i18n-content="req.meta.desc">
<meta name="author" content="Sadeek Trablsia">
<meta name="theme-color" content="#0e5a35">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SadeekShop">
<meta property="og:title" content="{e(t("req.meta.title"))}" data-i18n-content="req.meta.title">
<meta property="og:description" content="{e(t("req.meta.desc"))}" data-i18n-content="req.meta.desc">
<meta property="og:image" content="{og_img}">
<meta property="og:locale" content="ar_AR"><meta property="og:locale:alternate" content="en_US"><meta property="og:locale:alternate" content="fi_FI">
<meta property="og:url" content="{REQ_URL}">
<link rel="canonical" href="{REQ_URL}">
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="assets/icon-32.png">
<link rel="apple-touch-icon" href="assets/icon-180.png">
<link rel="preload" href="assets/fonts/cairo.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/style.css">
<script data-goatcounter="https://sadeekshop.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</head>
<body class="page-req">
<a class="skip" href="#main" data-i18n="skip">{e(t("skip"))}</a>

{header("index.html", ' aria-current="page"')}

<main id="main">
<section class="req-hero">
  <div class="wrap narrow">
    <p class="eyebrow" data-i18n="req.kicker">{e(t("req.kicker"))}</p>
    <h1 data-i18n="req.title">{e(t("req.title"))}</h1>
    <p class="lead" data-i18n="req.lead">{e(t("req.lead"))}</p>
    <ul class="req-types">{req_types_li}</ul>
    <p class="req-by">{tx("req.by")}</p>
  </div>
</section>

<section class="sec" id="how">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker" data-i18n="req.how.kicker">{e(t("req.how.kicker"))}</p>
      <h2 data-i18n="req.how.title">{e(t("req.how.title"))}</h2>
    </div>
    <ol class="steps">{req_steps}</ol>
  </div>
</section>

<section class="sec sec-tint" id="request">
  <div class="wrap narrow">
    <form class="req-form" id="reqForm" novalidate data-email="{EMAIL}">
      <h2 data-i18n="req.form.title">{e(t("req.form.title"))}</h2>
      <p class="f-note" data-i18n="req.form.note">{e(t("req.form.note"))}</p>
      <div class="f-row2">
        <div class="f">{lab("f-name","req.f.name",True)}<input id="f-name" name="name" type="text" autocomplete="name" required maxlength="120" aria-describedby="f-name-err">{err("f-name","req.err.name")}</div>
        <div class="f">{lab("f-email","req.f.email",True)}<input id="f-email" name="email" type="email" autocomplete="email" required maxlength="160" dir="ltr" aria-describedby="f-email-err">{err("f-email","req.err.email")}</div>
      </div>
      <div class="f">{lab("f-type","req.f.type",False).replace(f' <span class="opt" data-i18n="req.f.opt">{e(t("req.f.opt"))}</span>',"")}<select id="f-type" name="type">{req_opts}</select></div>
      <div class="f">{lab("f-desc","req.f.desc",True)}<textarea id="f-desc" name="desc" rows="6" required maxlength="3000" placeholder="{e(t("req.f.desc.ph"))}" data-i18n-ph="req.f.desc.ph" aria-describedby="f-desc-err"></textarea>{err("f-desc","req.err.desc")}</div>
      <div class="f-row2">
        <div class="f">{lab("f-deadline","req.f.deadline",False)}<input id="f-deadline" name="deadline" type="date"></div>
        <div class="f">{lab("f-budget","req.f.budget",False)}<input id="f-budget" name="budget" type="text" maxlength="60" placeholder="{e(t("req.f.budget.ph"))}" data-i18n-ph="req.f.budget.ph"></div>
      </div>
      <button class="btn btn-primary btn-lg" type="submit">{icon("mail")}{tx("req.submit")}</button>
      <p class="f-ok" id="reqOk" role="status" data-i18n="req.ok" hidden>{e(t("req.ok"))}</p>
      <p class="f-fallback"><span data-i18n="req.fallback">{e(t("req.fallback"))}</span> <a href="mailto:{EMAIL}"><bdi>{EMAIL}</bdi></a></p>
    </form>
  </div>
</section>
</main>

{FOOT}

<script>window.I18N={json.dumps(T, ensure_ascii=False, separators=(",",":")).replace("</","<\\/")};</script>
<script src="assets/app.js" defer></script>
<script src="assets/request.js" defer></script>
</body>
</html>
'''
open(f"{OUT}/custom-template.html", "w", encoding="utf-8").write(req_doc)
print("written custom-template.html", len(req_doc))

# ---------- SadeekShop help widget: knowledge file built from the content above ----------
import assistant_kb
assistant_kb.build(OUT, PRODUCTS, T, FREE, EMAIL, PAYHIP_STORE, ETSY_SHOP, SIKKA_SHOP)
