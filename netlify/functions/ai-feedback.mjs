// AugustApka – funkcje AI (tylko zalogowani z rolą "ai": Netlify → Identity → użytkownik → Edit → Roles)
// Tryby: recall (ocena „Zamknij i wyjaśnij”), exam-gen / exam-grade (próbny egzamin),
//        ita-check / ita-chat (włoski: pisanie i rozmowa), ask (pytania do notatek),
//        plan-day (realny plan dnia), week-review (przegląd tygodnia)
// Zmienne środowiskowe (Netlify → Project configuration → Environment variables):
//   ANTHROPIC_API_KEY  – klucz z console.anthropic.com (oznacz jako secret)
//   AI_MODEL           – opcjonalnie, domyślnie "claude-haiku-5-5"
//   AI_DAILY_LIMIT     – opcjonalnie, domyślnie 20 użyć dziennie na osobę (wspólne dla wszystkich funkcji)
import { connectLambda, getStore } from "@netlify/blobs";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  body: JSON.stringify(body),
});
const cut = (s, n) => (typeof s === "string" ? s : "").slice(0, n);
const arr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
const day = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10); // ~czas polski
const STYLE = "Pisz po polsku, do studenta na „ty”, krótko i rzeczowo. Bez imion. Każdy punkt maks. ok. 200 znaków.";
const INT = (min, max) => ({ type: "integer", minimum: min, maximum: max });
const STR = { type: "string" };
const STRS = (max) => ({ type: "array", maxItems: max, items: STR });
const ERRS = { type: "array", maxItems: 8, items: { type: "object", properties: { twoje: { type: "string", description: "krótki cytat z odpowiedzi studenta" }, poprawnie: STR }, required: ["twoje", "poprawnie"] } };

// ile „użyć” z dziennego limitu zużywa jedno wywołanie
const UNITS = { recall: 1, "exam-gen": 1, "exam-grade": 0, "ita-check": 1, "ita-chat": 0.2, ask: 1, "plan-day": 1, "week-review": 1 };

