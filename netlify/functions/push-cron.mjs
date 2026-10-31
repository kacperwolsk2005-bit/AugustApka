// AugustApka – co godzinę wysyła przypomnienia tym, którzy wybrali tę godzinę (czas polski)
import { getStore } from "@netlify/blobs";
import webpush from "web-push";

export default async () => {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return new Response("Brak kluczy VAPID");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || process.env.URL || "https://augustapka.netlify.app", pub, priv);

  const now = new Date();
  const hour = parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" }).format(now), 10);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(now); // RRRR-MM-DD

  const store = getStore("augustapka-push");
  const { blobs } = await store.list({ prefix: "u/" });
  let sent = 0;
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: "json" });
    if (!rec || !rec.subs || !rec.subs.length) continue;
    const st = rec.settings || {};
    if ((st.hour ?? 19) !== hour || rec.sent === today) continue;
    const items = (rec.plan || []).filter((p) => p.d === today && st[p.kind] !== false);
    if (!items.length) continue;
    const dl = items.filter((p) => p.kind === "deadlines"), dy = items.filter((p) => p.kind === "daily");
    const title = dl.length ? "📅 " + dl[0].t : "📚 Czas na powtórkę";
    const lines = [...dl.slice(dl.length ? 1 : 0), ...dy].map((p) => p.t).slice(0, 4);
    const payload = JSON.stringify({ title, body: lines.join("\n") || "Otwórz AugustApkę i powtórz materiał.", url: "/#home", tag: "aug-" + today });
    const alive = [];
    for (const s of rec.subs) {
      try { await webpush.sendNotification(s, payload, { TTL: 6 * 3600 }); alive.push(s); sent++; }
      catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) alive.push(s); }
    }
    rec.subs = alive; rec.sent = today;
    await store.setJSON(b.key, rec);
  }
  return new Response("Wysłano: " + sent);
};

export const config = { schedule: "@hourly" };
