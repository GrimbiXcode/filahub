import { describe, expect, it } from "vitest";
import {
  accountMethods,
  discordUnionId,
  loginAccess,
  registrationThrottled,
  telegramChatId,
  type AccessConfig,
} from "./lib/loginAccess";
import { shouldGrantAdmin } from "./queries/users";

/**
 * Wer darf sich anmelden (seit 4.8.0 auch über Discord)?
 *
 * Wahrheitstabelle statt Einzelfälle: Es geht um den Zugang zur Instanz, und
 * der wichtigste Fall ist der, den man beim Lesen übersieht – etwa dass eine
 * offene Telegram-Registrierung Discord nicht still mit öffnet.
 */

const TG = "123456";
const DC = "123456789012345678";
const OTHER_DC = "987654321098765432";

const base: AccessConfig = {
  telegramAllowedIds: [],
  discordAllowedIds: [],
  telegramOpenRegistration: false,
  discordOpenRegistration: false,
  ownerTelegramId: "",
  ownerDiscordId: "",
};
const cfg = (patch: Partial<AccessConfig>): AccessConfig => ({
  ...base,
  ...patch,
});

const discord = { provider: "discord" as const, id: DC };
const telegram = { provider: "telegram" as const, id: TG };

describe("loginAccess", () => {
  it.each([
    // [Beschreibung, Konfiguration, erwartet]
    ["nichts gesetzt", base, "registration_closed"],
    [
      "nur Telegram offen – öffnet Discord nicht mit",
      cfg({ telegramOpenRegistration: true }),
      "registration_closed",
    ],
    ["Discord offen", cfg({ discordOpenRegistration: true }), "ok"],
    ["Discord-Liste mit dieser ID", cfg({ discordAllowedIds: [DC] }), "ok"],
    [
      "Discord-Liste ohne diese ID",
      cfg({ discordAllowedIds: [OTHER_DC] }),
      "not_allowlisted",
    ],
    [
      "Liste schlägt Öffnung",
      cfg({ discordAllowedIds: [OTHER_DC], discordOpenRegistration: true }),
      "not_allowlisted",
    ],
    [
      "Betreiber gilt bei Liste als freigegeben",
      cfg({ discordAllowedIds: [OTHER_DC], ownerDiscordId: DC }),
      "ok",
    ],
    [
      "Telegram-Liste lässt neue Discord-Konten nicht herein",
      cfg({ telegramAllowedIds: [TG] }),
      "registration_closed",
    ],
  ] as const)("neues Discord-Konto: %s", (_label, config, expected) => {
    const result = loginAccess(config, discord, null);
    expect(result.ok ? "ok" : result.reason).toBe(expected);
  });

  it("lässt ein per Telegram freigegebenes Konto auch über Discord herein", () => {
    // Genau dafür verbindet man Discord in den Einstellungen.
    const result = loginAccess(cfg({ telegramAllowedIds: [TG] }), discord, {
      telegramId: TG,
      discordId: DC,
    });
    expect(result.ok).toBe(true);
  });

  it("lässt ein Konto nicht herein, dessen Wege beide nicht freigegeben sind", () => {
    const result = loginAccess(
      cfg({ telegramAllowedIds: ["999"], discordAllowedIds: [OTHER_DC] }),
      discord,
      { telegramId: TG, discordId: DC }
    );
    expect(result).toEqual({ ok: false, reason: "not_allowlisted" });
  });

  it("verhält sich für Telegram wie vor 4.8.0", () => {
    const allowed = (c: AccessConfig) => loginAccess(c, telegram, null).ok;
    expect(allowed(base)).toBe(false);
    expect(allowed(cfg({ telegramOpenRegistration: true }))).toBe(true);
    expect(allowed(cfg({ telegramAllowedIds: [TG] }))).toBe(true);
    expect(allowed(cfg({ telegramAllowedIds: ["999"] }))).toBe(false);
    // Discord zu öffnen öffnet Telegram nicht
    expect(allowed(cfg({ discordOpenRegistration: true }))).toBe(false);
  });
});

describe("registrationThrottled", () => {
  it("greift nur auf offenen Wegen ohne Liste", () => {
    expect(
      registrationThrottled(cfg({ discordOpenRegistration: true }), "discord")
    ).toBe(true);
    expect(
      registrationThrottled(
        cfg({ discordOpenRegistration: true, discordAllowedIds: [DC] }),
        "discord"
      )
    ).toBe(false);
    expect(
      registrationThrottled(cfg({ telegramOpenRegistration: true }), "discord")
    ).toBe(false);
  });
});

describe("telegramChatId", () => {
  it("liefert die Telegram-ID nur für Telegram-Konten", () => {
    expect(telegramChatId(TG)).toBe(TG);
    expect(telegramChatId(discordUnionId(DC))).toBeNull();
    expect(telegramChatId("dev-login")).toBeNull();
  });

  it("kennt die Anmeldewege eines Kontos", () => {
    expect(accountMethods({ unionId: TG, discordId: DC })).toEqual({
      telegramId: TG,
      discordId: DC,
    });
    expect(
      accountMethods({ unionId: discordUnionId(DC), discordId: DC })
    ).toEqual({ telegramId: null, discordId: DC });
  });
});

describe("shouldGrantAdmin mit Discord", () => {
  const never = () => Promise.resolve(false);

  it("macht den benannten Discord-Betreiber zum Administrator", async () => {
    expect(
      await shouldGrantAdmin({
        unionId: discordUnionId(DC),
        ownerTelegramId: "",
        discordId: DC,
        ownerDiscordId: DC,
        hasAllowlist: false,
        isFirstUser: never,
      })
    ).toBe(true);
  });

  it("macht ein anderes Discord-Konto nicht zum Administrator", async () => {
    expect(
      await shouldGrantAdmin({
        unionId: discordUnionId(OTHER_DC),
        ownerTelegramId: "",
        discordId: OTHER_DC,
        ownerDiscordId: DC,
        hasAllowlist: false,
        isFirstUser: never,
      })
    ).toBe(false);
  });
});
