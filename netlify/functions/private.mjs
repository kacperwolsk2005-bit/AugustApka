// AugustApka – adresy tylko dla zalogowanych (np. folder OneDrive z materiałami od wykładowców).
// Adres NIE jest w kodzie ani w repozytorium: ustawia się go w Netlify jako zmienną środowiskową MATERIALS_URL.
const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

export const handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.sub) return json(401, { error: "Niezalogowany" });
  if (event.httpMethod !== "GET") return json(405, { error: "Tylko GET" });
  const links = {};
  const m = (process.env.MATERIALS_URL || "").trim();
  if (/^https:\/\//.test(m)) links.materialy = m;
  return json(200, { links });
};
