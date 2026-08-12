/**
 * Enthält dieser Änderungssatz überhaupt etwas?
 *
 * Alle `update`-Prozeduren nehmen ihre Felder als `.partial()` entgegen; eine
 * Anfrage ohne ein einziges davon ist damit erlaubte Eingabe. Drizzle machte
 * daraus ein `SET` ohne Zuweisung, Postgres antwortete mit einem Syntaxfehler,
 * und der kam als 500 heraus – aus einer Anfrage, die nichts Verbotenes wollte.
 * Nichts zu ändern ist keine Störung; die richtige Antwort ist der unveränderte
 * Stand.
 *
 * `undefined` zählt nicht als Änderung, `null` schon: Das ist der Unterschied
 * zwischen „Feld nicht mitgeschickt“ und „Feld leeren“.
 *
 * Steht in einer eigenen Datei, weil alle vier Bestandstabellen sie brauchen –
 * `lager.ts` und `filament.ts` sind Geschwister, und eine von beiden zur
 * Heimat des Helfers zu machen hieße, die andere von ihr abhängig zu machen.
 */
export function hasChanges(data: object): boolean {
  return Object.values(data).some(value => value !== undefined);
}
