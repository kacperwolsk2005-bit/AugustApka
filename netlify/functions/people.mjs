// AugustApka – lista urodzin i imienin rocznika (tylko dla zalogowanych; edycja – tylko administrator)
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

  // administrator: adresy z ADMIN_EMAILS (po przecinku), a jeśli ich nie ustawiono – osoba, która jako pierwsza zapisała listę
  const admins = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const email = (user.email || "").toLowerCase();
  const isAdmin = admins.length ? admins.includes(email) : (!rec.owner || rec.owner === user.sub);

  if (event.httpMethod === "GET") return json(200, { osoby: rec.osoby, admin: isAdmin, updatedAt: rec.updatedAt });
  if (event.httpMethod !== "PUT" && event.httpMethod !== "POST") return json(405, { error: "Metoda niedozwolona" });
  if (!isAdmin) return json(403, { error: "Tylko administrator może zmieniać listę" });

  let body;
  try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "{}")); }
  catch { return json(400, { error: "Zły format" }); }
  if (!Array.isArray(body.osoby)) return json(400, { error: "Brak listy" });
  const osoby = body.osoby.slice(0, 200).map((p) => ({
    imie: String(p.imie || "").trim().slice(0, 80),
    imieniny: DM.test(String(p.imieniny || "").trim()) ? String(p.imieniny).trim() : "",
    urodziny: DMY.test(String(p.urodziny || "").trim()) ? String(p.urodziny).trim() : "",
  })).filter((p) => p.imie && (p.imieniny || p.urodziny));
  const out = { osoby, owner: rec.owner || user.sub, updatedAt: Date.now() };
  await store.setJSON("list", out);
  return json(200, { ok: true, osoby, admin: true });
};
