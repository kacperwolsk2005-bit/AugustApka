# AugustApka na Netlify: logowanie, synchronizacja, instalacja na telefonie

## 1. Wgraj pliki do repozytorium na GitHubie
Wrzuć do repozytorium **całą zawartość tej paczki** z zachowaniem folderów (stary `index.html` zostanie zastąpiony):

```
index.html
sw.js
manifest.webmanifest
netlify.toml
package.json
icons/            (4 obrazki PNG)
netlify/functions/progress.mjs
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
