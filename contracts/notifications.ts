import { FALLBACK_LANGUAGE, type LanguageCode } from "./i18n";
import type { BlockReason } from "./limits";
import type { OrganizationRole } from "./organizations";

/**
 * Texte der Telegram-Benachrichtigungen.
 *
 * Der erste Katalog auf der Serverseite. Bisher braucht `api/` keinen: Alle
 * Meldungen dort sind Fehlertexte für Entwickler oder gehen durch die
 * Oberfläche, die ihre Sprache selbst kennt (`src/messages/`). Eine
 * Telegram-Nachricht ist beides nicht – sie verlässt die App und muss in der
 * Sprache des **Empfängers** ankommen.
 *
 * Deshalb hier und nicht wie beim `/login` zweisprachig in einer Nachricht: Der
 * Bot kennt den Empfänger bei einer Freundschafts- oder Ausleih-Anfrage, seine
 * Spracheinstellung steht in `users.language`. Zwei Sprachen in einer Nachricht
 * wären dort bloß doppelt so lang.
 *
 * Aufbau wie `src/messages/`: `de` ist die Leitsprache, `en` ist als derselbe
 * Typ deklariert und damit ein Abbild davon. Ein vergessener Schlüssel ist ein
 * Compile-Fehler.
 *
 * Wie alles in `contracts/` ohne Laufzeitabhängigkeit auf `@db` oder `api/`.
 */

/** Was eine Ausleih-Anfrage beantwortet: zugesagt oder abgelehnt. */
export type LoanDecision = "accepted" | "declined";

/**
 * Die Stufen, wie sie **außerhalb** der App heißen.
 *
 * Dieselbe Übersetzung wie `roleLabel` in `src/lib/organizationRole.ts` – dort
 * aus `src/messages/`, hier aus diesem Katalog, weil der Server nichts aus
 * `src/` laden darf. Ohne sie stünde in der Nachricht der technische Name
 * („als „weigher““), und der sagt einem Empfänger, der die App noch nie gesehen
 * hat, genau nichts.
 *
 * `Record<OrganizationRole, string>` und kein loser Zugriff: Eine fünfte Stufe
 * wäre damit ein Compile-Fehler in **jeder** Sprache.
 */
type RoleNames = Record<OrganizationRole, string>;

const deRoleNames: RoleNames = {
  viewer: "Ansehen",
  weigher: "Wiegen",
  editor: "Erfassen",
  admin: "Verwalten",
};

const enRoleNames: RoleNames = {
  viewer: "View",
  weigher: "Weigh",
  editor: "Edit",
  admin: "Manage",
};

/**
 * Die Sperrgründe, wie sie **außerhalb** der App heißen.
 *
 * Dasselbe Vorgehen wie bei `RoleNames`: Ohne diese Übersetzung stünde in der
 * Nachricht der technische Schlüssel („abuse“), und der sagt dem Empfänger
 * nichts – gerade bei der Nachricht, die ihm den Zugang nimmt, ist das die
 * falsche Stelle zum Sparen.
 */
type BlockReasonNames = Record<BlockReason, string>;

const deBlockReasons: BlockReasonNames = {
  abuse: "Massenhaftes Anlegen von Daten",
  spam: "Unerwünschte Werbung oder Kontaktaufnahme",
  terms: "Verstoß gegen die Nutzungsbedingungen",
  automated: "Verdacht auf automatisierte Nutzung",
  other: "Sonstiger Grund",
};

const enBlockReasons: BlockReasonNames = {
  abuse: "Mass creation of records",
  spam: "Unsolicited advertising or contact",
  terms: "Breach of the terms of use",
  automated: "Suspected automated use",
  other: "Other reason",
};

