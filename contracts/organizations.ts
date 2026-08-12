import { z } from "zod";
import { isCode, normalizeCode } from "./codes";

/**
 * Organisationen – gemeinsamer Code für Client und Server.
 *
 * Eine Organisation ist die zweite Art, Eigentümer eines Lagers zu sein: Bis
 * 2.4.1 gehörte jede Fachzeile genau einem Menschen. Zielgruppe sind Firmen,
 * 3D-Druck-Hubs von Hochschulen und Bastelwerkstätten – mehrere Personen, ein
 * gemeinsamer Bestand, abgestufte Rechte.
 *
 * Wie die übrigen Dateien in `contracts/` von Client, Server und Tests
 * importierbar und ohne alles aus `@db` oder `api/` zur Laufzeit – nur zod und
 * eigene Logik.
 *
 * Wie bei `contracts/friends.ts` sind die Aufzählungen hier **nicht** aus
 * `db/schema.ts` gespiegelt, sondern werden dort importiert: `pgEnum` bekommt
 * genau diese Konstanten. Die Abhängigkeit läuft nur in eine Richtung
 * (`db/` → `contracts/`), und zwei Listen können nicht auseinanderlaufen.
 */

// ---------------------------------------------------------------------------
// Rollen
// ---------------------------------------------------------------------------

/**
 * Was ein Mitglied in **seiner** Organisation darf.
 *
 * Eine Rangfolge und keine frei kombinierbaren Rechte: Die vier Stufen decken
 * die Arbeitsteilung ab, um die es geht (nachschlagen – abbuchen – erfassen –
 * verwalten), und jede höhere schließt die niedrigere ein. Einzelrechte ließen
 * Zustände zu, die niemand haben will („darf bearbeiten, aber nicht wiegen“),
 * und verdoppelten die Fälle in Oberfläche und Prüfungen.
 *
 * - `viewer`  – Bestand, Lager, Gebindearten und Dryboxen ansehen und suchen
 * - `weigher` – zusätzlich wiegen, also **abbuchen**
 * - `editor`  – zusätzlich Material erfassen, ändern, löschen und importieren;
 *               Gebindearten und Dryboxen pflegen
 * - `admin`   – zusätzlich Lager anlegen und löschen, Mitglieder und Rollen,
 *               Beitrittscode, Organisation umbenennen und löschen
 *
 * Ein Lager ist Struktur und sein Löschen wirkt auf alle – deshalb steht es bei
 * `admin`, obwohl das Material darin schon `editor` darf.
 *
 * **Nicht zu verwechseln mit `users.role`.** Das ist der Betreiber der Instanz
 * (Preset-Katalog, `/verwaltung/system`, `adminQuery`) und gewährt **keinen**
 * Zugriff auf den Bestand irgendeiner Organisation. Wer eine Organisation
 * verwaltet, steht ausschließlich in `organization_members.role`.
 */
export const ORGANIZATION_ROLES = [
  "viewer",
  "weigher",
  "editor",
  "admin",
] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const ORGANIZATION_INVITATION_STATUSES = [
  "pending",
  "accepted",
  "declined",
] as const;
export type OrganizationInvitationStatus =
  (typeof ORGANIZATION_INVITATION_STATUSES)[number];

export const organizationRoleSchema = z.enum(ORGANIZATION_ROLES);

/**
 * Rangfolge der Stufen – dieselbe Bauart wie `VISIBILITY_RANK` bei den
 * Freigaben (`contracts/friends.ts`).
 */
const ROLE_RANK: Record<OrganizationRole, number> = {
  viewer: 0,
  weigher: 1,
  editor: 2,
  admin: 3,
};

/** Reicht `have` für `required` aus? */
export function roleAllows(
  have: OrganizationRole,
  required: OrganizationRole
): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[required];
}

// ---------------------------------------------------------------------------
// Wägungen korrigieren
// ---------------------------------------------------------------------------

/**
 * Wie lange eine frisch erfasste Wägung noch als **Korrektur** gilt.
 *
 * Der Korrekturfall dauert Sekunden: Waage ablesen, Zahl eintippen, Fehler
 * sehen. Eine Viertelstunde deckt zusätzlich die Unterbrechung ab – Telefon,
 * Kollege kommt dazwischen – und ist kurz genug, dass eine Schicht später nichts
 * mehr löschbar ist.
 */
export const WEIGHING_CORRECTION_MINUTES = 15;

