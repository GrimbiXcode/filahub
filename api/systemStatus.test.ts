/**
 * `redactUrl` aus api/queries/systemStatus.ts.
 *
 * Die Funktion steht zwischen der Verbindungsangabe und der Verwaltungsseite:
 * Ohne sie stünde das Datenbank-Passwort im Klartext unter /verwaltung/system.
 */
import { describe, expect, it } from "vitest";
import { redactUrl } from "./queries/systemStatus";

describe("redactUrl", () => {
  it("entfernt Benutzer und Passwort", () => {
    expect(redactUrl("postgres://user:pw@127.0.0.1:5432/filahub")).toBe(
      "127.0.0.1:5432/filahub"
    );
  });

  it("kommt ohne Port aus", () => {
    expect(redactUrl("postgres://user:pw@db/filahub")).toBe("db/filahub");
  });

  it("verrät bei einer unlesbaren URL nichts", () => {
    expect(redactUrl("kein-url-format")).toBe("unbekannte Quelle");
  });
});
