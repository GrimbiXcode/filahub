/**
 * Liest `.env` aus dem Arbeitsverzeichnis in `process.env` – mit dem Parser,
 * den Node selbst mitbringt (bis 4.8.0 über das Paket `dotenv`).
 *
 * Wie zuvor: Schon gesetzte Variablen gewinnen (Docker, Compose, Shell), und
 * eine fehlende Datei ist kein Fehler – im Container gibt es meist keine.
 *
 * Als eigenes Modul mit Nebenwirkung, das als **erstes** importiert wird:
 * Importe werden vor dem Rumpf eines Moduls ausgewertet, ein Aufruf im Rumpf
 * von `env.ts` käme für Module zu spät, die beim Laden schon lesen.
 */
try {
  process.loadEnvFile();
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}
