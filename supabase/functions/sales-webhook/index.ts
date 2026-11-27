// SkillPostApp – receives sales from Payhip and Gumroad and saves them in the "sales" table.
// Deploy in Supabase → Edge Functions → name: sales-webhook → turn OFF "Verify JWT" (the stores cannot log in).
// Secrets (Edge Functions → Secrets):
//   SALES_WEBHOOK_KEY  any long random text; it is part of the address you paste into Payhip / Gumroad
//   PAYHIP_API_KEY     (optional) Payhip → Settings → Developer → API key; used to check the message really comes from Payhip
//   RESEND_API_KEY     (optional) to get an email for every sale; RESEND_FROM (optional) the sender address
//   SITE_URL           (optional) default https://www.skillpostapp.com – used to read assets/links.json
// Addresses to paste in the stores:
//   Payhip:  https://<project>.supabase.co/functions/v1/sales-webhook?src=payhip&key=<SALES_WEBHOOK_KEY>
//   Gumroad: https://<project>.supabase.co/functions/v1/sales-webhook?src=gumroad&key=<SALES_WEBHOOK_KEY>
// Customer emails and IP addresses are NOT stored.

const SB = Deno.env.get("SUPABASE_URL") || "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE = (Deno.env.get("SITE_URL") || "https://www.skillpostapp.com").replace(/\/+$/, "");

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
function sameText(a, b) { // constant-time compare
  a = String(a || ""); b = String(b || "");
  if (!a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function rest(path, init = {}) {
  const h = { apikey: SR, "content-type": "application/json", ...(init.headers || {}) };
  if (!SR.startsWith("sb_")) h.authorization = "Bearer " + SR;
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: h });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
export function normLink(u) {
  try { const x = new URL(String(u)); return (x.hostname.replace(/^www\./, "") + x.pathname).toLowerCase().replace(/\/+$/, ""); }
  catch { return ""; }
}
async function slugFor(link) {
  if (!link) return "";
  try {
    const r = await fetch(SITE + "/assets/links.json", { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return "";
    const map = await r.json();
    return map[normLink(link)] || "";
  } catch { return ""; }
}
const money = (n, c) => `${Number(n).toFixed(2)} ${c || "EUR"}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function mailSale(sale) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const s = (await rest("alert_settings?id=eq.1&select=email,on_sale"))?.[0];
  if (!s || !s.on_sale || !s.email) return;
  const net = sale.amount - sale.fees;
  const subject = `💰 بيع جديد: ${sale.product || "منتج"} – ${money(sale.amount, sale.currency)}`;
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px">
<h2 style="margin:0 0 8px">بيع جديد عبر ${esc(sale.platform)}</h2>
<p><b>المنتج:</b> ${esc(sale.product || "-")}</p>
<p><b>المبلغ:</b> ${money(sale.amount, sale.currency)} — <b>الرسوم:</b> ${money(sale.fees, sale.currency)} — <b>الصافي:</b> ${money(net, sale.currency)}</p>
<p style="color:#666">التفاصيل في لوحة التحكم ← تبويب المبيعات.</p></div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") || "SkillPostApp <onboarding@resend.dev>", to: [s.email], subject, html }),
  }).catch(() => {});
}

// save a paid sale once (stores may send the same message again); returns true if it is new
async function savePaid(sale) {
  const rows = await rest("sales?on_conflict=id", {
    method: "POST",
    headers: { prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify(sale),
  });
  return Array.isArray(rows) && rows.length > 0;
}
async function saveRefund(sale, refunded, at) {
  const upd = await rest(`sales?id=eq.${encodeURIComponent(sale.id)}`, {
    method: "PATCH", headers: { prefer: "return=representation" },
    body: JSON.stringify({ refunded, refunded_at: at }),
  });
  if (!upd || !upd.length) await savePaid({ ...sale, refunded, refunded_at: at });
}

async function handlePayhip(req) {
  const b = await req.json();
  const apiKey = Deno.env.get("PAYHIP_API_KEY");
  if (apiKey && !sameText(b.signature, await sha256hex(apiKey))) return json(403, { error: "bad_signature" });
  if (!b || !b.id || (b.type !== "paid" && b.type !== "refunded")) return json(200, { ok: true, ignored: true });
  const items = Array.isArray(b.items) ? b.items : [];
  const link = items[0]?.product_permalink || "";
  const sale = {
    id: "payhip:" + String(b.id).slice(0, 80),
    platform: "payhip",
    sold_at: new Date(((b.date || b.date_created || Date.now() / 1000) * 1000)).toISOString(),
    product: items.map((i) => i.product_name).filter(Boolean).join(" + ").slice(0, 200),
    product_link: link,
    product_slug: await slugFor(link),
    amount: (Number(b.price) || 0) / 100,
    fees: ((Number(b.stripe_fee) || 0) + (Number(b.payhip_fee) || 0)) / 100,
    currency: String(b.currency || "EUR").toUpperCase().slice(0, 3),
    source: "webhook",
  };
  if (b.type === "refunded") {
    await saveRefund(sale, (Number(b.amount_refunded) || 0) / 100, new Date((b.date_refunded || Date.now() / 1000) * 1000).toISOString());
    return json(200, { ok: true });
  }
  if (await savePaid(sale)) await mailSale(sale);
  return json(200, { ok: true });
}

async function handleGumroad(req) {
  const f = await req.formData();
  const g = (k) => String(f.get(k) || "");
  if (!g("sale_id")) return json(200, { ok: true, ignored: true });
  const link = g("product_permalink") || (g("permalink") ? "https://gumroad.com/l/" + g("permalink") : "");
  const amount = (Number(g("price")) || 0) / 100;
  const sale = {
    id: "gumroad:" + g("sale_id").slice(0, 80),
    platform: "gumroad",
    sold_at: g("sale_timestamp") ? new Date(g("sale_timestamp")).toISOString() : new Date().toISOString(),
    product: g("product_name").slice(0, 200),
    product_link: link,
    product_slug: await slugFor(link),
    amount,
    fees: (Number(g("gumroad_fee")) || 0) / 100,
    currency: (g("currency") || "usd").toUpperCase().slice(0, 3),
    source: "webhook",
    note: g("test") === "true" ? "test" : "",
  };
  if (g("refunded") === "true") { await saveRefund(sale, amount, new Date().toISOString()); return json(200, { ok: true }); }
  if (await savePaid(sale)) await mailSale(sale);
  return json(200, { ok: true });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "post_only" });
  const url = new URL(req.url);
  const key = Deno.env.get("SALES_WEBHOOK_KEY") || "";
  if (!key || !sameText(url.searchParams.get("key"), key)) return json(403, { error: "forbidden" });
  try {
    const src = url.searchParams.get("src");
    if (src === "payhip") return await handlePayhip(req);
    if (src === "gumroad") return await handleGumroad(req);
    return json(400, { error: "unknown_src" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "failed" }); // the store will retry later
  }
});
