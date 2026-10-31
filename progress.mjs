// AugustApka – zapis postępów zalogowanego studenta (Netlify Blobs + Netlify Identity)
import { connectLambda, getStore } from "@netlify/blobs";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

export const handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.sub) return json(401, { error: "Niezalogowany" });

  connectLambda(event);
  const store = getStore("augustapka-progress");
  const key = "u/" + user.sub;

  if (event.httpMethod === "GET") {
    const saved = await store.get(key, { type: "json" });
    return json(200, saved || { data: null });
  }

  if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
    if (raw.length > 4_000_000) return json(413, { error: "Za dużo danych" });
    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { error: "Zły format" }); }
    if (!body || typeof body.data !== "object" || body.data === null) return json(400, { error: "Brak danych" });
    const updatedAt = Date.now();
    await store.setJSON(key, { data: body.data, updatedAt, email: user.email || null });
    return json(200, { ok: true, updatedAt });
  }

  return json(405, { error: "Metoda niedozwolona" });
};
