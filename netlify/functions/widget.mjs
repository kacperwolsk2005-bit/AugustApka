// AugustApka – widget z planem dnia (telefon i komputer)
// Aplikacja (zalogowany użytkownik) wysyła tu migawkę planu na najbliższe tygodnie.
// Widget (Scriptable na iPhonie, KWGT na Androidzie, strona /widget.html na komputerze) czyta ją
// prywatnym kluczem z linku – bez logowania. Klucz można w każdej chwili zmienić albo wyłączyć.
import { connectLambda, getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const HEAD = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const json = (statusCode, body) => ({ statusCode, headers: HEAD, body: JSON.stringify(body) });
const TZ = "Europe/Warsaw";

function nowPL() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return { d: `${g("year")}-${g("month")}-${g("day")}`, m: (+g("hour") % 24) * 60 + +g("minute") };
}
const toMin = (t) => { const [a, b] = String(t).split(":").map(Number); return a * 60 + (b || 0); };
const addD = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// gotowe teksty (np. dla KWGT na Androidzie): teraz / następne / reszta dnia / jutro
function texts(snap, now) {
  const day = (iso) => (snap.days || []).find((x) => x.d === iso);
  const T = day(now.d), J = day(addD(now.d, 1));
  const line = (b) => `${b.s}–${b.e}  ${b.t}`;
  const out = { date: now.d, stale: !T, now: "", next: "", today: "", all: "", tomorrow: "" };
  if (!T) { out.now = "Otwórz AugustApkę, żeby odświeżyć plan"; return out; }
  const bs = T.b || [];
  const cur = bs.find((b) => toMin(b.s) <= now.m && toMin(b.e) > now.m);
  const nxt = bs.find((b) => toMin(b.s) > now.m);
  const jf = J && (J.b || [])[0];
  out.now = cur ? `▶ ${line(cur)}` : nxt ? `Wolne do ${nxt.s}` : (jf ? `Jutro ${jf.s} · ${jf.t}` : (bs.length ? "Koniec planu na dziś" : (T.note || "Dziś nic nie zaplanowano")));
  out.next = nxt ? `Potem: ${line(nxt)}` : "";
  out.today = bs.filter((b) => toMin(b.e) > now.m).map((b) => (b === cur ? "▶ " : "") + line(b)).join("\n") || ((bs.length ? "Koniec planu na dziś" : (T.note || "Dziś nic nie zaplanowano")) + (J && (J.b || []).length ? "\n\nJutro:\n" + J.b.map(line).join("\n") : ""));
  out.all = bs.map(line).join("\n") || (T.note || "—");
  out.tomorrow = J ? ((J.b || []).map(line).join("\n") || J.note || "—") : "";
  return out;
}

export const handler = async (event, context) => {
  connectLambda(event);
  const store = getStore("augustapka-widget");
  const q = event.queryStringParameters || {};

  // ---- odczyt przez widget: ?k=<klucz>[&f=kw|txt] ----
  if (event.httpMethod === "GET" && q.k) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(q.k)) return json(400, { error: "Zły klucz" });
    const map = await store.get("t/" + q.k, { type: "json" });
    if (!map || !map.sub) return json(404, { error: "Nieznany klucz – skopiuj aktualny link z AugustApki (Kalendarz → Ustawienia → Widget)" });
    const rec = await store.get("s/" + map.sub, { type: "json" });
    if (!rec || !rec.snap) return json(404, { error: "Brak planu – otwórz AugustApkę" });
    const now = nowPL();
    if (q.f === "kw") return json(200, texts(rec.snap, now));
    if (q.f === "txt") {
      const t = texts(rec.snap, now);
      return { statusCode: 200, headers: { ...HEAD, "content-type": "text/plain; charset=utf-8" }, body: [t.now, t.next, "", t.today].filter((x, i) => x || i === 2).join("\n") };
    }
    return json(200, { now, at: rec.at, snap: rec.snap });
  }

  // ---- zapis i ustawienia: tylko zalogowany użytkownik ----
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.sub) return json(401, { error: "Niezalogowany" });
  const uk = "u/" + user.sub;
  const cur = (await store.get(uk, { type: "json" })) || {};

  if (event.httpMethod === "GET") return json(200, { tok: cur.tok || null, at: cur.at || null });

  if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
    if (raw.length > 600_000) return json(413, { error: "Za dużo danych" });
    let body; try { body = JSON.parse(raw); } catch { return json(400, { error: "Zły format" }); }
    const snap = body && body.snap;
    if (!snap || !Array.isArray(snap.days)) return json(400, { error: "Brak planu" });
    let tok = cur.tok;
    if (!tok || body.rotate) {
      if (tok) await store.delete("t/" + tok);
      tok = crypto.randomBytes(24).toString("base64url");
      await store.setJSON("t/" + tok, { sub: user.sub });
    }
    const at = Date.now();
    await store.setJSON("s/" + user.sub, { snap, at });
    await store.setJSON(uk, { tok, at });
    return json(200, { tok, at });
  }

  if (event.httpMethod === "DELETE") {
    if (cur.tok) await store.delete("t/" + cur.tok);
    await store.delete("s/" + user.sub);
    await store.delete(uk);
    return json(200, { ok: true });
  }
  return json(405, { error: "Metoda niedozwolona" });
};

