// AugustApka – zapis subskrypcji powiadomień push i ustawień zalogowanego studenta
import { connectLambda, getStore } from "@netlify/blobs";
import webpush from "web-push";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  body: JSON.stringify(body),
});
const SUBJECT = () => process.env.VAPID_SUBJECT || process.env.URL || "https://augustapka.netlify.app";

export const handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.sub) return json(401, { error: "Niezalogowany" });
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;

  connectLambda(event);
  const store = getStore("augustapka-push");
  const key = "u/" + user.sub;
  const rec = (await store.get(key, { type: "json" })) || { subs: [], settings: { hour: 19, deadlines: true, daily: true }, plan: [], sent: null };

  if (event.httpMethod === "GET") {
    return json(200, { publicKey: pub || null, configured: !!(pub && priv), settings: rec.settings, devices: rec.subs.length });
  }
  if (event.httpMethod !== "POST") return json(405, { error: "Metoda niedozwolona" });

  let body;
  try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "{}")); }
  catch { return json(400, { error: "Zły format" }); }
  const clean = (s) => ({
    hour: (() => { const h = parseInt(s && s.hour, 10); return Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 19; })(),
    deadlines: !(s && s.deadlines === false),
    daily: !(s && s.daily === false),
  });

  if (body.settings) rec.settings = clean(body.settings);
  if (Array.isArray(body.plan)) rec.plan = body.plan.slice(0, 120).map((p) => ({ d: String(p.d).slice(0, 10), kind: p.kind === "daily" ? "daily" : "deadlines", t: String(p.t || "").slice(0, 160) }));

  if (body.action === "subscribe" && body.sub && body.sub.endpoint) {
    rec.subs = rec.subs.filter((s) => s.endpoint !== body.sub.endpoint);
    rec.subs.push({ endpoint: body.sub.endpoint, keys: body.sub.keys, ua: String(body.ua || "").slice(0, 80), at: Date.now() });
    rec.subs = rec.subs.slice(-6);
  }
  if (body.action === "unsubscribe" && body.endpoint) rec.subs = rec.subs.filter((s) => s.endpoint !== body.endpoint);

  let tested = null;
  if (body.action === "test") {
    if (!pub || !priv) return json(500, { error: "Brak kluczy VAPID w ustawieniach Netlify" });
    webpush.setVapidDetails(SUBJECT(), pub, priv);
    const payload = JSON.stringify({ title: "AugustApka 🔔", body: "Powiadomienia działają! Tak będą wyglądać przypomnienia.", url: "/#profil", tag: "aug-test" });
    let ok = 0; const alive = []; var errors = [];
    for (const s of rec.subs) {
      try { await webpush.sendNotification(s, payload, { TTL: 600 }); ok++; alive.push(s); }
      catch (e) {
        errors.push({ status: e.statusCode || null, msg: String(e.body || e.message || e).slice(0, 200), host: (() => { try { return new URL(s.endpoint).host; } catch { return "?"; } })() });
        if (e.statusCode !== 404 && e.statusCode !== 410) alive.push(s);
      }
    }
    rec.subs = alive; tested = ok;
  }
  rec.email = user.email || null;
  await store.setJSON(key, rec);
  return json(200, { ok: true, devices: rec.subs.length, tested, errors: typeof errors !== "undefined" ? errors : undefined, settings: rec.settings });
};
