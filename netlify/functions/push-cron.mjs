// AugustApka – co godzinę wysyła przypomnienia tym, którzy wybrali tę godzinę (czas polski)
import { getStore } from "@netlify/blobs";
import webpush from "web-push";


const BDAY_HOUR = 7;
const lat = (n) => n + " " + ((n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? "lata" : "lat");
// lista rocznika z Netlify Blobs (zapisywana w aplikacji – patrz people.mjs)
async function todaysParty(today) {
  try {
    const rec = await getStore("augustapka-people").get("list", { type: "json" });
    const osoby = rec && Array.isArray(rec.osoby) ? rec.osoby : [];
    const dm = today.slice(8, 10) + "." + today.slice(5, 7), y = +today.slice(0, 4);
    const bd = osoby.filter((p) => (p.urodziny || "").slice(0, 5) === dm);
    const nd = osoby.filter((p) => p.imieniny && p.imieniny.slice(0, 5) === dm);
    if (!bd.length && !nd.length) return null;
    const bdTxt = bd.map((p) => { const by = +(p.urodziny || "").slice(6, 10); return p.imie + (by ? " (" + lat(y - by) + ")" : ""); });
    const title = bd.length ? "🎂 Urodziny: " + bdTxt.join(", ") : "😇 Imieniny: " + nd.map((p) => p.imie).join(", ");
    const lines = [];
    if (bd.length && nd.length) lines.push("😇 Imieniny: " + nd.map((p) => p.imie).join(", "));
    lines.push("Nie zapomnij złożyć życzeń i pomodlić się za solenizanta! 🎉");
    return { title, body: lines.join("\n") };
  } catch { return null; }
}

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

  // 🎂 urodziny i imieniny rocznika – o 7:00 do WSZYSTKICH urządzeń z włączonymi powiadomieniami (bez możliwości wyłączenia w aplikacji)
  if (hour === BDAY_HOUR) {
    const party = await todaysParty(today);
    if (party) {
      const payload = JSON.stringify({ title: party.title, body: party.body, url: "/#home", tag: "aug-bday-" + today });
      for (const b of blobs) {
        const rec = await store.get(b.key, { type: "json" });
        if (!rec || !rec.subs || !rec.subs.length || rec.bday === today) continue;
        const alive = [];
        for (const s of rec.subs) {
          try { await webpush.sendNotification(s, payload, { TTL: 10 * 3600 }); alive.push(s); sent++; }
          catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) alive.push(s); }
        }
        rec.subs = alive; rec.bday = today;
        await store.setJSON(b.key, rec);
      }
    }
  }

  for (const b of blobs) {
    const rec = await store.get(b.key, { type: "json" });
    if (!rec || !rec.subs || !rec.subs.length) continue;
    const st = rec.settings || {};
    if ((st.hour ?? 19) !== hour || rec.sent === today) continue;
    const items = (rec.plan || []).filter((p) => p.d === today && st[p.kind] !== false);
    if (!items.length) continue;
    const dl = items.filter((p) => p.kind === "deadlines"), dy = items.filter((p) => p.kind === "daily");
    const all = [...dl, ...dy];
    const title = dl.length ? "📅 " + dl[0].t : all[0].t;
    const lines = all.slice(1).map((p) => p.t).slice(0, 4);
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
