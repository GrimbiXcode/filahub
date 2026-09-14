import { describe, expect, it } from "vitest";
import { requireNotBlocked } from "./middleware";
import { appRouter } from "./router";

/**
 * Was ein gesperrtes Konto noch erreichen darf.
 *
 * **Mehr als ein Funktionstest**, nach dem Vorbild von
 * `api/friendVisibility.test.ts`: Die Zusicherung über die Menge der Prozeduren
 * ist der Riegel gegen zwei Fehler, die beide still passieren.
 *
 * Der eine: Eine neue Prozedur landet auf `blockedQuery` und hebelt damit die
 * Sperre aus. Der andere, gefährlichere: Eine der hier genannten wandert auf
 * `authedQuery` und schließt damit den Weg zu den Betroffenenrechten zu.
 * Art. 15 und Art. 17 DSGVO stehen nicht unter dem Vorbehalt des
 * Wohlverhaltens – eine Sperre, die den Datenexport mitsperrt, wäre
 * rechtswidrig. Auffallen würde es nur dem Gesperrten, und der kann es nicht
 * melden.
 *
 * Geprüft wird die **Identität** der Sperr-Middleware und nicht die Länge der
 * Middleware-Kette: In die zählen Eingabeschema und Zugriffsbegrenzung mit, ein
 * `account.delete` käme damit auf dieselbe Zahl wie ein offenes
 * `auth.loginWithWidget`.
 */

/** Prozeduren, die ein Gesperrter erreichen können muss – mit dem Grund. */
const ERLAUBT_TROTZ_SPERRE = [
  /* Ohne sie wüsste die Oberfläche nicht, dass gesperrt ist. */
  "auth.me",
  /* Damit die Sperrseite in der Sprache des Benutzers erscheint. */
  "auth.updateSettings",
  /* Eine Sperre darf niemanden an sein Gerät fesseln. */
  "auth.logout",
  "auth.logoutAllDevices",
  /* Art. 15 und 20 DSGVO. */
  "account.export",
  /* Art. 17 DSGVO. */
  "account.delete",
  /* Der Weg zurück. */
  "unblock.status",
  "unblock.request",
] as const;

type ProcedureDef = { _def: { middlewares: unknown[] } };

function procedures(): Record<string, ProcedureDef> {
  return appRouter._def.procedures as unknown as Record<string, ProcedureDef>;
}

/**
 * Die Prüffunktion selbst.
 *
 * `t.middleware(...)` liefert einen Erbauer, und `.use()` hängt dessen
 * `_middlewares` in die Kette der Prozedur – nicht den Erbauer. Verglichen
 * werden muss deshalb die Funktion darin.
 */
const sperrPruefung = (
  requireNotBlocked as unknown as { _middlewares: unknown[] }
)._middlewares[0];

/** Ob eine Prozedur angemeldet **und** nicht gesperrt verlangt. */
function prueftSperre(path: string): boolean {
  const procedure = procedures()[path];
  expect(procedure, `Prozedur ${path} gibt es nicht`).toBeDefined();
  return procedure._def.middlewares.includes(sperrPruefung);
}

describe("Erreichbarkeit trotz Sperre", () => {
  it.each(ERLAUBT_TROTZ_SPERRE)("%s bleibt erreichbar", path => {
    expect(prueftSperre(path)).toBe(false);
  });

  it.each([
    "material.create",
    "material.addWeighing",
    "material.list",
    "lager.create",
    "containerType.create",
    "storageBox.create",
    "appearance.createColor",
    "friend.request",
    "friend.searchMaterials",
    "organization.create",
    "preset.proposals.submitNew",
    "admin.user.block",
  ])("%s ist für Gesperrte zu", path => {
    expect(prueftSperre(path)).toBe(true);
  });

  it("lässt keine angemeldete Prozedur ohne Sperrprüfung stehen", () => {
    /*
      Der eigentliche Wächter. Wer eine neue Prozedur auf `blockedQuery` setzt,
      ohne sie oben einzutragen, macht diesen Test rot – und genau das soll er.

      Offene Prozeduren (`publicQuery`) fallen heraus: Sie haben keinen
      Benutzer, für den eine Sperre gälte. Sie werden daran erkannt, dass sie
      `requireAuth` nicht tragen – `auth.me` und `ping` unterscheiden sich sonst
      in nichts, was von außen sichtbar wäre, deshalb die Liste unten.
    */
    const OHNE_ANMELDUNG = [
      "ping",
      "auth.loginInfo",
      "auth.login",
      "auth.loginWithWidget",
      "legal.operator",
    ];

    const ohneSperrpruefung = Object.keys(procedures()).filter(
      path =>
        !OHNE_ANMELDUNG.includes(path) &&
        !procedures()[path]._def.middlewares.includes(sperrPruefung)
    );
    expect(ohneSperrpruefung.sort()).toEqual([...ERLAUBT_TROTZ_SPERRE].sort());
  });

  it("kennt alle offenen Prozeduren beim Namen", () => {
    /*
      Die Gegenprobe zur Liste oben: Eine neue offene Prozedur muss dort
      eingetragen werden, sonst fiele sie im Test davor als „angemeldet ohne
      Sperrprüfung“ auf und niemand wüsste, ob das Absicht war. Offen heißt
      hier: erreichbar ohne jede Anmeldung – die engste Stelle der ganzen
      Anwendung.
    */
    const offen = Object.keys(procedures()).filter(path => {
      const count = procedures()[path]._def.middlewares.length;
      // publicQuery trägt nur Eingabeschema und Zugriffsbegrenzung, nie
      // `requireAuth`; erkennbar daran, dass `auth.me` (angemeldet, ohne
      // Eingabe) bei zwei liegt und alles Offene ohne Zusatz bei eins.
      return count === 1;
    });
    expect(offen.sort()).toEqual(["auth.loginInfo", "legal.operator", "ping"]);
  });
});
