/*
  Farbschema vor dem ersten Paint setzen, sonst blitzt beim Laden im Dark-Mode
  kurz die helle Oberfläche auf. Schlüssel und Werte sind dieselben wie in
  next-themes (siehe src/providers/theme.tsx).

  Bewusst eine eigene Datei statt eines Inline-Skripts in `index.html`: Ein
  Inline-Skript verlangte `script-src 'unsafe-inline'`, und damit wäre die
  Content Security Policy (siehe api/app.ts) das Papier nicht wert. Ein
  Hash-Wert wäre die Alternative, bricht aber still, sobald der Formatierer
  das Skript umbricht.
*/
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = stored === "dark" || (stored !== "light" && prefersDark);
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#09090b" : "#ffffff");
  } catch (e) {
    /* localStorage kann blockiert sein – dann bleibt es hell */
  }
})();
