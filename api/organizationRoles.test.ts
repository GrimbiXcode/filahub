import { describe, expect, it } from "vitest";
import {
  JOINABLE_ROLES,
  ORGANIZATION_ROLES,
  joinRoleSchema,
  organizationRoleSchema,
  roleAllows,
} from "@contracts/organizations";

/**
 * Die Rangfolge der Organisationsrollen.
 *
 * Mehr als ein Funktionstest, aus demselben Grund wie
 * `api/friendVisibility.test.ts`: `roleAllows` ist die einzige Stelle, an der
 * entschieden wird, ob ein Mitglied etwas darf. Eine vertauschte Zahl in
 * `ROLE_RANK` wäre kein Typfehler und würde in der Oberfläche nur auffallen,
 * wenn jemand genau den betroffenen Fall ausprobiert.
 */
describe("roleAllows", () => {
  it("erlaubt jede Stufe sich selbst", () => {
    for (const role of ORGANIZATION_ROLES) {
      expect(roleAllows(role, role)).toBe(true);
    }
  });

  /*
    Alle 16 Paare gegen die Reihenfolge in ORGANIZATION_ROLES geprüft, statt
    einzelne Fälle aufzuzählen: Die Liste **ist** die Rangfolge, und der Test
    zieht damit automatisch mit, wenn eine Stufe dazukommt. Eine handgeschriebene
    Tabelle müsste man daneben pflegen und würde es vergessen.
  */
  it("erlaubt genau die Stufen bis zur eigenen", () => {
    ORGANIZATION_ROLES.forEach((have, haveIndex) => {
      ORGANIZATION_ROLES.forEach((required, requiredIndex) => {
        expect(roleAllows(have, required)).toBe(haveIndex >= requiredIndex);
      });
    });
  });

  it("ordnet die Stufen so, wie die Oberfläche sie beschreibt", () => {
    // Ein Leser, der wissen will, was gilt, soll es hier finden – nicht nur als
    // Index-Vergleich.
    expect(roleAllows("admin", "editor")).toBe(true);
    expect(roleAllows("editor", "weigher")).toBe(true);
    expect(roleAllows("weigher", "viewer")).toBe(true);
    // Und die Gegenrichtung, die den Sinn der Stufen ausmacht:
    expect(roleAllows("viewer", "weigher")).toBe(false);
    expect(roleAllows("weigher", "editor")).toBe(false);
    expect(roleAllows("editor", "admin")).toBe(false);
  });
});

/**
 * Der Beitrittscode darf niemals die Verwaltungsstufe vergeben.
 *
 * Er wird herumgereicht, hängt in Chats und steht auf Zetteln an der Werkbank.
 * Käme `admin` durch, könnte jeder, der den Code kennt, alle anderen aus der
 * Organisation entfernen – aus einer Bequemlichkeit würde eine Übernahme.
 */
describe("joinRole", () => {
  it("lässt admin nicht zu", () => {
    expect(joinRoleSchema.safeParse("admin").success).toBe(false);
    expect(JOINABLE_ROLES).not.toContain("admin");
  });

  it("lässt alle übrigen Stufen zu", () => {
    for (const role of ORGANIZATION_ROLES) {
      if (role === "admin") continue;
      expect(joinRoleSchema.safeParse(role).success).toBe(true);
      expect(JOINABLE_ROLES).toContain(role);
    }
  });

  /*
    Der Riegel hängt an zwei Stellen – `joinRoleSchema` prüft die Eingabe,
    `JOINABLE_ROLES` füllt die Auswahl. Sie werden getrennt geschrieben und
    könnten auseinanderlaufen; hier steht, dass sie es nicht dürfen.
  */
  it("hält Schema und Auswahlliste deckungsgleich", () => {
    expect([...JOINABLE_ROLES].sort()).toEqual(
      ORGANIZATION_ROLES.filter(
        role => joinRoleSchema.safeParse(role).success
      ).sort()
    );
  });

  it("kennt dieselben Werte wie das Rollen-Schema", () => {
    // Ein zusätzlicher Wert in der einen Liste wäre sonst ein Enum-Wert, den
    // die Datenbank kennt und die Anwendung nie prüft.
    for (const role of ORGANIZATION_ROLES) {
      expect(organizationRoleSchema.safeParse(role).success).toBe(true);
    }
    expect(organizationRoleSchema.safeParse("owner").success).toBe(false);
  });
});
