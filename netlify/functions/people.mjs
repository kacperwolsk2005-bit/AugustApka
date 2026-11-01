// AugustApka – lista urodzin i imienin rocznika + „kim jestem na liście” (tylko dla zalogowanych)
// Lista jest trzymana w Netlify Blobs, a nie w plikach strony, więc nikt spoza rocznika jej nie zobaczy.
import { connectLambda, getStore } from "@netlify/blobs";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  body: JSON.stringify(body),
});
const DM = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])$/;
const DMY = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(19|20)\d\d$/;

export const handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.sub) return json(401, { error: "Niezalogowany" });
  connectLambda(event);
  const store = getStore("augustapka-people");
  const rec = (await store.get("list", { type: "json" })) || { osoby: [], owner: null, updatedAt: null };
  rec.claims = rec.claims || {};   // { sub konta: "Imię Nazwisko" }

  // administrator: adresy z ADMIN_EMAILS (po przecinku), a jeśli ich nie ustawiono – osoba, która jako pierwsza zapisała listę
  const admins = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const email = (user.email || "").toLowerCase();
  const isAdmin = admins.length ? admins.includes(email) : (!rec.owner || rec.owner === user.sub);
  const names = new Set(rec.osoby.map((p) => p.imie));
  const out = (extra) => json(200, {
    osoby: rec.osoby, admin: isAdmin, updatedAt: rec.updatedAt,
    me: names.has(rec.claims[user.sub]) ? rec.claims[user.sub] : null,
    taken: Object.values(rec.claims).filter((n) => names.has(n)), ...extra,
  });

  if (event.httpMethod === "GET") return out();
  if (event.httpMethod !== "PUT" && event.httpMethod !== "POST") return json(405, { error: "Metoda niedozwolona" });
  let body;
  try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "{}")); }
  catch { return json(400, { error: "Zły format" }); }

  // „to jestem ja” – każdy może wskazać tylko siebie i tylko wolne miejsce
  if (body.action === "claim") {
    const n = String(body.imie || "");
    if (!names.has(n)) return json(400, { error: "Nie ma takiej osoby na liście" });
    const holder = Object.entries(rec.claims).find(([s, v]) => v === n && s !== user.sub);
    if (holder) return json(409, { error: "Ta osoba jest już przypisana do innego konta – poproś administratora o zwolnienie" });
    rec.claims[user.sub] = n;
    await store.setJSON("list", rec); return out({ ok: true });
  }
  if (body.action === "unclaim") { delete rec.claims[user.sub]; await store.setJSON("list", rec); return out({ ok: true }); }
  if (body.action === "release") {           // administrator zwalnia czyjeś przypisanie
    if (!isAdmin) return json(403, { error: "Tylko administrator" });
    for (const [s, v] of Object.entries(rec.claims)) if (v === body.imie) delete rec.claims[s];
    await store.setJSON("list", rec); return out({ ok: true });
  }

  if (!isAdmin) return json(403, { error: "Tylko administrator może zmieniać listę" });
  if (!Array.isArray(body.osoby)) return json(400, { error: "Brak listy" });
  const osoby = body.osoby.slice(0, 200).map((p) => ({
    imie: String(p.imie || "").trim().slice(0, 80),
    imieniny: DM.test(String(p.imieniny || "").trim()) ? String(p.imieniny).trim() : "",
    urodziny: DMY.test(String(p.urodziny || "").trim()) ? String(p.urodziny).trim() : "",
  })).filter((p) => p.imie && (p.imieniny || p.urodziny || body.allowEmpty));
  const saved = { osoby, owner: rec.owner || user.sub, updatedAt: Date.now(), claims: rec.claims };
  await store.setJSON("list", saved);
  Object.assign(rec, saved); names.clear(); osoby.forEach((p) => names.add(p.imie));
  return out({ ok: true });
};