/**
 * Darf diese Stufe **diese** Wägung löschen?
 *
 * Die Regel, die `weigher` von der Zerstörung der Aufzeichnung trennt, ohne ihm
 * die Korrektur zu nehmen – und der Grund, warum sie hier steht und nicht im
 * Router: Server und Oberfläche rufen dieselbe Funktion auf. Zwei Fassungen
 * derselben Bedingung liefen beim nächsten Umbau auseinander, und das Ergebnis
 * wäre ein Knopf, der `FORBIDDEN` liefert, oder einer, der fehlt, obwohl er
 * dürfte.
 *
 * **Das Problem, das sie löst:** `weigher` ist die Stufe, die man freigebig
 * vergibt (siehe `addWeighing` in `api/materialRouter.ts`). Sie erlaubte bis
 * 2.5.0 auch, jede Wägung jedes Materials der Organisation zu löschen – in
 * Schleife also die gesamte Wägungsgeschichte, unwiderruflich und ohne Spur,
 * weil Wiegen bewusst nicht protokolliert wird. Zum Vergleich: `material.delete`
 * verlangt `editor` und zerstört weniger.
 *
 * **Warum nicht einfach `editor` verlangen?** Weil der Alltagsfall die
 * vertippte Zahl ist. Bräuchte es dafür jedes Mal jemand anderen, wäre `weigher`
 * in einer Werkstatt unbrauchbar.
 *
 * Beide Bedingungen zusammen ergeben genau den Korrekturfall:
 *
 * - **Zuletzt erfasst.** Ein Eintrag mitten aus dem Verlauf ist nie eine
 *   Korrektur, sondern ein Eingriff in die Aufzeichnung. Allein trüge die
 *   Bedingung allerdings nichts – wer die letzte löscht, macht die vorletzte zur
 *   letzten und käme in Schleife doch durch. Erst das Zeitfenster schließt das.
 * - **Frisch.** Das ist der tragende Teil: Geschichte ist per Definition alt.
 *
 * `now` als Parameter, damit die Grenze ohne Uhr prüfbar ist.
 */
export function mayDeleteWeighing(
  role: OrganizationRole,
  weighing: { id: number; createdAt: Date },
  latestWeighingId: number,
  now: Date = new Date()
): boolean {
  // Wer Material löschen darf, darf erst recht eine einzelne Wägung entfernen.
  if (roleAllows(role, "editor")) return true;
  if (!roleAllows(role, "weigher")) return false;
  if (weighing.id !== latestWeighingId) return false;
  return (
    now.getTime() - weighing.createdAt.getTime() <
    WEIGHING_CORRECTION_MINUTES * 60_000
  );
}

// ---------------------------------------------------------------------------
// Beitrittscode
// ---------------------------------------------------------------------------

/** `ORG-A2B3-C4D5`; Alphabet und Länge kommen aus `contracts/codes.ts`. */
export const JOIN_CODE_PREFIX = "ORG";

/** Bringt eine Eingabe in die Normalform, oder `null`. */
export function normalizeJoinCode(input: string): string | null {
  return normalizeCode(JOIN_CODE_PREFIX, input);
}

/** Prüft die Normalform. Für Tests und als Zusicherung beim Erzeugen. */
export function isJoinCode(value: string): boolean {
  return isCode(JOIN_CODE_PREFIX, value);
}

/**
 * Rollen, die ein Beitritt über den offenen Code vergeben darf.
 *
 * **`admin` steht bewusst nicht darin.** Ein Code wird herumgereicht, hängt in
 * Chats und steht auf Zetteln an der Werkbank; wer ihn hat, wäre sonst
 * Verwalter der Organisation und könnte alle anderen entfernen. Die
 * Verwaltungsstufe wird einzeln vergeben, nie im Vorbeigehen.
 */
export const JOINABLE_ROLES = ORGANIZATION_ROLES.filter(
  role => role !== "admin"
) as readonly Exclude<OrganizationRole, "admin">[];

export const joinRoleSchema = z.enum(["viewer", "weigher", "editor"]);
export type JoinRole = z.infer<typeof joinRoleSchema>;

// ---------------------------------------------------------------------------
// Grenzen
// ---------------------------------------------------------------------------

/*
  Alle drei gelten vorerst für jede Organisation und jedes Konto gleich. Es ist
  keine Kommerzialisierung geplant – es gibt also keine Stufen, sondern feste
  Werte gegen Missbrauch.

  **Keinen davon garantiert die Datenbank**, aus demselben Grund wie bei
  `MAX_LAGER_PER_USER`: Ein Zähler ist weder als Unique- noch als partieller
  Index ausdrückbar. Zwei gleichzeitige Anfragen können jede dieser Grenzen um
  eins überschreiten. Der Schaden ist gering, aber die Lücke soll benannt sein
  und nicht als Zusicherung durchgehen.
*/

/**
 * Lager je Organisation.
 *
 * Mehr als die fünf einer Person (`MAX_LAGER_PER_USER`): Ein Lager trägt genau
 * eine Materialart und beim Filament genau eine Stärke. Ein Hub führt leicht
 * beide Stärken, dazu Harz und Pulver – bei fünf wäre er am Anschlag, bevor er
 * angefangen hat.
 */
export const MAX_LAGER_PER_ORGANIZATION = 10;

/**
 * Organisationen, die **ein Konto gründen** darf. Mitgliedschaften sind nicht
 * begrenzt – wer eingeladen wird, wird eingeladen.
 */
export const MAX_ORGANIZATIONS_PER_USER = 3;

/**
 * Mitglieder je Organisation.
 *
 * Begrenzt vor allem den offenen Beitrittscode: Er ist die einzige Stelle, an
 * der jemand ohne Zutun eines Verwalters hinzukommt.
 */
export const MAX_MEMBERS_PER_ORGANIZATION = 100;
