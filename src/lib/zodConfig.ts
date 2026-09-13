import { config } from "zod";

/*
  zod 4 übersetzt Objektschemata beim Anlegen mit `new Function` in schnelleren
  Code und tastet dafür einmal ab, ob das überhaupt erlaubt ist. Unter der
  Content Security Policy (siehe api/app.ts) ist es das nicht: Der Versuch ist
  abgefangen, zod nimmt korrekt den langsamen Weg – der Browser meldet den
  Versuch aber trotzdem als Verstoß. In der Konsole steht dann ein Fehler, der
  keiner ist, direkt neben denen, die welche sind. `jitless` lässt die
  Abtastung weg.

  Eine eigene Datei, kein Aufruf im Rumpf von `main.tsx`: Der liefe erst nach
  allen Importen – und damit nach dem ersten angelegten Schema, die Abtastung
  wäre längst gelaufen. Der Import steht deshalb dort an erster Stelle.

  Betrifft nur den Browser. Auf dem Server (`api/`) gilt keine CSP, dort bleibt
  der schnelle Weg.
*/
config({ jitless: true });
