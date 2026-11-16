# AugustApka na Netlify: logowanie, synchronizacja, instalacja na telefonie

## 1. Wgraj pliki do repozytorium na GitHubie
Wrzuć do repozytorium **całą zawartość tej paczki** z zachowaniem folderów (stary `index.html` zostanie zastąpiony):

```
index.html
sw.js
manifest.webmanifest
netlify.toml
package.json
icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
netlify/functions/progress.mjs, push-subscribe.mjs, push-cron.mjs   ← te pliki MUSZĄ być w folderach netlify/functions
```

Najprościej przez stronę GitHuba: **Add file → Upload files**, przeciągnij wszystkie pliki i foldery naraz, potem **Commit changes**. Netlify sam zbuduje stronę. Przy pierwszym wdrożeniu zainstaluje też dodatek `@netlify/blobs` (miejsce na postępy studentów), więc może to potrwać minutę dłużej.

## 2. Włącz logowanie (raz)
W panelu Netlify, w swojej stronie:
1. Wejdź w **Identity** i kliknij **Enable Identity**.
2. W ustawieniach Identity, w części **Registration**, wybierz **Invite only**, żeby konta mogli zakładać tylko zaproszeni.
3. W zakładce **Identity** kliknij **Invite users** i wpisz adresy e-mail kolegów z rocznika (i swój).
4. Każdy dostanie maila z zaproszeniem. Po kliknięciu w link otworzy się AugustApka z okienkiem do ustawienia hasła.

Miejsce na postępy (Netlify Blobs) działa samo i nie wymaga konfiguracji.

## 3. Jak to działa
- Każdy student ma swoje konto i swój profil (ikonka z inicjałami u góry → „Mój profil”).
- Postęp zapisuje się na koncie kilka sekund po każdej zmianie, a pobiera przy otwarciu aplikacji i przy powrocie do niej. Dotyczy to koszyków fiszek, powtórek, własnych notatek, pytań Cornella, terminów i statystyk.
- Gdy dwa urządzenia zmienią to samo, zostaje nowsza zmiana.
- Bez internetu aplikacja dalej działa, a zmiany wyśle, gdy internet wróci.
- Kiedy na tym samym telefonie zaloguje się inny student, zaczyna od własnego postępu, a nie od cudzego.
- Pod przyciskiem logowania jest opcja „Kontynuuj bez konta”. Postęp jest wtedy zapisywany tylko na tym urządzeniu.

**Ważne:** logowanie chroni postępy każdego studenta. Same notatki są jednak częścią strony, więc ktoś, kto zna adres i umie zajrzeć w kod strony, może je przeczytać. Zablokowanie całej strony hasłem to osobna, płatna funkcja Netlify.

## 4. Instalacja na telefonie
- **Android (Chrome):** otwórz stronę, menu ⋮ → **Zainstaluj aplikację** (albo **Dodaj do ekranu głównego**).
- **iPhone (Safari):** przycisk **Udostępnij** → **Do ekranu początkowego**.

Aplikacja dostaje własną ikonę i otwiera się na pełnym ekranie, bez paska przeglądarki. Gdy wgrasz nową wersję, pobierze ją sama przy następnym otwarciu z internetem.

## 5. Kolejne aktualizacje
Zwykle zmienia się tylko `index.html`, więc wystarczy podmienić ten jeden plik, tak jak dotąd.

## 6. Powiadomienia push
W Netlify (**Project configuration → Environment variables**) muszą być dwie zmienne: `VAPID_PUBLIC_KEY` i `VAPID_PRIVATE_KEY`. Klucz prywatny jest tajny: nie wrzucaj go do repozytorium. Funkcja `push-cron` uruchamia się co godzinę i wysyła przypomnienia tym, którzy wybrali tę godzinę w profilu.

## 7. Funkcje AI (tylko konta z rolą `ai`)
Konta z rolą `ai` mają:
- **ocenę AI w „Zamknij i wyjaśnij”**: wynik w %, pomyłki, braki, podświetlenia w notatce i propozycję oceny;
- **🎓 Próbny egzamin** (zakładka w każdym przedmiocie z notatkami): zakres egzaminu, pytania otwarte, test albo mieszany, wynik, omówienie i plan powtórki;
- **✍️ Pisanie z AI** i **💬 Rozmowa z AI** we włoskim, tylko z przerobionego materiału;
- **✨ Zapytaj notatki**: pole na stronie startowej i przycisk w wyszukiwarce; odpowiedzi tylko z opublikowanych notatek, ze źródłem.

Reszta nie ma po tych funkcjach żadnego śladu.

1. **Klucz API:** na console.anthropic.com doładuj kredyty i utwórz klucz (API Keys → Create Key).
2. **Netlify → Project configuration → Environment variables:** dodaj `ANTHROPIC_API_KEY` = ten klucz i zaznacz, że jest tajny (secret). Nie wrzucaj go do repozytorium.
   - opcjonalnie `AI_MODEL`: domyślnie `claude-haiku-5-5`; lepszy, droższy: `claude-sonnet-5-5`,
   - opcjonalnie `AI_DAILY_LIMIT`: domyślnie 20 użyć dziennie na osobę, wspólnie dla wszystkich funkcji. Jedno użycie to ocena, egzamin (losowanie pytań; ocena odpowiedzi gratis), sprawdzenie tekstu albo pytanie do notatek. Wiadomość w rozmowie po włosku to 0,2 użycia.
3. **Plik funkcji:** wgraj do repozytorium `netlify/functions/ai-feedback.mjs` (obok pozostałych funkcji).
4. **Dostęp:** Netlify → **Identity** → kliknij konto → **Edit** → w polu **Roles** wpisz `ai` → Save. Potem w aplikacji wyloguj się i zaloguj ponownie.
5. Odebranie dostępu: usuń rolę. Wszyscy korzystają z Twojego klucza.

Zużycie (liczba użyć i tokenów na osobę w miesiącu, z podziałem na funkcje) zapisuje się w Netlify Blobs, w magazynie `augustapka-ai`.

## 8. Dostęp tylko po zalogowaniu i link do folderu OneDrive
- Do aplikacji nie da się wejść bez konta – nie ma już trybu „bez konta”. Kto był zalogowany na danym urządzeniu, może korzystać offline.
- Adresu folderu z materiałami od wykładowców **nie ma w plikach strony ani w repozytorium**. Podaje go funkcja `netlify/functions/private.mjs`, i to tylko zalogowanym.
- Ustawienie (raz): Netlify → Site configuration → Environment variables → Add a variable → klucz `MATERIALS_URL`, wartość: pełny link do folderu OneDrive (zaczyna się od `https://`). Zaznacz „Contains secret values”, zakres Production. Potem Deploys → Trigger deploy → Deploy site.
- Zmiana linku: edytujesz tylko tę zmienną i robisz ponowny deploy.