/* ---------------- tryby ---------------- */
const MODES = {
  recall: {
    max: 3000,
    system: `Jesteś życzliwym, konkretnym korepetytorem studentów filozofii i teologii (seminarium duchowne). Student zamknął notatkę z wykładu i własnymi słowami (metodą Feynmana) wyjaśnił, co z niej pamięta. Porównaj jego wyjaśnienie z NOTATKĄ – to jedyny wzorzec.
Zasady:
- Oceniasz ZROZUMIENIE i SENS, nie sformułowania. Student mówi własnymi słowami, skrótami, innym porządkiem, z własnymi przykładami – to jest dokładnie to, czego chcemy. Parafraza, synonim, uogólnienie czy ujęcie „po swojemu” o tym samym sensie = treść ujęta POPRAWNIE i w pełni.
- Nie oceniasz ortografii, interpunkcji ani stylu. Nie poprawiaj literówek ani przekręconych nazw, jeśli wiadomo, o kogo/co chodzi.
- ZANIM wpiszesz coś do „brakuje” albo „bledy”, przeczytaj CAŁE wyjaśnienie jeszcze raz i sprawdź, czy ta sama myśl nie pada gdzieś indziej, innymi słowami, krócej albo ogólniej. Jeśli pada – NIE jest brakiem ani błędem (to „mial”). Wpisanie jako brak czegoś, co student napisał innymi słowami, to poważny błąd oceniającego.
- „Pomyłka” = tylko stwierdzenie wyraźnie SPRZECZNE z notatką albo merytorycznie fałszywe (pomylone osoby, daty, pojęcia, odwrócony sens). Uproszczenie, mniejsza precyzja, brak szczegółu czy inna kolejność to NIE pomyłka. Pominięcie to NIE pomyłka – najwyżej „brakuje”. W razie wątpliwości – rozstrzygaj na korzyść studenta.
- „procent” = w jakim stopniu student opanował NAJWAŻNIEJSZE treści (główne tezy, kluczowe pojęcia, nazwiska i daty, które notatka wyraźnie eksponuje). Drobne szczegóły, przykłady, dygresje i cytaty ważą mało. Treść ujęta częściowo albo ogólnie dostaje częściową punktację, nie zero. Orientacyjnie: główne myśli poprawnie i własnymi słowami, nawet bez szczegółów → 75–90%; większość głównych myśli, kilka luk → 55–75%; tylko część → 30–55%. Pytania, których student w ogóle nie ruszył, liczą się jako 0 – ale nie karz za nie podwójnie w pozostałych.
- „pytania” = dla każdego pytania z listy (od 1, w podanej kolejności) procent opanowania według tych samych zasad; 0 tylko gdy student go nie ruszył.
- „brakuje” = tylko NAPRAWDĘ ważne rzeczy, których w wyjaśnieniu nie ma w żadnej formie (najwyżej ok. 6, bez drobiazgów), z numerem pytania. Przy pytaniach bez odpowiedzi 1 zwięzły „haczyk” na pytanie.
- „dobrze” = konkretnie, co student ujął dobrze (także te rzeczy, które ujął innymi słowami).
- „cytaty” = krótkie (3–15 słów) fragmenty skopiowane DOSŁOWNIE z NOTATKI: „mial” – treści, które student ujął (choćby innymi słowami); „blad” – miejsca, z którymi pomyłki są sprzeczne; „brak” – ważne treści naprawdę pominięte.
- „nowe_pytania” = do 6 krótkich pytań kontrolnych o prawdziwe braki i pomyłki.
- „ocena”: 2 – umiał (≥70% i bez poważnych pomyłek), 1 – częściowo, 0 – nie umiał (poniżej ok. 35% albo poważne pomyłki w głównych tezach).
${STYLE} Podsumowanie: 2–3 zdania.`,
    tool: {
      procent: INT(0, 100), podsumowanie: STR,
      pytania: { type: "array", items: { type: "object", properties: { nr: { type: "integer" }, procent: INT(0, 100) }, required: ["nr", "procent"] } },
      dobrze: STRS(6), bledy: ERRS,
      brakuje: { type: "array", maxItems: 14, items: { type: "object", properties: { nr: { type: "integer" }, tekst: STR }, required: ["nr", "tekst"] } },
      cytaty: { type: "object", properties: { mial: STRS(10), blad: STRS(6), brak: STRS(10) } },
      nowe_pytania: STRS(6), ocena: { type: "integer", enum: [0, 1, 2] },
    },
    req: ["procent", "podsumowanie", "pytania", "dobrze", "bledy", "brakuje", "ocena"],
    build(b) {
      const note = cut(b.note, 40000), answer = cut(b.answer, 15000).trim();
      if (answer.length < 20) throw "Za krótka odpowiedź";
      if (note.length < 50) throw "Brak notatki";
      const qs = arr(b.questions, 30).map(q => cut(q, 300));
      return "TEMAT: " + cut(b.title, 200) + "\n\nPYTANIA (w tej kolejności):\n" + qs.map((q, i) => (i + 1) + ". " + q).join("\n") +
        "\n\n<notatka>\n" + note + "\n</notatka>\n\n<wyjasnienie_studenta>\n" + answer + "\n</wyjasnienie_studenta>";
    },
  },

  "exam-gen": {
    max: 5000,
    system: `Jesteś egzaminatorem na seminaryjnych studiach filozoficzno-teologicznych. Na podstawie NOTATEK z wykładów układasz próbny egzamin.
Zasady:
- Pytaj WYŁĄCZNIE o treści, które są w notatkach. Nie dodawaj faktów spoza nich.
- Pytania jak na prawdziwym egzaminie pisemnym: o najważniejsze zagadnienia, pojęcia, przyczyny i skutki, porównania, osoby, daty – nie o drobiazgi.
- Rozłóż pytania na różne notatki z zakresu. Notatki oznaczone jako SŁABE (tam student wcześniej słabo wypadł) traktuj częściej. Nie powtarzaj pytań z listy WCZEŚNIEJSZE.
- „otwarte”: jedno konkretne polecenie (np. „Wyjaśnij…”, „Porównaj…”, „Omów przyczyny…”); w „klucz” podaj 3–6 punktów, które powinna zawierać dobra odpowiedź (zwięźle, według notatki).
- „test”: jednokrotny wybór, dokładnie 4 odpowiedzi, jedna poprawna; dystraktory wiarygodne, z tego samego materiału (np. pomylone osoby, daty, pojęcia), podobnej długości co poprawna. Losowo rozmieszczaj poprawną odpowiedź. W „wyjasnienie” 1–2 zdania, dlaczego poprawna jest poprawna.
- „notatka” = id notatki, z której pochodzi pytanie.
Pisz po polsku.`,
    tool: {
      pytania: {
        type: "array", maxItems: 15, items: {
          type: "object", properties: {
            typ: { type: "string", enum: ["otwarte", "test"] }, tresc: STR,
            opcje: STRS(4), poprawna: INT(0, 3), wyjasnienie: STR,
            klucz: STRS(6), notatka: STR,
          }, required: ["typ", "tresc", "notatka"],
        },
      },
    },
    req: ["pytania"],
    build(b) {
      const notes = arr(b.notes, 40);
      let total = 0; const parts = [];
      for (const n of notes) { const t = cut(n.text, 20000); if (total + t.length > 90000) break; total += t.length;
        parts.push(`<notatka id="${cut(n.id, 20)}" tytul="${cut(n.title, 160).replace(/"/g, "'")}"${n.weak ? ' slaba="tak"' : ""}>\n${t}\n</notatka>`); }
      if (!parts.length) throw "Brak notatek w zakresie";
      const n = Math.max(3, Math.min(15, b.count | 0 || 8));
      const typ = b.typ === "otwarte" ? "same pytania otwarte" : b.typ === "test" ? "same pytania testowe (a–d)" : "mieszane: ok. połowa testowych (a–d), połowa otwartych";
      return `PRZEDMIOT: ${cut(b.subject, 100)}\nZAKRES: ${cut(b.scope, 200)}\nLICZBA PYTAŃ: ${n}\nRODZAJ: ${typ}\n` +
        (arr(b.prev, 40).length ? "WCZEŚNIEJSZE (nie powtarzaj):\n" + arr(b.prev, 40).map(q => "- " + cut(q, 200)).join("\n") + "\n" : "") +
        "\n" + parts.join("\n\n");
    },
  },

  "exam-grade": {
    max: 5000,
    system: `Jesteś egzaminatorem na seminaryjnych studiach filozoficzno-teologicznych. Oceniasz odpowiedzi na pytania otwarte z próbnego egzaminu. Wzorcem są NOTATKI i KLUCZ do każdego pytania.
Zasady:
- Oceniasz sens i zrozumienie, nie sformułowania, ortografię ani styl. Własne słowa, parafraza, synonim, ogólniejsze ujęcie albo inna kolejność o tym samym sensie = treść podana POPRAWNIE i w pełni.
- Zanim wpiszesz coś do „brakuje”, sprawdź całą odpowiedź – jeśli ta myśl pada w niej innymi słowami, to NIE jest brak.
- „procent” dla pytania = jak dobrze student ujął NAJWAŻNIEJSZE elementy klucza; drobne szczegóły ważą mało, ujęcie częściowe dostaje częściową punktację. Odpowiedź, która trafia w sedno własnymi słowami, to zwykle 75–100%. Brak odpowiedzi = 0. W razie wątpliwości – na korzyść studenta.
- „bledy” tylko dla stwierdzeń wyraźnie sprzecznych z notatkami lub fałszywych; uproszczenie czy brak szczegółu to nie błąd. Pominięcia trafiają do „brakuje” (tylko ważne).
- „plan” = 2–4 konkretne rzeczy do powtórki przed prawdziwym egzaminem, z id notatki.
${STYLE} Podsumowanie całości: 2–3 zdania.`,
    tool: {
      wyniki: {
        type: "array", items: {
          type: "object", properties: { nr: { type: "integer" }, procent: INT(0, 100), dobrze: STR, bledy: ERRS, brakuje: STRS(5) },
          required: ["nr", "procent"],
        },
      },
      podsumowanie: STR,
      plan: { type: "array", maxItems: 5, items: { type: "object", properties: { notatka: STR, co: STR }, required: ["co"] } },
    },
    req: ["wyniki", "podsumowanie"],
    build(b) {
      const qs = arr(b.questions, 15);
      if (!qs.length) throw "Brak pytań";
      const notes = arr(b.notes, 15); let total = 0; const parts = [];
      for (const n of notes) { const t = cut(n.text, 20000); if (total + t.length > 70000) break; total += t.length;
        parts.push(`<notatka id="${cut(n.id, 20)}" tytul="${cut(n.title, 160).replace(/"/g, "'")}">\n${t}\n</notatka>`); }
      return parts.join("\n\n") + "\n\nPYTANIA I ODPOWIEDZI STUDENTA:\n" + qs.map(q =>
        `<pytanie nr="${q.nr | 0}" notatka="${cut(q.notatka, 20)}">\n${cut(q.tresc, 600)}\nKLUCZ: ${arr(q.klucz, 6).map(k => cut(k, 300)).join(" | ")}\n<odpowiedz>${cut(q.odp, 6000) || "(brak odpowiedzi)"}</odpowiedz>\n</pytanie>`).join("\n");
    },
  },

  "ita-check": {
    max: 2500,
    system: `Jesteś cierpliwym lektorem włoskiego dla polskich seminarzystów na poziomie A1 (początek nauki). Sprawdzasz krótki tekst ucznia napisany do zadania.
Zasady:
- Rozbij tekst na zdania. Dla każdego: czy poprawne, a jeśli nie – poprawiona wersja i krótkie wyjaśnienie PO POLSKU (jaka reguła, prostymi słowami).
- Poprawiaj tylko rzeczywiste błędy (gramatyka, rodzajnik, końcówka, zgodność, słówko, akcent graficzny np. è/e). Nie zmieniaj poprawnych zdań na „ładniejsze”.
- Odnoś wyjaśnienia do materiału, który uczeń ZNA (lista poniżej). Jeśli błąd dotyczy rzeczy jeszcze nieprzerobionej, popraw i dopisz „(to jeszcze przed wami)”.
- „regula” = jedna najważniejsza reguła do zapamiętania z tego tekstu (lub pusta, gdy wszystko dobrze).
- „zadanie_ok” = czy tekst wykonuje polecenie.
- Na koniec 1 krótka zachęta lub wskazówka.`,
    tool: {
      zdania: {
        type: "array", maxItems: 15, items: {
          type: "object", properties: { tekst: STR, ok: { type: "boolean" }, poprawnie: STR, dlaczego: STR }, required: ["tekst", "ok"],
        },
      },
      regula: STR, zadanie_ok: { type: "boolean" }, uwaga: STR,
    },
    req: ["zdania"],
    build(b) {
      const t = cut(b.text, 3000).trim(); if (t.length < 5) throw "Za krótki tekst";
      return "UCZEŃ ZNA:\n" + cut(b.known, 6000) + "\n\nZADANIE: " + cut(b.task, 500) + "\n\n<tekst_ucznia>\n" + t + "\n</tekst_ucznia>";
    },
  },

  "ita-chat": {
    max: 900,
    system: `Prowadzisz krótką rozmowę po włosku z polskim seminarzystą na poziomie A1 (bardzo początkujący). Jesteś życzliwym włoskim kolegą.
Zasady:
- Odpowiadaj po włosku, BARDZO prosto: 1–2 krótkie zdania i zawsze jedno proste pytanie, żeby rozmowa szła dalej.
- Używaj tylko gramatyki i słownictwa, które uczeń ZNA (lista poniżej): czas teraźniejszy, essere/avere/chiamarsi, czasowniki na -are, liczby do 30 itd. Żadnych czasów przeszłych ani przyszłych.
- Trzymaj się tematu rozmowy, jeśli jest podany.
- Sprawdź OSTATNIĄ wiadomość ucznia: w „poprawki” wypisz realne błędy (zle → dobrze, dlaczego – po polsku, krótko). Gdy bez błędów – pusta lista.
- W „tlumaczenie” podaj polskie tłumaczenie swojej odpowiedzi.
- Jeśli uczeń pisze po polsku, odpowiedz po włosku i w „poprawki” podaj, jak powiedzieć jego zdanie po włosku.`,
    tool: {
      poprawki: { type: "array", maxItems: 5, items: { type: "object", properties: { zle: STR, dobrze: STR, dlaczego: STR }, required: ["zle", "dobrze"] } },
      odpowiedz: STR, tlumaczenie: STR,
    },
    req: ["poprawki", "odpowiedz", "tlumaczenie"],
    build(b) {
      const h = arr(b.history, 16).map(m => (m.role === "me" ? "UCZEŃ: " : "TY: ") + cut(m.text, 600)).join("\n");
      if (!h) throw "Pusta rozmowa";
      return "UCZEŃ ZNA:\n" + cut(b.known, 6000) + "\n\nTEMAT: " + (cut(b.topic, 200) || "swobodna rozmowa") + "\n\nROZMOWA:\n" + h;
    },
  },

  "plan-day": {
    max: 1800,
    system: `Jesteś trenerem organizacji czasu dla kleryka (seminarium duchowne, studia filozoficzno-teologiczne). Układasz REALNY plan nauki na jeden dzień.
Zasady:
- Stałych punktów (modlitwy, posiłki, zajęcia) nie ruszasz. Bloki wstawiasz WYŁĄCZNIE w podane wolne okna („okna”), bez nakładania na siebie i na istniejące bloki („moje”). Godziny w formacie HH:MM, pełne 5 minuty.
- Łączny czas nowych bloków nie przekracza „limit_min” (to 75% wolnego czasu minus to, co już zaplanowane). Między blokami nauki zostaw 10 min przerwy. Lepiej mniej i zrealizowane niż dużo i porzucone.
- Kolejność: najpilniejsze terminy (mało dni do kolokwium/egzaminu) i najtrudniejsze rzeczy w porze dnia, w której student ma najwyższe „tempo”. Jeśli tempo wieczorem jest niskie (<40%), nie planuj tam nic ważnego.
- Długość bloku: 30–60 min; jeśli ogólne tempo < 65%, raczej 30–45 min. Przedmiot często przesuwany – krótszy blok z konkretnym pierwszym krokiem.
- Jeśli są fiszki do powtórki, daj 15–20 min w krótkim oknie.
- „tytul” = konkretna czynność (np. „Logika: 10 zadań z relacji zakresowych”), nie sam przedmiot. „przedmiot” = id przedmiotu z listy albo "" (np. fiszki). „waznosc”: m = musi (termin ≤ 3 dni), s = powinno, c = jak starczy czasu.
- „nie_zmiesci” – co sensownie nie wejdzie dziś i kiedy to zrobić. „uwagi” – 1–2 zdania: dlaczego tak, na co uważać.
${STYLE}`,
    tool: {
      bloki: { type: "array", maxItems: 8, items: { type: "object", properties: { od: STR, do: STR, przedmiot: STR, tytul: STR, waznosc: { type: "string", enum: ["m", "s", "c"] }, dlaczego: STR }, required: ["od", "do", "przedmiot", "tytul", "waznosc", "dlaczego"] } },
      nie_zmiesci: { type: "array", maxItems: 6, items: { type: "object", properties: { co: STR, kiedy: STR }, required: ["co", "kiedy"] } },
      uwagi: STR,
    },
    req: ["bloki", "nie_zmiesci", "uwagi"],
    build(b) {
      const p = b.plan; if (!p || typeof p !== "object") throw "Brak danych planu";
      const s = JSON.stringify(p); if (s.length > 20000) throw "Za dużo danych";
      return "DANE DNIA (JSON):\n" + s + "\n\nUłóż realny plan nauki na ten dzień.";
    },
  },

  "week-review": {
    max: 1400,
    system: `Jesteś życzliwym, konkretnym trenerem organizacji czasu kleryka. Dostajesz statystyki minionego tygodnia: plan kontra wykonanie (minuty) według przedmiotów i pór dnia, przesunięcia, przeszkody, nastrój i energię, zapiski studenta.
Zasady:
- „dobrze” – 1–3 rzeczy, które realnie działają (z liczbami).
- „problemy” – 1–3 wzory, co się powtarza i sypie (np. przedmiot przesuwany wiele razy, niskie wykonanie wieczorem, za duże bloki). Bez moralizowania.
- „zmiana” – DOKŁADNIE JEDNA konkretna, mierzalna zmiana na kolejny tydzień (np. „Łacinę planuj po 35 min, 2× dziennie, przed obiadem”).
- „na_tydzien” – 1–3 krótkie wskazówki do planowania z uwzględnieniem terminów z najbliższych 2 tygodni.
- Nie wymyślaj danych, których nie ma. Gdy danych mało, powiedz to wprost i zaproponuj odhaczanie bloków.
${STYLE}`,
    tool: { dobrze: STRS(3), problemy: STRS(3), zmiana: STR, na_tydzien: STRS(3) },
    req: ["dobrze", "problemy", "zmiana", "na_tydzien"],
    build(b) {
      const r = b.review; if (!r || typeof r !== "object") throw "Brak danych tygodnia";
      const s = JSON.stringify(r); if (s.length > 15000) throw "Za dużo danych";
      return "TYDZIEŃ (JSON):\n" + s;
    },
  },

  ask: {
    max: 1500,
    system: `Odpowiadasz na pytania seminarzysty WYŁĄCZNIE na podstawie NOTATEK z wykładów, które dostajesz. Nie korzystasz z wiedzy spoza nich.
Zasady:
- Jeśli notatki nie zawierają odpowiedzi, ustaw „znaleziono” = false i napisz krótko, że w notatkach tego nie ma (nie zgaduj, nie uzupełniaj z pamięci). Możesz wskazać, co pokrewnego w nich jest.
- Odpowiedź zwięzła i konkretna (zwykle 2–6 zdań lub krótka lista). Możesz używać **pogrubień** i list zaczynanych od „- ”.
- „zrodla” = id notatek, z których faktycznie korzystasz.
- Pisz po polsku, na „ty”.`,
    tool: { odpowiedz: STR, znaleziono: { type: "boolean" }, zrodla: STRS(6) },
    req: ["odpowiedz", "znaleziono", "zrodla"],
    build(b) {
      const q = cut(b.question, 600).trim(); if (q.length < 3) throw "Za krótkie pytanie";
      const notes = arr(b.notes, 10); let total = 0; const parts = [];
      for (const n of notes) { const t = cut(n.text, 20000); if (total + t.length > 70000) break; total += t.length;
        parts.push(`<notatka id="${cut(n.id, 20)}" przedmiot="${cut(n.subject, 80)}" tytul="${cut(n.title, 160).replace(/"/g, "'")}">\n${t}\n</notatka>`); }
      const hist = arr(b.history, 6).map(m => "P: " + cut(m.q, 300) + "\nO: " + cut(m.a, 600)).join("\n");
      return parts.join("\n\n") + (hist ? "\n\nWCZEŚNIEJ W ROZMOWIE:\n" + hist : "") + "\n\nPYTANIE: " + q;
    },
  },
};

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Metoda niedozwolona" });
  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.sub) return json(401, { error: "Niezalogowany" });
  const roles = (user.app_metadata && user.app_metadata.roles) || [];
  if (!roles.includes("ai")) return json(403, { error: "Brak dostępu do funkcji AI" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(503, { error: "Brak klucza API (ANTHROPIC_API_KEY) w ustawieniach Netlify" });

  let b;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
    if (raw.length > 400000) return json(413, { error: "Za dużo danych" });
    b = JSON.parse(raw);
  } catch { return json(400, { error: "Zły format" }); }
  const mode = b.mode || "recall";
  const M = MODES[mode]; if (!M) return json(400, { error: "Nieznany tryb" });
  let userMsg; try { userMsg = M.build(b); } catch (e) { return json(400, { error: String(e) }); }

  // wspólny dzienny limit na osobę
  connectLambda(event);
  const store = getStore("augustapka-ai");
  const limit = parseFloat(process.env.AI_DAILY_LIMIT || "20");
  const dk = "d/" + day() + "/" + user.sub;
  const used = (await store.get(dk, { type: "json" })) || { n: 0, u: 0, calls: 0 };
  used.u = used.u ?? used.n ?? 0; used.calls = used.calls || 0;
  const units = UNITS[mode] ?? 1;
  if ((units > 0 && used.u + units > limit + 1e-9) || used.calls >= limit * 5)
    return json(429, { error: "Wykorzystano dzienny limit AI (" + limit + " użyć) – jutro znowu", limit, left: 0 });

  const model = process.env.AI_MODEL || "claude-haiku-5-5";
  const tool = { name: "wynik", description: "Zwróć wynik.", input_schema: { type: "object", properties: M.tool, required: M.req } };
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: M.max, system: M.system, tools: [tool], tool_choice: { type: "tool", name: "wynik" }, messages: [{ role: "user", content: userMsg }] }),
    });
  } catch (e) { return json(502, { error: "Brak połączenia z AI" }); }
  if (!r.ok) {
    let t = ""; try { t = (await r.text()).slice(0, 300); } catch {}
    console.error("anthropic", mode, r.status, t);
    return json(502, { error: r.status === 401 ? "Zły klucz API" : r.status === 429 || r.status === 529 ? "AI chwilowo przeciążone – spróbuj za minutę" : /credit/i.test(t) ? "Brak środków na koncie API" : r.status === 404 ? "Nieznany model AI (sprawdź AI_MODEL)" : "Błąd AI (" + r.status + ")" });
  }
  const data = await r.json();
  const tu = (data.content || []).find(c => c.type === "tool_use");
  if (!tu || !tu.input) return json(502, { error: "AI nie zwróciło wyniku" });

  const u = data.usage || {};
  used.u = Math.round((used.u + units) * 100) / 100; used.n = Math.floor(used.u); used.calls += 1;
  used.in = (used.in || 0) + (u.input_tokens || 0); used.out = (used.out || 0) + (u.output_tokens || 0);
  try {
    await store.setJSON(dk, used);
    const mk = "m/" + day().slice(0, 7) + "/" + user.sub;
    const m = (await store.get(mk, { type: "json" })) || { n: 0, in: 0, out: 0, modes: {}, email: user.email || null };
    m.n += 1; m.in += u.input_tokens || 0; m.out += u.output_tokens || 0; m.model = model; m.modes = m.modes || {}; m.modes[mode] = (m.modes[mode] || 0) + 1;
    await store.setJSON(mk, m);
  } catch (e) { console.error("blobs", e); }

  return json(200, { ok: true, result: tu.input, model, left: Math.max(0, Math.floor((limit - used.u) * 10) / 10), usage: { in: u.input_tokens || 0, out: u.output_tokens || 0 } });
};
