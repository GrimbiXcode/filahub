/*
  Lädt das offizielle Telegram Login Widget und meldet das Ergebnis an die
  Anmeldeseite zurück (src/pages/Login.tsx).

  Warum ein eigenes Dokument? `telegram-widget.js` setzt den Rückruf aus dem
  Attribut `data-onauth` mit `eval` zusammen (`__parseFunction`). Die Content
  Security Policy der Anwendung erlaubt kein `'unsafe-eval'`, im Hauptdokument
  bricht die Anmeldung deshalb mit einem `EvalError` ab. Die Richtlinie für
  alle Seiten aufzuweichen, wäre der teure Weg: Sie ist der Riegel dagegen,
  dass aus einer eingeschleusten Zeichenkette ausführbarer Code wird.

  Stattdessen bekommt allein dieses Dokument die Ausnahme (siehe api/app.ts).
  Es enthält keinen Anwendungscode, keine Sitzung und keine Benutzerdaten –
  nur den Telegram-Knopf. Das Hauptdokument bleibt ohne `eval`.

  Bewusst klassisches ES5 ohne Bündelung: Die Datei liegt in `public/` und wird
  unverändert ausgeliefert, genau wie public/theme-init.js.
*/
(function () {
  /* Muss zu TELEGRAM_LOGIN_FRAME_MESSAGE in contracts/constants.ts passen. */
  var MESSAGE_SOURCE = "filahub-telegram-login";

  function post(message) {
    message.source = MESSAGE_SOURCE;
    /*
      Zielherkunft ausdrücklich statt `"*"`: Die Anmeldedaten sind signiert und
      kurzlebig, gehen den Rahmen darüber hinaus aber nichts an.
    */
    window.parent.postMessage(message, window.location.origin);
  }

  var params = new URLSearchParams(window.location.search);

  /*
    Farbschema der Anmeldeseite übernehmen, bevor irgendetwas gemalt wird. Ein
    iframe ist nur durchsichtig, solange sein Schema zu dem des einbettenden
    Dokuments passt; sonst malt ihn der Browser deckend in der Grundfarbe
    seines eigenen Schemas – im dunklen Modus der Anmeldeseite standen so weiße
    Flächen neben dem Knopf. `prefers-color-scheme` reichte dafür nicht: Die
    Anmeldeseite lässt das Schema auch gegen die Einstellung des Geräts wählen.
  */
  document.documentElement.style.colorScheme =
    params.get("theme") === "dark" ? "dark" : "light";

  var bot = params.get("bot") || "";
  /*
    Telegram-Benutzernamen bestehen aus Buchstaben, Ziffern und Unterstrich.
    Der Wert stammt zwar aus der eigenen Anwendung, landet hier aber in einem
    Attribut – ungeprüft wäre dieses Dokument das Einfallstor, das die
    Richtlinie der Anwendung gerade verhindern soll.
  */
  if (!/^[A-Za-z0-9_]{1,64}$/.test(bot)) return;

  /* Vom Widget aufgerufen; `data-onauth` unten nennt genau diesen Namen. */
  window.onTelegramAuth = function (user) {
    post({ kind: "auth", user: user });
  };

  var script = document.createElement("script");
  script.src = "https://telegram.org/js/telegram-widget.js?22";
  script.async = true;
  script.setAttribute("data-telegram-login", bot);
  script.setAttribute("data-size", "large");
  script.setAttribute("data-userpic", "true");
  script.setAttribute("data-request-access", "write");
  script.setAttribute("data-onauth", "onTelegramAuth(user)");
  document.body.appendChild(script);

  /*
    Das Maß des Telegram-Knopfes hängt an Größe, Beschriftung und Profilbild
    und steht erst fest, wenn das Widget geladen ist. Ein fester Wert im Rahmen
    schnitte ihn ab, sobald Telegram etwas daran ändert – also meldet der Rahmen
    selbst, wie viel Platz er braucht. Der Rumpf ist per Stylesheet genau so
    groß wie der Knopf (telegram-login.html), sein Maß ist also dessen Maß;
    0 × 0 heißt, dass der Knopf noch nicht eingesetzt ist.
  */
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(function () {
      var box = document.body.getBoundingClientRect();
      post({ kind: "size", width: box.width, height: box.height });
    }).observe(document.body);
  }
})();
