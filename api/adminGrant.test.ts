import { describe, expect, it, vi } from "vitest";
import { shouldGrantAdmin } from "./queries/users";

/**
 * Rechtevergabe bei der Registrierung.
 *
 * Bis 1.1.1 wurde der allererste Registrierte immer Administrator – auch auf
 * einer offen erreichbaren Instanz. Wer eine frische Installation als Erster
 * fand, übernahm sie. Diese Datei hält fest, dass das nicht zurückkommt.
 */

const never = () => Promise.resolve(false);
const first = () => Promise.resolve(true);

describe("shouldGrantAdmin", () => {
  it("macht den benannten Eigentümer zum Administrator", async () => {
    expect(
      await shouldGrantAdmin({
        unionId: "123",
        ownerTelegramId: "123",
        hasAllowlist: false,
        isFirstUser: never,
      })
    ).toBe(true);
  });

  it("bestätigt den Eigentümer bei jeder Anmeldung erneut", async () => {
    // Auch wenn längst andere Konten bestehen – die Ansage gilt weiter.
    expect(
      await shouldGrantAdmin({
        unionId: "123",
        ownerTelegramId: "123",
        hasAllowlist: true,
        isFirstUser: never,
      })
    ).toBe(true);
  });

  it("macht Fremde nicht zum Administrator, nur weil sie zuerst da sind", async () => {
    /*
      Der Kern der Sache: offene Registrierung, kein Eigentümer benannt. Früher
      gewann hier, wer die Instanz als Erster fand.
    */
    expect(
      await shouldGrantAdmin({
        unionId: "999",
        ownerTelegramId: "",
        hasAllowlist: false,
        isFirstUser: first,
      })
    ).toBe(false);
  });

  it("erlaubt die Ersteinrichtung, wenn eine Freigabeliste besteht", async () => {
    // Wer auf der Liste steht, wurde vom Betreiber zugelassen.
    expect(
      await shouldGrantAdmin({
        unionId: "999",
        ownerTelegramId: "",
        hasAllowlist: true,
        isFirstUser: first,
      })
    ).toBe(true);
  });

  it("vergibt bei bestehenden Konten nichts mehr", async () => {
    expect(
      await shouldGrantAdmin({
        unionId: "999",
        ownerTelegramId: "",
        hasAllowlist: true,
        isFirstUser: never,
      })
    ).toBe(false);
  });

  it("fragt die Datenbank nicht, wenn die Antwort feststeht", async () => {
    // Ohne Freigabeliste ist die Entscheidung schon gefallen – jede Abfrage
    // wäre eine unnötige Runde bei jedem Login.
    const isFirstUser = vi.fn(never);
    await shouldGrantAdmin({
      unionId: "999",
      ownerTelegramId: "",
      hasAllowlist: false,
      isFirstUser,
    });
    expect(isFirstUser).not.toHaveBeenCalled();

    const owner = vi.fn(never);
    await shouldGrantAdmin({
      unionId: "123",
      ownerTelegramId: "123",
      hasAllowlist: true,
      isFirstUser: owner,
    });
    expect(owner).not.toHaveBeenCalled();
  });
});
