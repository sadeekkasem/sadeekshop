// SkillPostApp – daily email report and alerts.
// Deploy in Supabase → Edge Functions → name: daily-report → turn OFF "Verify JWT".
// It is called every hour by GitHub (.github/workflows/alerts.yml). It sends at most:
//   • one daily report per day (after 07:00 Helsinki time), and
//   • one "no visits for 24 hours" alert per day.
// Calling it more often changes nothing, so the address can be public.
// The control panel can ask for a test email: POST {"test":true} with the administrator's login.
// Secrets: RESEND_API_KEY (required for email), RESEND_FROM (optional).

const SB = Deno.env.get("SUPABASE_URL") || "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TZ = "Europe/Helsinki";
const SEND_HOUR = 7;

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type" },
  });
}
async function rest(path, init = {}) {
  const h = { apikey: SR, "content-type": "application/json", ...(init.headers || {}) };
  if (!SR.startsWith("sb_")) h.authorization = "Bearer " + SR;
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: h });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

// ---- time in Helsinki ----
function parts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
function startOfDay(dateStr) { // Helsinki midnight of dateStr, as a real instant
  const guess = new Date(dateStr + "T00:00:00Z");
  const p = parts(guess);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - guess.getTime();
  return new Date(guess.getTime() - offset);
}
function addDays(dateStr, n) { const t = new Date(dateStr + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

// ---- data ----
async function events(from, to, kinds) {
  return await rest(`events?select=kind,product,store,ref&at=gte.${from.toISOString()}&at=lt.${to.toISOString()}&kind=in.(${kinds})&limit=100000`) || [];
}
async function sales(from, to) {
  return await rest(`sales?select=platform,product,product_slug,amount,fees,refunded,currency,note&sold_at=gte.${from.toISOString()}&sold_at=lt.${to.toISOString()}&limit=10000`) || [];
}
const count = (rows, kind) => rows.filter((r) => r.kind === kind).length;
function top(rows, key, n = 3) {
  const m = {}; rows.forEach((r) => { const k = r[key] || "(مباشر)"; m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
}
const net = (s) => Number(s.amount) - Number(s.fees) - Number(s.refunded);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function buildReport(today) {
  const day = addDays(today, -1);
  const from = startOfDay(day), to = startOfDay(today), weekFrom = startOfDay(addDays(today, -8));
  const ev = await events(from, to, "view,click");
  const week = await events(weekFrom, from, "view");
  const sl = (await sales(from, to)).filter((s) => s.note !== "test");
  const views = count(ev, "view"), clicks = count(ev, "click");
  const avg = week.length / 7;
  const notes = [];
  if (views >= 10 && views >= 2 * avg) {
    const src = top(ev.filter((r) => r.kind === "view"), "ref", 1)[0];
    notes.push(`📈 زيارات أمس (${views}) ضعف المعدل الأسبوعي (${avg.toFixed(0)}). المصدر الأكبر: ${src ? src[0] : "-"}.`);
  }
  if (avg >= 10 && views <= avg / 3) notes.push(`📉 زيارات أمس (${views}) أقل بكثير من المعدل الأسبوعي (${avg.toFixed(0)}).`);
  // products clicked a lot in the last 7 days without any sale
  const s7 = await sales(startOfDay(addDays(today, -7)), to);
  const c7 = await events(startOfDay(addDays(today, -7)), to, "click");
  const soldSlugs = new Set(s7.map((s) => s.product_slug).filter(Boolean));
  const byProd = {}; c7.forEach((r) => { if (r.product) byProd[r.product] = (byProd[r.product] || 0) + 1; });
  const stuck = Object.entries(byProd).filter(([p, n]) => n >= 10 && !soldSlugs.has(p)).sort((a, b) => b[1] - a[1]);
  return { day, views, clicks, avg, sales: sl, refs: top(ev.filter((r) => r.kind === "view"), "ref"), clickedProducts: top(ev.filter((r) => r.kind === "click"), "product"), notes, stuck };
}

function reportHtml(r, withStuck) {
  const total = r.sales.reduce((a, s) => a + net(s), 0);
  const rows = (list) => list.map(([k, n]) => `<li>${esc(k)}: <b>${n}</b></li>`).join("") || "<li>-</li>";
  const stuck = withStuck && r.stuck.length
    ? `<h3>⚠️ ضغطات كثيرة بلا بيع (آخر 7 أيام)</h3><ul>${r.stuck.map(([p, n]) => `<li>${esc(p)}: ${n} ضغطة ولا بيع — راجع صفحة المنتج في المتجر (الصور، الوصف، السعر).</li>`).join("")}</ul>` : "";
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7">
<h2 style="margin:0 0 6px">تقرير SkillPostApp ليوم ${r.day}</h2>
<p>👀 الزيارات: <b>${r.views}</b> &nbsp; 🖱️ الضغط على «اشترِ»: <b>${r.clicks}</b>${r.views ? ` (${((r.clicks / r.views) * 100).toFixed(1)}%)` : ""}</p>
<p>💰 المبيعات: <b>${r.sales.length}</b> — الصافي: <b>${total.toFixed(2)}</b></p>
${r.notes.map((n) => `<p>${esc(n)}</p>`).join("")}
<h3>من أين جاء الزوار</h3><ul>${rows(r.refs)}</ul>
<h3>أكثر المنتجات ضغطاً</h3><ul>${rows(r.clickedProducts)}</ul>
${stuck}
<p style="color:#666;font-size:13px">التفاصيل في لوحة التحكم ← الإحصاءات. لإيقاف هذه الرسائل: لوحة التحكم ← التنبيهات.</p></div>`;
}

async function mail(to, subject, html) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") || "SkillPostApp <onboarding@resend.dev>", to: [to], subject, html }),
  });
  if (!r.ok) throw new Error("email " + r.status + ": " + (await r.text()).slice(0, 200));
}

async function isAdmin(req) {
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return false;
  const u = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: req.headers.get("apikey") || SR, authorization: auth } });
  if (!u.ok) return false;
  const email = String((await u.json()).email || "").toLowerCase();
  if (!email) return false;
  const admins = await rest("admins?select=email") || [];
  return admins.some((a) => String(a.email).toLowerCase() === email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, {});
  try {
    let test = false;
    if (req.method === "POST") { try { test = !!(await req.json()).test; } catch { /* empty body */ } }
    if (test && !(await isAdmin(req))) return json(403, { error: "forbidden" });
    const st = (await rest("alert_settings?id=eq.1&select=*"))?.[0];
    if (!st || !st.email) return json(200, { ok: true, skipped: "no_email" });
    const now = parts(new Date()), today = now.date, sent = [];

    if (test) {
      const r = await buildReport(today);
      await mail(st.email, `✅ رسالة تجريبية – تقرير SkillPostApp`, reportHtml(r, st.clicks_no_sale));
      return json(200, { ok: true, sent: ["test"] });
    }

    if (st.no_visits && st.last_no_visit !== today) {
      const since = new Date(Date.now() - 24 * 3600e3);
      const recent = await rest(`events?select=id&kind=eq.view&at=gte.${since.toISOString()}&limit=1`) || [];
      const ever = await rest(`events?select=id&limit=1`) || [];
      if (ever.length && !recent.length) {
        await mail(st.email, "🔴 SkillPostApp: لا زيارات منذ 24 ساعة",
          `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif"><p>لم تُسجَّل أي زيارة للموقع خلال آخر 24 ساعة.</p><p>افتح <a href="https://www.skillpostapp.com">الموقع</a> وتأكد أنه يعمل، ثم راجع آخر عملية نشر في GitHub.</p></div>`);
        await rest("alert_settings?id=eq.1", { method: "PATCH", body: JSON.stringify({ last_no_visit: today }) });
        sent.push("no_visits");
      }
    }

    if (st.daily_report && now.hour >= SEND_HOUR && st.last_daily !== today) {
      // mark first, so two calls at the same moment cannot send two reports
      const claimed = await rest(`alert_settings?id=eq.1&or=(last_daily.is.null,last_daily.neq.${today})`, {
        method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ last_daily: today }),
      });
      if (claimed && claimed.length) {
        const r = await buildReport(today);
        try { await mail(st.email, `📊 تقرير SkillPostApp – ${r.day}: ${r.views} زيارة، ${r.sales.length} بيع`, reportHtml(r, st.clicks_no_sale)); sent.push("daily"); }
        catch (e) { await rest("alert_settings?id=eq.1", { method: "PATCH", body: JSON.stringify({ last_daily: st.last_daily }) }); throw e; }
      }
    }
    return json(200, { ok: true, sent });
  } catch (e) {
    console.error(e);
    return json(500, { error: String(e.message || e).slice(0, 200) });
  }
});
