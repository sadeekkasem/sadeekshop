/* Admin page: adds/edits templates by committing to the GitHub repo with the owner's own token.
   The token is kept only in this browser (localStorage). Nothing secret is stored in the site. */
(function () {
  "use strict";
  var OWNER = "sadeekkasem", REPO = "sadeekshop", DATA = "src/products.json", KEY = "sadeekshop.admin.token";
  var qs = new URLSearchParams(location.search);
  var API = "https://api.github.com";
  var a = qs.get("api"); // local testing only
  if (a && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(a)) API = a;
  var BRANCH = /^[A-Za-z0-9._\/-]{1,80}$/.test(qs.get("branch") || "") ? qs.get("branch") : "main";
  var DRY = qs.get("dry") === "1";
  var REPO_URL = "https://github.com/" + OWNER + "/" + REPO;
  var SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, URL_RE = /^https:\/\/[^\s"'<>]+$/;
  var $ = function (id) { return document.getElementById(id); };

  var state = { doc: null, head: null, editing: null, cover: null, slides: [] };

  function token() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }

  // ---------- messages (always textContent, never HTML) ----------
  function msg(id, kind, text, links) {
    var el = $(id); el.hidden = false; el.className = "msg " + kind; el.textContent = text;
    (links || []).forEach(function (l) {
      el.appendChild(document.createElement("br"));
      var x = document.createElement("a"); x.href = l[1]; x.target = "_blank"; x.rel = "noopener"; x.textContent = l[0];
      el.appendChild(x);
    });
  }
  function errText(e) {
    if (e && e.arabic) return e.arabic;
    var s = e && e.status;
    if (s === 401) return "المفتاح غير صحيح أو انتهت صلاحيته. أنشئ مفتاحًا جديدًا والصقه من جديد.";
    if (s === 403) return "المفتاح لا يملك صلاحية كافية. تأكد أن صلاحية Contents مضبوطة على Read and write.";
    if (s === 404) return "لم يتم العثور على المستودع أو الملف. تأكد أن المفتاح يشمل المستودع " + OWNER + "/" + REPO + ".";
    if (s === 409 || s === 422) return "تغيّر المستودع أثناء الحفظ. اضغط «تحديث القائمة» ثم أعد المحاولة.";
    if (!s) return "تعذّر الاتصال بـ GitHub. تحقق من الإنترنت ثم أعد المحاولة.";
    return "حدث خطأ من GitHub (رمز " + s + "). أعد المحاولة بعد قليل.";
  }

  // ---------- GitHub API ----------
  function gh(method, path, body) {
    var t = token();
    if (!t) return Promise.reject({ arabic: "لا يوجد مفتاح محفوظ." });
    return fetch(API + path, {
      method: method, cache: "no-store",
      headers: { "Authorization": "Bearer " + t, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                 "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) throw { status: r.status };
      return r.status === 204 ? null : r.json();
    }, function () { throw { status: 0 }; });
  }
  var R = "/repos/" + OWNER + "/" + REPO;
  function b64ToUtf8(b) { var bin = atob(b.replace(/\s/g, "")); var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder("utf-8").decode(u); }
  function utf8ToB64(s) { var u = new TextEncoder().encode(s), bin = ""; for (var i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); }

  function load() {
    $("list").textContent = ""; msg("listMsg", "info", "جارٍ التحميل…");
    return gh("GET", R + "/git/ref/heads/" + BRANCH).then(function (ref) {
      state.head = ref.object.sha;
      return gh("GET", R + "/contents/" + DATA + "?ref=" + state.head);
    }).then(function (f) {
      var doc;
      try { doc = JSON.parse(b64ToUtf8(f.content)); } catch (e) { throw { arabic: "ملف القوالب src/products.json فيه خطأ في الكتابة. تراجع عن آخر تعديل (انظر الدليل) ثم حدّث الصفحة." }; }
      if (!doc || !Array.isArray(doc.products)) throw { arabic: "ملف القوالب لا يحتوي على قائمة products." };
      state.doc = doc; renderList(); $("listMsg").hidden = true;
    }).catch(function (e) { msg("listMsg", "err", errText(e)); });
  }

  function td(text, cls) { var c = document.createElement("td"); c.textContent = text; if (cls) c.className = cls; return c; }
  function renderList() {
    var tb = $("list"); tb.textContent = "";
    state.doc.products.forEach(function (p, i) {
      var tr = document.createElement("tr"); if (p.hidden) tr.className = "is-hidden";
      tr.appendChild(td(String(i + 1)));
      var n = td(p.name_ar || p.slug); var s = document.createElement("div"); s.className = "hint ltr"; s.textContent = p.slug; n.appendChild(s); tr.appendChild(n);
      tr.appendChild(td(p.price + " €", "price"));
      tr.appendChild(td(p.hidden ? "مخفي" : "ظاهر"));
      var c = document.createElement("td");
      var eb = document.createElement("button"); eb.type = "button"; eb.className = "sec"; eb.textContent = "تعديل"; eb.onclick = function () { openForm(i); };
      var hb = document.createElement("button"); hb.type = "button"; hb.className = p.hidden ? "sec" : "danger"; hb.textContent = p.hidden ? "إظهار" : "إخفاء";
      hb.onclick = function () { toggleHidden(i); };
      c.appendChild(eb); c.appendChild(document.createTextNode(" ")); c.appendChild(hb); tr.appendChild(c);
      tb.appendChild(tr);
    });
  }

  // ---------- form ----------
  var TEXT = ["slug", "name_ar", "name_en", "name_fi", "desc_ar", "desc_en", "desc_fi", "payhip", "etsy", "gumroad"];
  function checks(name) { return Array.prototype.slice.call(document.querySelectorAll('input[name="' + name + '"]')); }
  function openForm(i) {
    var p = i == null ? null : state.doc.products[i];
    state.editing = i == null ? null : i; state.cover = null; state.slides = [];
    $("form").reset(); $("imgPrev").hidden = true; $("slides").textContent = ""; $("formMsg").hidden = true;
    $("formTitle").textContent = p ? "٣. تعديل القالب: " + (p.name_ar || p.slug) : "٣. إضافة قالب جديد";
    $("f_slug").readOnly = !!p;
    $("imgHint").textContent = p ? "(اختياري: اختر صورة فقط إذا أردت تغيير الصورة الحالية)" : "(مطلوبة للقالب الجديد. JPG أو PNG، ويُفضّل بنسبة 4:3)";
    TEXT.forEach(function (k) { $("f_" + k).value = p ? (p[k] || "") : ""; });
    $("f_price").value = p ? p.price : ""; $("f_category").value = p ? p.category : "acc"; $("f_wide").checked = !!(p && p.wide);
    checks("lang").forEach(function (c) { c.checked = !!(p && (p.languages || []).indexOf(c.value) >= 0); });
    checks("badge").forEach(function (c) { c.checked = !!(p && (p.badges || []).indexOf(c.value) >= 0); });
    $("formBox").hidden = false; $("formBox").scrollIntoView({ behavior: "smooth" });
  }

  function readImage(file, maxW) {
    return new Promise(function (ok, bad) {
      if (!file) return ok(null);
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return bad({ arabic: "نوع الصورة غير مدعوم: " + file.name + ". استخدم JPG أو PNG." });
      if (file.size > 15 * 1024 * 1024) return bad({ arabic: "الصورة كبيرة جدًا (أكثر من 15 ميغابايت): " + file.name });
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var w = Math.min(maxW, im.naturalWidth), h = Math.round(im.naturalHeight * w / im.naturalWidth);
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(url);
        var d = c.toDataURL("image/jpeg", 0.92);
        ok({ b64: d.slice(d.indexOf(",") + 1), preview: d, w: w, h: h });
      };
      im.onerror = function () { bad({ arabic: "تعذّر فتح الصورة: " + file.name }); };
      im.src = url;
    });
  }

  function slideInputs(files) {
    var box = $("slides"); box.textContent = "";
    files.forEach(function (f, i) {
      var d = document.createElement("div"); d.className = "slide";
      var h = document.createElement("b"); h.textContent = "صورة العرض " + (i + 1) + ": " + f.name; d.appendChild(h);
      [["ar", "الوصف بالعربية", ""], ["en", "الوصف بالإنجليزية", "ltr"], ["fi", "الوصف بالفنلندية", "ltr"]].forEach(function (x) {
        var l = document.createElement("label"); l.textContent = x[1]; var inp = document.createElement("input");
        inp.type = "text"; inp.maxLength = 200; inp.className = x[2]; inp.id = "cap_" + i + "_" + x[0]; l.htmlFor = inp.id;
        d.appendChild(l); d.appendChild(inp);
      });
      box.appendChild(d);
    });
  }

  function collect() {
    var p = {}, errs = [];
    TEXT.forEach(function (k) { p[k] = $("f_" + k).value.trim(); });
    var old = state.editing == null ? null : state.doc.products[state.editing];
    var out = { slug: p.slug, hidden: old ? !!old.hidden : false,
      name_ar: p.name_ar, name_en: p.name_en, name_fi: p.name_fi, desc_ar: p.desc_ar, desc_en: p.desc_en, desc_fi: p.desc_fi,
      price: Number(String($("f_price").value).replace(",", ".")), languages: checks("lang").filter(function (c) { return c.checked; }).map(function (c) { return c.value; }),
      category: $("f_category").value, badges: checks("badge").filter(function (c) { return c.checked; }).map(function (c) { return c.value; }),
      payhip: p.payhip, etsy: p.etsy, gumroad: p.gumroad, wide: $("f_wide").checked, demo: old ? (old.demo || []) : [] };
    if (!SLUG.test(out.slug)) errs.push("الاسم المختصر (slug): حروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل cafe-stock.");
    else if (!old && state.doc.products.some(function (x) { return x.slug === out.slug; })) errs.push("الاسم المختصر (slug) مستخدم لقالب آخر. اختر اسمًا مختلفًا.");
    [["name_ar", "اسم القالب بالعربية"], ["name_en", "اسم القالب بالإنجليزية"], ["name_fi", "اسم القالب بالفنلندية"],
     ["desc_ar", "الوصف بالعربية"], ["desc_en", "الوصف بالإنجليزية"], ["desc_fi", "الوصف بالفنلندية"]].forEach(function (x) { if (!out[x[0]]) errs.push(x[1] + ": مطلوب."); });
    if (!(out.price > 0 && out.price <= 10000)) errs.push("السعر: اكتب رقمًا أكبر من صفر، مثل 17.");
    if (!out.languages.length) errs.push("اختر لغة واحدة على الأقل لملف القالب.");
    if (!URL_RE.test(out.payhip) && !(out.payhip === "" && URL_RE.test(out.etsy || ""))) errs.push("رابط Payhip مطلوب ويجب أن يبدأ بـ https://");
    if (out.etsy && !URL_RE.test(out.etsy)) errs.push("رابط Etsy يجب أن يبدأ بـ https:// أو يبقى فارغًا.");
    if (out.gumroad && !URL_RE.test(out.gumroad)) errs.push("رابط Gumroad يجب أن يبدأ بـ https:// أو يبقى فارغًا.");
    if (!old && !$("f_image").files[0]) errs.push("صورة القالب مطلوبة للقالب الجديد.");
    var demoFiles = Array.prototype.slice.call($("f_demo").files);
    if (demoFiles.length > 7) errs.push("صور العرض: 7 صور كحد أقصى.");
    var caps = demoFiles.map(function (_, i) {
      var c = { ar: $("cap_" + i + "_ar").value.trim(), en: $("cap_" + i + "_en").value.trim(), fi: $("cap_" + i + "_fi").value.trim() };
      if (!c.ar || !c.en || !c.fi) errs.push("صورة العرض " + (i + 1) + ": اكتب الوصف باللغات الثلاث.");
      return c;
    });
    if (demoFiles.length) out.demo = caps;
    return { p: out, errs: errs, demoFiles: demoFiles, isNew: !old };
  }

  // one commit for all files, so the site is rebuilt once
  function commit(files, message) {
    if (DRY) return Promise.resolve({ dry: true, files: files.map(function (f) { return f.path + " (" + Math.round(f.b64.length * 0.75 / 1024) + " KB)"; }) });
    var base;
    return gh("GET", R + "/git/ref/heads/" + BRANCH).then(function (ref) {
      if (ref.object.sha !== state.head) throw { arabic: "تم تعديل المستودع من مكان آخر بعد فتح الصفحة. اضغط «تحديث القائمة» ثم أعد المحاولة." };
      base = ref.object.sha;
      return gh("GET", R + "/git/commits/" + base);
    }).then(function (c) {
      return Promise.all(files.map(function (f) { return gh("POST", R + "/git/blobs", { content: f.b64, encoding: "base64" }).then(function (b) { return { path: f.path, mode: "100644", type: "blob", sha: b.sha }; }); }))
        .then(function (tree) { return gh("POST", R + "/git/trees", { base_tree: c.tree.sha, tree: tree }); });
    }).then(function (t) {
      return gh("POST", R + "/git/commits", { message: message, tree: t.sha, parents: [base] });
    }).then(function (nc) {
      return gh("PATCH", R + "/git/refs/heads/" + BRANCH, { sha: nc.sha, force: false }).then(function () { state.head = nc.sha; return nc; });
    });
  }

  function dataFile(doc) { return { path: DATA, b64: utf8ToB64(JSON.stringify(doc, null, 1) + "\n") }; }

  function done(id, res, text) {
    if (res.dry) { msg(id, "info", "وضع التجربة: لم يُحفظ شيء. كان سيتم حفظ:\n" + res.files.join("\n")); return; }
    msg(id, "ok", text + "\nيتم الآن تحديث الموقع تلقائيًا خلال دقيقتين تقريبًا. إذا ظهرت علامة ❌ حمراء في صفحة Actions فالموقع الحالي يبقى كما هو؛ افتح التشغيل لترى سبب الخطأ.",
      [["افتح صفحة Actions لمتابعة النشر", REPO_URL + "/actions"], ["عرض هذا الحفظ في GitHub", REPO_URL + "/commit/" + res.sha], ["افتح الموقع", "https://" + OWNER + ".github.io/" + REPO + "/"]]);
  }

  function save(ev) {
    ev.preventDefault();
    var c = collect();
    if (c.errs.length) { msg("formMsg", "err", "لم يتم الحفظ. صحّح ما يلي:\n• " + c.errs.join("\n• ")); return; }
    $("saveBtn").disabled = true; msg("formMsg", "info", "جارٍ تجهيز الصور والحفظ…");
    var files = [];
    readImage($("f_image").files[0], 1600).then(function (img) {
      if (img) files.push({ path: "src/images/" + c.p.slug + ".jpg", b64: img.b64 });
      return c.demoFiles.reduce(function (pr, f, i) {
        return pr.then(function () { return readImage(f, 1600).then(function (im) { files.push({ path: "src/images/" + c.p.slug + "-" + (i + 1) + ".jpg", b64: im.b64 }); }); });
      }, Promise.resolve());
    }).then(function () {
      var doc = JSON.parse(JSON.stringify(state.doc));
      if (c.isNew) doc.products.push(c.p); else doc.products[state.editing] = c.p;
      files.push(dataFile(doc));
      return commit(files, (c.isNew ? "Add template: " : "Update template: ") + c.p.slug).then(function (res) {
        if (!res.dry) { state.doc = doc; renderList(); }
        done("formMsg", res, c.isNew ? "✅ تمت إضافة القالب بنجاح." : "✅ تم حفظ التعديلات بنجاح.");
      });
    }).catch(function (e) { msg("formMsg", "err", "لم يتم الحفظ. " + errText(e)); })
      .then(function () { $("saveBtn").disabled = false; });
  }

  function toggleHidden(i) {
    var doc = JSON.parse(JSON.stringify(state.doc)), p = doc.products[i];
    p.hidden = !p.hidden;
    if (!confirm((p.hidden ? "إخفاء" : "إظهار") + " القالب «" + (p.name_ar || p.slug) + "» في الموقع؟")) return;
    msg("listMsg", "info", "جارٍ الحفظ…");
    commit([dataFile(doc)], (p.hidden ? "Hide template: " : "Show template: ") + p.slug).then(function (res) {
      if (!res.dry) { state.doc = doc; renderList(); }
      done("listMsg", res, p.hidden ? "✅ تم إخفاء القالب." : "✅ تم إظهار القالب.");
    }).catch(function (e) { msg("listMsg", "err", "لم يتم الحفظ. " + errText(e)); });
  }

  // ---------- token ----------
  function showToken() {
    var has = !!token();
    $("tokenNew").hidden = has; $("tokenHave").hidden = !has; $("app").hidden = !has;
    if (has) load();
  }
  $("tokenSave").onclick = function () {
    var v = $("tokenInput").value.trim(); $("tokenInput").value = "";
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(v)) { msg("tokenMsg", "err", "هذا لا يبدو مفتاحًا صحيحًا. انسخ المفتاح كاملًا من GitHub (يبدأ بـ github_pat_)."); return; }
    try { localStorage.setItem(KEY, v); } catch (e) { msg("tokenMsg", "err", "المتصفح لا يسمح بالحفظ. لا تستخدم وضع التصفح الخاص."); return; }
    msg("tokenMsg", "ok", "تم حفظ المفتاح في هذا المتصفح. اضغط «اختبار المفتاح» للتأكد."); showToken();
  };
  $("tokenDel").onclick = function () {
    if (!confirm("حذف المفتاح من هذا المتصفح؟")) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    state.doc = null; $("list").textContent = ""; $("formBox").hidden = true;
    msg("tokenMsg", "info", "تم حذف المفتاح من هذا المتصفح. لإلغائه نهائيًا احذفه أيضًا من إعدادات GitHub (انظر الدليل)."); showToken();
  };
  $("tokenTest").onclick = function () {
    msg("tokenMsg", "info", "جارٍ الاختبار…");
    gh("GET", R + "/contents/" + DATA + "?ref=" + BRANCH).then(function () {
      // a write test that changes nothing on the site: store a tiny unused blob
      return gh("POST", R + "/git/blobs", { content: "dGVzdA==", encoding: "base64" });
    }).then(function () { msg("tokenMsg", "ok", "✅ المفتاح يعمل: يمكنه القراءة والحفظ في المستودع " + OWNER + "/" + REPO + "."); })
      .catch(function (e) { msg("tokenMsg", "err", "❌ " + errText(e)); });
  };
  $("reload").onclick = load;
  $("addNew").onclick = function () { openForm(null); };
  $("cancelBtn").onclick = function () { $("formBox").hidden = true; };
  $("form").addEventListener("submit", save);
  $("f_image").onchange = function () {
    readImage(this.files[0], 600).then(function (im) { if (im) { $("imgPrev").src = im.preview; $("imgPrev").hidden = false; } })
      .catch(function (e) { msg("formMsg", "err", errText(e)); });
  };
  $("f_demo").onchange = function () { slideInputs(Array.prototype.slice.call(this.files)); };
  if (DRY) msg("tokenMsg", "info", "وضع التجربة مفعّل: لن يتم حفظ أي شيء.");
  showToken();
})();