const de = {
  friendRequest: (v: { from: string }) =>
    `${v.from} möchte sich auf filahub mit dir verbinden.\n\n` +
    `Die Anfrage liegt unter „Freunde“ – dort kannst du sie annehmen oder ablehnen ` +
    `und festlegen, was ${v.from} von deinem Lager sehen darf.`,

  friendAccepted: (v: { from: string }) =>
    `${v.from} hat deine Freundschaftsanfrage auf filahub angenommen.\n\n` +
    `Ab jetzt findest du das freigegebene Material von ${v.from} in der Suche.`,

  loanRequest: (v: {
    from: string;
    material: string;
    message: string | null;
  }) =>
    `${v.from} fragt, ob du dieses Material ausleihen würdest:\n\n` +
    `${v.material}\n` +
    (v.message ? `\n„${v.message}“\n` : "") +
    `\nAntworten kannst du in filahub unter „Freunde“.`,

  loanAnswer: (v: {
    from: string;
    material: string;
    decision: LoanDecision;
  }) =>
    v.decision === "accepted"
      ? `${v.from} leiht dir ${v.material}. Ihr klärt die Übergabe am besten direkt.`
      : `${v.from} kann dir ${v.material} gerade nicht ausleihen.`,

  /*
    Organisationen. Alle drei ändern **Zugriffsrechte** des Empfängers – deshalb
    gehen sie hinaus, während das Wiegen und Erfassen im Alltag es nicht tut.
    Dieselbe Grenze zieht `contracts/audit.ts` fürs Protokoll.
  */
  organizationInvited: (v: { organization: string; role: OrganizationRole }) =>
    `Du wurdest zu „${v.organization}“ auf filahub eingeladen – als „${deRoleNames[v.role]}“.\n\n` +
    `Die Einladung liegt unter „Organisationen“; dort kannst du sie annehmen ` +
    `oder ablehnen. Bis dahin ändert sich für dich nichts.`,

  organizationRoleChanged: (v: {
    organization: string;
    role: OrganizationRole;
  }) =>
    `Deine Rolle bei „${v.organization}“ auf filahub ist jetzt „${deRoleNames[v.role]}“.`,

  organizationRemoved: (v: { organization: string }) =>
    `Du bist nicht mehr Mitglied von „${v.organization}“ auf filahub.\n\n` +
    `Der Bestand der Organisation ist damit für dich nicht mehr sichtbar. ` +
    `Dein eigener Bestand ist davon nicht betroffen.`,

  /*
    Sperre und Entsperrung.

    Sie gehen hinaus, obwohl der Betroffene den Stand auch in der App sieht:
    Wer gesperrt wird, schaut nicht zufällig gerade hin, und die Sperre ist der
    einzige Eingriff im Projekt, der jemanden ohne sein Zutun von seinem
    eigenen Bestand trennt. Dass er davon erfährt, ohne danach zu suchen, ist
    der Unterschied zwischen einer Maßnahme und einem stillen Verschwinden.
  */
  accountBlocked: (v: { reason: BlockReason }) =>
    `Dein Konto auf filahub wurde gesperrt.\n\n` +
    `Grund: ${deBlockReasons[v.reason]}\n\n` +
    `Dein Bestand bleibt erhalten. Du kannst dich weiterhin anmelden, deine ` +
    `Daten herunterladen, dein Konto löschen und die Aufhebung der Sperre ` +
    `beantragen.`,

  accountUnblocked: () =>
    `Die Sperre deines Kontos auf filahub wurde aufgehoben.\n\n` +
    `Bitte melde dich neu an.`,

  unblockRejected: (v: { note: string }) =>
    `Dein Antrag auf Aufhebung der Sperre wurde abgelehnt.\n\n${v.note}`,

  /** Meldung an die Administratoren – nur sie bekommen sie. */
  abuseAlert: (v: { lines: string }) =>
    `filahub meldet auffällige Zugriffe:\n\n${v.lines}\n\n` +
    `Einzelheiten unter „Verwaltung → Missbrauch“.`,

  /**
   * Ohne `APP_BASE_URL` fehlt der Link. Der Satz nennt dann nur den Ort in der
   * App – besser als ein kaputter Link oder eine erratene Adresse.
   */
  openLink: (v: { url: string }) => `\n\n${v.url}`,
} as const;

export type NotificationMessages = typeof de;

const en: NotificationMessages = {
  friendRequest: v =>
    `${v.from} would like to connect with you on filahub.\n\n` +
    `You will find the request under "Friends" – accept or decline it there, ` +
    `and choose what ${v.from} may see of your stock.`,

  friendAccepted: v =>
    `${v.from} accepted your friend request on filahub.\n\n` +
    `From now on you will find ${v.from}'s shared filament in search.`,

  loanRequest: v =>
    `${v.from} is asking whether you would lend this filament:\n\n` +
    `${v.material}\n` +
    (v.message ? `\n"${v.message}"\n` : "") +
    `\nYou can answer in filahub under "Friends".`,

  loanAnswer: v =>
    v.decision === "accepted"
      ? `${v.from} will lend you ${v.material}. Best to arrange the handover directly.`
      : `${v.from} cannot lend you ${v.material} right now.`,

  organizationInvited: v =>
    `You have been invited to "${v.organization}" on filahub – as "${enRoleNames[v.role]}".\n\n` +
    `The invitation is under "Organizations"; accept or decline it there. ` +
    `Nothing changes for you until then.`,

  organizationRoleChanged: v =>
    `Your role at "${v.organization}" on filahub is now "${enRoleNames[v.role]}".`,

  organizationRemoved: v =>
    `You are no longer a member of "${v.organization}" on filahub.\n\n` +
    `The organization's stock is no longer visible to you. Your own stock is ` +
    `not affected.`,

  accountBlocked: v =>
    `Your filahub account has been blocked.\n\n` +
    `Reason: ${enBlockReasons[v.reason]}\n\n` +
    `Your stock is kept. You can still sign in, download your data, delete ` +
    `your account and request that the block be lifted.`,

  accountUnblocked: () =>
    `The block on your filahub account has been lifted.\n\nPlease sign in again.`,

  unblockRejected: v =>
    `Your request to lift the block was rejected.\n\n${v.note}`,

  abuseAlert: v =>
    `filahub reports unusual activity:\n\n${v.lines}\n\n` +
    `Details under "Administration → Abuse".`,

  openLink: v => `\n\n${v.url}`,
};

const CATALOGUES: Record<LanguageCode, NotificationMessages> = { de, en };

/**
 * Texte in der Sprache des Empfängers. `null` (Einstellung „automatisch“) fällt
 * auf die Grundsprache zurück – anders als im Browser kann der Server die
 * Sprache nicht erraten, und eine Nachricht muss trotzdem ankommen.
 */
export function notificationMessages(
  language: string | null | undefined
): NotificationMessages {
  return (
    CATALOGUES[(language ?? "") as LanguageCode] ??
    CATALOGUES[FALLBACK_LANGUAGE]
  );
}
