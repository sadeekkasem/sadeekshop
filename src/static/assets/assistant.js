/* SadeekShop help widget. Rule-based answers from assets/assistant-kb.json (built from the site content).
   No external calls, nothing stored or sent: questions stay in this browser tab. */
(function(){
  "use strict";
  var me = document.currentScript, base = me ? me.src.replace(/assistant\.js(\?.*)?$/, "") : "assets/";
  var KB = null, root = document.documentElement;
  var U = {
    ar:{title:"مساعد SadeekShop",sub:"أسئلة القوالب والشراء والتواصل",open:"مساعدة",close:"إغلاق",ph:"اكتب سؤالك…",send:"إرسال",
      hi:"أهلًا بك في SadeekShop! اسألني عن القوالب والأسعار وروابط الشراء، الدفع والتحميل، نظام ShipOps، أو طلب قالب خاص.",
      chips:["ما القوالب المتوفرة؟","كيف أدفع وأستلم الملف؟","ShipOps","قالب خاص","الحاسبة المجانية","تواصل"],
      unknown:"لا أملك إجابة مؤكدة على هذا السؤال، ولا أريد أن أخمّن. راسلنا على واتساب أو بالإيميل وسنرد عليك.",
      pwq:"كلمة السر (إن وُجدت) تصلك مع الملف بعد الشراء، ضمن ملف التعليمات. إذا فقدتها تواصل معنا على واتساب مع رقم الطلب ونساعدك.",
      pre:"مرحبا، سؤالي: ",subj:"سؤال من موقع SadeekShop",
      contact:"تقدر تتواصل معنا مباشرة:",wa:"واتساب",mail:"إيميل",
      list:"القوالب المتوفرة حاليًا ({n}):",listEnd:"اكتب اسم القالب أو كلمة منه (مثل فواتير، مخزون، رواتب) لتحصل على السعر ورابط الشراء.",
      price:"السعر",buy:"اشترِ من",langs:"لغات الملف",found:"وجدت هذه القوالب:",
      pay:"الشراء والتحميل:\n• الدفع آمن عبر Payhip أو Etsy (أو سكة SIKKA لبعض القوالب).\n• هي ملفات رقمية: بعد الدفع يظهر رابط التحميل فورًا ويصلك بالبريد، ولا يُشحن أي شيء.",
      ship:"ShipOps نظام لإدارة مكاتب الشحن والحوالات والتحصيل، يعمل من المتصفح بدون تنصيب.",plans:"الأسعار",more:"التفاصيل",
      shipSub:"الاشتراك يتم عبر واتساب.",
      custom:"لم تجد القالب المناسب؟ نصمم لك قالب Excel حسب طلبك. أرسل طلبك من صفحة القالب الخاص.",customBtn:"اطلب قالبًا خاصًا",
      free:"الحاسبة المجانية:",freeBtn:"حمّلها مجانًا",
      thanks:"العفو! إذا احتجت أي شيء آخر اسألني.",
      L:{ar:"عربي",en:"إنجليزي",fi:"فنلندي"}},
    en:{title:"SadeekShop help",sub:"Templates, buying and contact",open:"Help",close:"Close",ph:"Type your question…",send:"Send",
      hi:"Welcome to SadeekShop! Ask about templates, prices and buy links, payment and download, ShipOps, or a custom template.",
      chips:["Which templates do you have?","How do I pay and get the file?","ShipOps","Custom template","Free calculator","Contact"],
      unknown:"I don't have a confirmed answer to that and won't guess. Please message us on WhatsApp or by email and we'll get back to you.",
      pwq:"The password (if a file has one) comes with the file after purchase, in the instructions. If you lost it, message us on WhatsApp with your order number and we'll help.",
      pre:"Hi, my question: ",subj:"Question from the SadeekShop website",
      contact:"You can reach us directly:",wa:"WhatsApp",mail:"Email",
      list:"Templates available now ({n}):",listEnd:"Type a template name or a word from it (e.g. invoice, stock, payroll) to get the price and buy link.",
      price:"Price",buy:"Buy on",langs:"File languages",found:"I found these templates:",
      pay:"Buying and download:\n• Pay securely on Payhip or Etsy (some templates also on SIKKA).\n• These are digital files: after payment the download link appears at once and is emailed to you. Nothing is shipped.",
      ship:"ShipOps is a browser-based system for shipping, remittance and collection offices. No installation needed.",plans:"Pricing",more:"Details",
      shipSub:"Subscriptions are arranged on WhatsApp.",
      custom:"Can't find the right template? We can build an Excel template around your needs. Send a request on the custom template page.",customBtn:"Request a custom template",
      free:"Free calculator:",freeBtn:"Download free",
      thanks:"You're welcome! Ask me anything else.",
      L:{ar:"Arabic",en:"English",fi:"Finnish"}},
    fi:{title:"SadeekShop-apu",sub:"Pohjat, ostaminen ja yhteys",open:"Apua",close:"Sulje",ph:"Kirjoita kysymys…",send:"Lähetä",
      hi:"Tervetuloa SadeekShopiin! Kysy pohjista, hinnoista ja ostolinkeistä, maksusta ja latauksesta, ShipOpsista tai omasta pohjasta.",
      chips:["Mitä pohjia on?","Miten maksan ja saan tiedoston?","ShipOps","Oma pohja","Ilmainen laskuri","Yhteys"],
      unknown:"Minulla ei ole varmaa vastausta tähän, enkä arvaa. Lähetä viesti WhatsAppissa tai sähköpostilla, niin vastaamme.",
      pwq:"Salasana (jos tiedostossa on) tulee tiedoston mukana oston jälkeen ohjeissa. Jos se on hukassa, lähetä WhatsApp-viesti tilausnumerolla.",
      pre:"Hei, kysymykseni: ",subj:"Kysymys SadeekShop-sivustolta",
      contact:"Ota yhteyttä suoraan:",wa:"WhatsApp",mail:"Sähköposti",
      list:"Saatavilla olevat pohjat ({n}):",listEnd:"Kirjoita pohjan nimi tai sana siitä (esim. lasku, varasto, palkka) saadaksesi hinnan ja ostolinkin.",
      price:"Hinta",buy:"Osta",langs:"Tiedoston kielet",found:"Löysin nämä pohjat:",
      pay:"Ostaminen ja lataus:\n• Maksa turvallisesti Payhipissä tai Etsyssä (osa myös SIKKAssa).\n• Digitaalisia tiedostoja: latauslinkki näkyy heti maksun jälkeen ja tulee sähköpostiin. Mitään ei lähetetä postitse.",
      ship:"ShipOps on selaimessa toimiva järjestelmä lähetys-, rahansiirto- ja perintätoimistoille.",plans:"Hinnat",more:"Lisätiedot",
      shipSub:"Tilaus sovitaan WhatsAppissa.",
      custom:"Etkö löytänyt sopivaa? Teemme Excel-pohjan tarpeidesi mukaan. Lähetä pyyntö oman pohjan sivulla.",customBtn:"Tilaa oma pohja",
      free:"Ilmainen laskuri:",freeBtn:"Lataa ilmaiseksi",
      thanks:"Ole hyvä! Kysy lisää milloin vain.",
      L:{ar:"arabia",en:"englanti",fi:"suomi"}}
  };
  function lang(){ var l = (root.lang||"ar").slice(0,2); return U[l] ? l : "ar"; }
  function norm(s){
    return String(s||"").toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").replace(/ؤ/g,"و").replace(/ئ/g,"ي")
      .replace(/[äå]/g,"a").replace(/ö/g,"o")
      .replace(/[^\p{L}\p{N}\s$€]/gu," ").replace(/\s+/g," ").trim();
  }
  function stemAr(w){ // light prefix/suffix strip for Arabic words
    if (/[\u0600-\u06FF]/.test(w) && w.length > 4) { w = w.replace(/^(وال|بال|فال|كال|لل|ال)/,""); }
    if (/[\u0600-\u06FF]/.test(w) && w.length > 4) { w = w.replace(/(ات|ين|ون|ها|هم|ه)$/,""); }
    return w;
  }
  function toks(s){ return norm(s).split(" ").filter(function(w){ return w.length > 1; }).map(stemAr); }
  function lev(a,b){ if (Math.abs(a.length-b.length) > 2) return 9; var p=[],i,j; for(j=0;j<=b.length;j++)p[j]=j;
    for(i=1;i<=a.length;i++){var c=[i];for(j=1;j<=b.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c;} return p[b.length]; }
  function close(w,k){ if (w===k) return 1; if (k.length>=4 && w.indexOf(k)===0) return .9; var pre = (w.length>=5 && k.indexOf(w)===0) ? .6 : 0;
    var d = lev(w,k); return (k.length>=5 && d<=1) || (k.length>=8 && d<=2) ? .8 : pre; }
  // intent keywords (stems; typo-tolerant via close())
  var KW = {
    pwq:["كلمه","سر","باسورد","باسوورد","مرور","رمز","قفل","مقفل","password","passcode","pass","pwd","locked","unlock","salasana","lukittu"],
    contact:["تواصل","اتواصل","واتساب","واتس","وتساب","ايميل","بريد","رقم","موظف","انسان","شخص","تلفون","هاتف","contact","whatsapp","email","mail","phone","human","person","agent","support","yhteys","yhteystiedot","sahkoposti"],
    ship:["shipops","شيب","شحن","حوالات","تحصيل","مكتب","مكاتب","بوالص","بوليصه","اشتراك","shipping","office","remittance","courier","subscription","lahetys","toimisto"],
    custom:["خاص","حسب","طلب","مخصص","تصميم","custom","bespoke","tailor","request","made","oma","tilaa","tilaustyo"],
    free:["مجاني","مجانا","مجانيه","حاسبه","ببلاش","free","calculator","ilmainen","laskuri"],
    pay:["دفع","ادفع","الدفع","بطاقه","فيزا","باي","بال","تحميل","احمل","استلم","استلام","يوصل","يصل","توصيل","تنزيل","pay","payment","paypal","card","download","deliver","delivery","receive","get","file","maksu","maksaa","lataus","ladata","toimitus"],
    list:["قوالب","قالب","منتجات","منتج","عندكم","شو","ايش","ماذا","المتوفره","متوفر","templates","template","products","have","sell","available","pohjat","pohja","tuotteet"],
    price:["سعر","اسعار","بكم","كم","ثمن","تكلفه","price","prices","cost","much","hinta","maksaa"],
    hi:["مرحبا","اهلا","السلام","هاي","hello","hi","hey","moi","hei","terve"],
    thanks:["شكرا","مشكور","يسلمو","thanks","thank","kiitos"]
  };
  function score(qt, list){ var s=0; qt.forEach(function(w){ var b=0; list.forEach(function(k){ var c=close(w,stemAr(norm(k))); if(c>b)b=c; }); s+=b; }); return s; }
  var STOP = {"ال":1,"في":1,"من":1,"عن":1,"على":1,"هل":1,"ما":1,"كم":1,"the":1,"for":1,"and":1,"is":1,"of":1,"a":1,"do":1,"you":1,"how":1,"what":1,"excel":1,"قالب":1,"template":1,"pohja":1,"سعر":1,"price":1,"buy":1,"اشتري":1,"رابط":1,"link":1,"pro":1};
  function productMatches(qt){
    var res = [];
    KB.products.forEach(function(p){
      var words = toks([p.id.replace(/-/g," "), p.name.ar, p.name.en, p.name.fi].join(" ")), cw = KB.cats[p.cat] ? toks([KB.cats[p.cat].ar,KB.cats[p.cat].en,KB.cats[p.cat].fi].join(" ")) : [];
      var s = 0;
      qt.forEach(function(w){ if (STOP[w] || w.length < 3) return; var b=0; words.forEach(function(k){ if (STOP[k]) return; var c=close(w,k); if(c>b)b=c; });
        cw.forEach(function(k){ var c=close(w,k)*.85; if(c>b)b=c; }); s+=b; });
      if (s >= .8) res.push({p:p, s:s});
    });
    res.sort(function(a,b){ return b.s-a.s; });
    if (res.length && res[0].s >= 1.6) res = res.filter(function(r){ return r.s >= res[0].s - .5; });
    return res.slice(0,4).map(function(r){ return r.p; });
  }
  var PLAN = {en:{"شهري":"monthly","سنوي":"yearly"}, fi:{"شهري":"kuukausi","سنوي":"vuosi"}};
  function money(p,l){ return l==="en" ? "€"+p : p+" €"; }
  function links(arr){ return arr; }
  var CURQ = "";
  function waUrl(u){ return KB.contact.whatsapp + (CURQ ? "?text=" + encodeURIComponent(u.pre + CURQ) : ""); }
  function contactLinks(u){ return [{t:u.wa,h:waUrl(u),wa:1},
    {t:u.mail,h:"mailto:"+KB.contact.email+"?subject="+encodeURIComponent(u.subj)+(CURQ?"&body="+encodeURIComponent(u.pre+CURQ):"")}]; }
  function scrub(q){ return q.replace(/[^\s@]+@[^\s@]+/g,"[email]").replace(/\+?\d[\d\s().-]{5,}\d/g,"[number]").replace(/\s+/g," ").trim().slice(0,100); }
  function logMiss(q){ // save the unanswered question to the owner's questions sheet (text only, no personal data)
    try { var t = scrub(q); if (!KB.qurl || t.length < 3) return;
      fetch(KB.qurl, {method:"POST", mode:"no-cors", credentials:"omit", headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify({q:t, lang:lang(), page:(location.pathname.split("/").pop()||"index.html")})}).catch(function(){}); } catch(e){} }
  function sheetAnswers(){ // answers written in the questions sheet (also merged at build time)
    if (!KB.qurl) return;
    function use(items){ (items||[]).forEach(function(it){ if (!it || !it.q || !it.a) return; var kw = {}; kw[/^(ar|en|fi)$/.test(it.lang)?it.lang:"ar"] = [it.q].concat(it.kw||[]);
      KB.learned = KB.learned || []; KB.learned.push({kw:kw, a:{ar:it.a,en:it.a,fi:it.a}, links:[]}); }); }
    try { var c = sessionStorage.getItem("sa-sheet"); if (c) return use(JSON.parse(c)); } catch(e){}
    if (!window.fetch) return;
    var ctl = window.AbortController ? new AbortController() : null; if (ctl) setTimeout(function(){ ctl.abort(); }, 5000);
    fetch(KB.qurl, {credentials:"omit", signal:ctl?ctl.signal:undefined}).then(function(r){ return r.json(); }).then(function(j){
      var items = (j && j.items) || []; try { sessionStorage.setItem("sa-sheet", JSON.stringify(items)); } catch(e){} use(items); }).catch(function(){});
  }
  function learned(qt,n,l){
    var best=null, bs=0;
    (KB.learned||[]).forEach(function(e){ var s=0;
      ["ar","en","fi"].forEach(function(x){ (e.kw[x]||[]).forEach(function(k){
        var kn = norm(k); if (kn && (" "+n+" ").indexOf(" "+kn+" ") >= 0) { s = Math.max(s, 2 + kn.split(" ").length); return; }
        var kt = toks(k).filter(function(w){ return !STOP[w]; }); if (!kt.length) return;
        var m = 0; kt.forEach(function(w){ var b=0; qt.forEach(function(v){ var c=close(v,w); if(c>b)b=c; }); m+=b; });
        if (m/kt.length >= .8) s = Math.max(s, m); }); });
      if (s > bs) { bs = s; best = e; } });
    if (!best || bs < 1) return null;
    return {text:best.a[l], links:best.links.map(function(k){ return {t:typeof k.t==="string"?k.t:(k.t[l]||k.t.en), h:k.h}; })};
  }
  function prodText(p,l,u){
    var langs = p.langs.map(function(x){ return u.L[x]; }).join("، ".charAt(l==="ar"?0:1) === "،" ? "، " : ", ");
    return {text:"• "+p.name[l]+"\n"+u.price+": "+money(p.price,l)+"  ·  "+u.langs+": "+langs+"\n"+p.desc[l],
            links:p.buy.map(function(b){ return {t:u.buy+" "+b.via, h:b.url}; })};
  }
  function listAns(l,u){
    var lst = KB.products.map(function(p){ return "• "+p.name[l]+" — "+money(p.price,l); }).join("\n");
    return {text:u.list.replace("{n}",KB.products.length)+"\n"+lst+"\n\n"+u.listEnd, links:[{t:"Payhip",h:KB.stores.payhip},{t:"Etsy",h:KB.stores.etsy},{t:"SIKKA",h:KB.stores.sikka}]};
  }
  function answer(q){
    var l = lang(), u = U[l], qt = toks(q), n = norm(q); CURQ = String(q).trim().slice(0,300);
    if (!qt.length) return null;
    var S = {}; Object.keys(KW).forEach(function(k){ S[k] = score(qt, KW[k]); });
    if (S.pwq >= .8 && /سر|باسو|مرور|رمز|قفل|pass|pwd|lock|salasana|lukit/.test(n)) return {text:u.pwq, links:contactLinks(u)};
    var lr = learned(qt,n,l); if (lr) return lr;
    var pm = productMatches(qt.concat(qt.slice(1).map(function(w,i){ return qt[i]+w; }).filter(function(w){ return w.length>=8; })));
    if (S.ship >= .8 && (/shipops|شيب/.test(n) || S.ship >= 1.6)) {
      var s = KB.shipops; if (!s) return {text:u.unknown, links:contactLinks(u)};
      var t = u.ship + "\n" + u.plans + ": " + s.plans.map(function(p){ return (PLAN[l]&&PLAN[l][p.name]||p.name)+" "+p.price+p.cur; }).join(" · ") + (s.pay && l==="ar" ? "\n" + s.pay : "") + "\n" + u.shipSub;
      return {text:t, links:[{t:u.more+" ShipOps", h:s.url}].concat(contactLinks(u).slice(0,1))};
    }
    if (S.free >= .8 && KB.free) return {text:u.free+" "+(KB.free.title[l]||"")+"\n"+(KB.free.text[l]||""), links:[{t:u.freeBtn, h:KB.free.url}]};
    if (S.custom >= .8 && (!pm.length || S.custom >= 1.6 || /custom|خاص|مخصص/.test(n))) return {text:u.custom+(KB.custom.reply?"\n"+KB.custom.reply[l]:""), links:[{t:u.customBtn, h:KB.custom.url}].concat(contactLinks(u).slice(0,1))};
    if (pm.length) {
      var parts = pm.map(function(p){ return prodText(p,l,u); });
      if (parts.length === 1) return parts[0];
      return {text:u.found+"\n\n"+parts.map(function(x){ return x.text; }).join("\n\n"), links:[].concat.apply([], parts.map(function(x,i){ return x.links.slice(0,1).map(function(k){ return {t:pm[i].name[l].split(/[–(—]/)[0].trim()+" · "+k.t.split(" ").pop(), h:k.h}; }); }))};
    }
    if (S.list >= 1.6 && S.pay < .8) return listAns(l,u);
    // site FAQ (from the FAQ section)
    var best = null, bs = 0;
    KB.faq.forEach(function(f){ var ft = toks(f.q[l]+" "+f.q.en+" "+f.q.ar).filter(function(w){ return !STOP[w] && w.length>2; });
      var s = 0; qt.forEach(function(w){ if (STOP[w]||w.length<3) return; var b=0; ft.forEach(function(k){ var c=close(w,k); if(c>b)b=c; }); s+=b; }); if (s>bs){bs=s;best=f;} });
    if (best && bs >= (S.pay >= .8 ? 2 : 1.6)) return {text:best.a[l], links:[]};
    if (S.pay >= .8 && (S.pay >= S.list || S.pay >= 1.5)) return {text:u.pay, links:[]};
    if (S.contact >= .8) return {text:u.contact+"\nWhatsApp: +358 40 255 0588\n"+KB.contact.email, links:contactLinks(u)};
    if (S.list >= .8 || S.price >= .8) return listAns(l,u);
    if (S.thanks >= .8) return {text:u.thanks, links:[]};
    if (S.hi >= .8 && qt.length <= 3) return {text:u.hi, links:[]};
    return {text:u.unknown, links:contactLinks(u), miss:true};
  }
  // ---- UI ----
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 10a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1V14M12 17h.01"/></svg>';
  var css = document.createElement("link"); css.rel = "stylesheet"; css.href = base + "assistant.css"; document.head.appendChild(css);
  var btn = document.createElement("button"); btn.type = "button"; btn.className = "sa-btn"; btn.setAttribute("aria-expanded","false"); btn.setAttribute("aria-controls","saPanel");
  var panel = document.createElement("section"); panel.className = "sa-panel"; panel.id = "saPanel"; panel.hidden = true; panel.setAttribute("role","dialog");
  panel.innerHTML = '<div class="sa-head"><img src="'+base+'icon-72.png" alt=""><div><b></b><small></small></div><button type="button" class="sa-x">×</button></div>'+
    '<div class="sa-msgs" aria-live="polite"></div><div class="sa-chips"></div>'+
    '<form class="sa-form" autocomplete="off"><input type="text" maxlength="300" enterkeyhint="send"><button type="submit"></button></form>';
  document.body.appendChild(btn); document.body.appendChild(panel);
  var msgs = panel.querySelector(".sa-msgs"), input = panel.querySelector("input"), chips = panel.querySelector(".sa-chips"), started = false;
  function add(who, text, lk){
    var d = document.createElement("div"); d.className = "sa-m " + who; d.textContent = text;
    if (lk && lk.length) { var w = document.createElement("div"); w.className = "sa-links";
      lk.forEach(function(k){ var a = document.createElement("a"); a.href = k.h; a.textContent = k.t; if (k.wa) a.className = "wa";
        if (/^https?:/.test(k.h)) { a.target = "_blank"; a.rel = "noopener"; } w.appendChild(a); }); d.appendChild(w); }
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
  }
  function labels(){
    var u = U[lang()], l = lang();
    panel.dir = btn.dir = l === "ar" ? "rtl" : "ltr"; panel.lang = l;
    btn.innerHTML = ICON + "<span></span>"; btn.querySelector("span").textContent = u.open; btn.setAttribute("aria-label", u.title);
    panel.setAttribute("aria-label", u.title); panel.querySelector(".sa-head b").textContent = u.title; panel.querySelector(".sa-head small").textContent = u.sub;
    panel.querySelector(".sa-x").setAttribute("aria-label", u.close); input.placeholder = u.ph; input.setAttribute("aria-label", u.ph);
    panel.querySelector(".sa-form button").textContent = u.send;
    chips.innerHTML = ""; u.chips.forEach(function(c){ var b = document.createElement("button"); b.type = "button"; b.textContent = c; b.addEventListener("click", function(){ ask(c); }); chips.appendChild(b); });
  }
  function load(cb){ if (KB) return cb();
    fetch(base + "assistant-kb.json", {credentials:"omit"}).then(function(r){ return r.json(); }).then(function(j){ KB = j; sheetAnswers(); cb(); })
      .catch(function(){ KB = {products:[],faq:[],cats:{},contact:{whatsapp:"https://wa.me/358402550588",email:"sadeekkasem@gmail.com"},stores:{},custom:{}}; cb(); }); }
  function ask(q){ q = String(q).trim().slice(0,300); if (!q) return; add("me", q);
    load(function(){ var a = answer(q) || {text:U[lang()].unknown, links:contactLinks(U[lang()]), miss:true}; if (a.miss) logMiss(q); setTimeout(function(){ add("it", a.text, a.links); }, 150); }); }
  function open(){ panel.hidden = false; btn.setAttribute("aria-expanded","true");
    if (!started) { started = true; add("it", U[lang()].hi); load(function(){}); }
    setTimeout(function(){ input.focus({preventScroll:true}); }, 30); }
  function shut(){ panel.hidden = true; btn.setAttribute("aria-expanded","false"); btn.focus(); }
  btn.addEventListener("click", open); panel.querySelector(".sa-x").addEventListener("click", shut);
  panel.addEventListener("keydown", function(e){ if (e.key === "Escape") shut(); });
  panel.querySelector("form").addEventListener("submit", function(e){ e.preventDefault(); var q = input.value; input.value = ""; ask(q); });
  document.addEventListener("langchange", labels); labels();
  window.SadeekHelp = {answer:function(q){ return answer(q); }, load:load, scrub:function(q){ return scrub(q); }}; // used by the local test page only
})();
