import { z } from "zod";

/**
 * Spalten der Materialübersicht und die Auswahl, welche davon jemand sehen
 * will.
 *
 * Die Liste steht in `contracts/`, weil sie beide Seiten bedient: Die
 * Oberfläche baut daraus das Auswahlmenü, der Server prüft damit, was
 * gespeichert werden darf. Nur die Kennungen – die Beschriftungen hängen an
 * der Sprache und stehen deshalb im Frontend (`src/lib/materialColumns.ts`).
 *
 * Wie `contracts/i18n.ts` wird diese Datei von Client, Server und Tests
 * importiert und darf zur Laufzeit nichts aus `@db` oder `api/` laden.
 */

/** Kennungen in der Reihenfolge, in der die Spalten in der Tabelle stehen */
export const MATERIAL_COLUMNS = [
  "identifier",
  "name",
  "type",
  "manufacturer",
  "remaining",
  "containerBox",
  "price",
  "purchase",
  "actions",
] as const;

export type MaterialColumn = (typeof MATERIAL_COLUMNS)[number];

/**
 * Spalten, die sich nicht abschalten lassen.
 *
 * `name` ist die Zeile selbst – eine Tabelle aus Preisen und Kaufdaten ohne
 * Bezeichnung ist keine Übersicht mehr, sondern ein Rätsel. `actions` trägt
 * „Wiegen“, den häufigsten Griff der ganzen Seite; wer die Spalte ausblendet,
 * verliert ihn ohne sichtbaren Ersatz.
 */
export const LOCKED_MATERIAL_COLUMNS = [
  "name",
  "actions",
] as const satisfies readonly MaterialColumn[];

type LockedMaterialColumn = (typeof LOCKED_MATERIAL_COLUMNS)[number];

export type ToggleableMaterialColumn = Exclude<
  MaterialColumn,
  LockedMaterialColumn
>;

/** Die abschaltbaren Spalten, in Tabellenreihenfolge – so steht auch das Menü */
export const TOGGLEABLE_MATERIAL_COLUMNS = MATERIAL_COLUMNS.filter(
  (column): column is ToggleableMaterialColumn =>
    !(LOCKED_MATERIAL_COLUMNS as readonly MaterialColumn[]).includes(column)
);

const MATERIAL_COLUMN_VALUES = MATERIAL_COLUMNS as unknown as [
  MaterialColumn,
  ...MaterialColumn[],
];

export const materialColumnSchema = z.enum(MATERIAL_COLUMN_VALUES);

/**
 * Eingabe der Mutation. `null` heißt „zurück auf Standard“ und ist damit
 * gleichbedeutend mit einer leeren Liste – siehe `normalizeHiddenColumns`.
 */
export const hiddenMaterialColumnsSchema = z
  .array(materialColumnSchema)
  .max(MATERIAL_COLUMNS.length)
  .nullable();

/**
 * Bringt eine gespeicherte Auswahl auf einen brauchbaren Stand.
 *
 * Gespeichert werden die **ausgeblendeten** Spalten, nicht die sichtbaren.
 * Das ist der Kern der Sache: `NULL` und `[]` heißen beide „alles wie
 * ausgeliefert“, und eine Spalte, die später dazukommt, ist für alle da –
 * statt still zu fehlen, weil sie in keiner der gespeicherten Auswahlen steht.
 * Dieselbe Überlegung wie bei `users.language`, wo `NULL` „automatisch“ heißt.
 *
 * Aussortiert wird alles, was hier nicht hergehört: unbekannte Kennungen (eine
 * Zeile kann von einer neueren Fassung geschrieben worden sein, oder eine
 * Spalte ist inzwischen weggefallen), gesperrte Spalten und Dubletten. Der
 * Abgleich mit der Wirklichkeit ist der eigentliche Zweck – ohne ihn genügte
 * ein alter Wert, um die Übersicht dauerhaft schiefzuziehen.
 */
export function normalizeHiddenColumns(raw: unknown): MaterialColumn[] {
  if (!Array.isArray(raw)) return [];
  const locked = LOCKED_MATERIAL_COLUMNS as readonly MaterialColumn[];
  /*
    Über `MATERIAL_COLUMNS` gefiltert und nicht über die Eingabe: Das wirft
    unbekannte Kennungen und Dubletten in einem Durchgang weg und liefert die
    Reihenfolge der Tabelle statt der zufälligen des Speicherstands.
  */
  return MATERIAL_COLUMNS.filter(
    column => !locked.includes(column) && raw.includes(column)
  );
}
