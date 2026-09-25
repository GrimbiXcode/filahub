/** Hilfsfunktionen für die Integrationstests (nur mit `TEST_DATABASE_URL`). */
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closePool, getDb, migrateDb } from "../queries/connection";
import { resetRateLimits } from "../lib/rateLimit";
import { appRouter } from "../router";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import type { LanguageCode } from "@contracts/i18n";

/**
 * Leert die Testdatenbank und spielt anschließend alle Migrationen ein.
 * So startet jeder Lauf auf demselben Stand und der Testlauf ist
 * beliebig wiederholbar.
 *
 * `DROP SCHEMA … CASCADE` statt einer Tabellenliste: so verschwinden auch die
 * Enum-Typen und Sequenzen. Das Schema `drizzle` muss mit weg – dort steht die
 * Migrationshistorie, sonst hielte Drizzle die Migrationen für erledigt.
 *
 * **Der Wiederholungsversuch fängt einen echten Wettlauf**, keinen erdachten:
 * `recordAudit` schreibt bewusst ohne `await` (`api/queries/audit.ts`) – ein
 * Protokolleintrag soll die Antwort nicht aufhalten. Ein solcher `INSERT` kann
 * beim Beginn des nächsten Tests noch unterwegs sein und hält dann eine Sperre
 * auf `audit_log`, während das `DROP SCHEMA` die exklusive Sperre darauf will.
 * Postgres meldet das als Verklemmung (`40P01`) und bricht einen der beiden ab.
 * Ohne diese Schleife scheitert also gelegentlich ein Test an dem, was der
 * **vorige** noch nachreichte – ein Fehlschlag, der mit dem geprüften Verhalten
 * nichts zu tun hat und beim nächsten Lauf verschwindet.
 */
export async function resetSchema() {
  const db = getDb();
  for (let attempt = 0; ; attempt++) {
    try {
      await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
      await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      break;
    } catch (error) {
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      if (code !== "40P01" || attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  await db.execute(sql`CREATE SCHEMA public`);
  await migrateDb();
  /*
    Die Zugriffsbegrenzung zählt im Arbeitsspeicher und überlebt das
    `DROP SCHEMA` (`api/lib/rateLimit.ts`). Ohne diesen Schnitt trüge der
    nächste Test die Zähler des vorigen mit sich – eine Abhängigkeit zwischen
    Tests, die sich erst zeigt, wenn einer von ihnen zufällig das Kontingent
    reißt. Ein frischer Bestand heißt frische Instanz.
  */
  resetRateLimits();
}

/** Schließt den Verbindungspool, sonst endet der Vitest-Prozess nicht. */
export async function closeDb() {
  await closePool();
}

/** tRPC-Aufrufer im Namen eines Benutzers – prüft Middleware und Rollen mit. */
export function callerFor(user: User, language: LanguageCode = "de") {
  return appRouter.createCaller({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    user,
    language,
    // Feste Adresse: Die Tests sollen sich nicht gegenseitig in die Sperre
    // laufen lassen, und die geprüften Prozeduren sind ohnehin authentifiziert.
    clientIp: "127.0.0.1",
  });
}

/** Zeilenanzahl einer Tabelle. */
export async function countRows(table: string) {
  const result = await getDb().execute<{ c: string }>(
    sql`SELECT COUNT(*) AS c FROM ${sql.identifier(table)}`
  );
  return Number(result.rows[0].c);
}

/** Eine Materialzeile in der flachen Form bis 3.1.0 – Material und Gebinde in einem */
export type FlatMaterialValues = Omit<
  typeof schema.materials.$inferInsert,
  "productId"
> &
  Pick<
    typeof schema.materialProducts.$inferInsert,
    | "name"
    | "materialType"
    | "manufacturer"
    | "color"
    | "texture"
    | "densityGramsPerLiter"
  >;

/**
 * Legt Gebinde am Router vorbei an, je eines mit eigenem Material.
 *
 * Seit 4.0.0 stehen Name, Materialart, Hersteller, Farbe, Oberfläche und
 * Dichte am Material (`material_products`). Die Tests, die Bestand direkt in
 * die Datenbank schreiben, tun das weiter in der flachen Form; dieser Helfer
 * teilt sie auf. Liefert die Gebindezeilen in Eingabereihenfolge.
 */
export async function insertMaterials(rows: FlatMaterialValues[]) {
  if (rows.length === 0) return [];
  const db = getDb();
  const products = await db
    .insert(schema.materialProducts)
    .values(
      rows.map(row => ({
        userId: row.userId ?? null,
        organizationId: row.organizationId ?? null,
        name: row.name,
        materialType: row.materialType,
        manufacturer: row.manufacturer,
        color: row.color,
        texture: row.texture,
        densityGramsPerLiter: row.densityGramsPerLiter,
      }))
    )
    .returning({ id: schema.materialProducts.id });
  return db
    .insert(schema.materials)
    .values(
      rows.map((row, i) => {
        const {
          name: _name,
          materialType: _type,
          manufacturer: _manufacturer,
          color: _color,
          texture: _texture,
          densityGramsPerLiter: _density,
          ...gebinde
        } = row;
        return { ...gebinde, productId: products[i].id };
      })
    )
    .returning();
}

/** Wie `insertMaterials`, für ein einzelnes Gebinde */
export async function insertMaterial(row: FlatMaterialValues) {
  const [material] = await insertMaterials([row]);
  return material;
}

/**
 * Leert die Testdatenbank und spielt die Migrationen nur **bis vor**
 * `beforeIdx` ein – für Tests, die einen Backfill an einem Altbestand prüfen,
 * dessen Spalten eine spätere Migration gelöscht hat (seit 4.0.0 etwa
 * `materials.materialType`). Über eine Kopie des Migrationsordners mit
 * gekürztem Journal; der eigentliche Ordner bleibt unberührt.
 *
 * Danach steht die Datenbank auf einem alten Stand – der nächste Test muss
 * `resetSchema()` aufrufen, bevor er den Router benutzt.
 */
export async function migrateUntil(beforeIdx: number) {
  const db = getDb();
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  const folder = await mkdtemp(join(tmpdir(), "filahub-migrations-"));
  try {
    await cp("db/migrations", folder, { recursive: true });
    const journalPath = join(folder, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: { idx: number }[];
    };
    journal.entries = journal.entries.filter(entry => entry.idx < beforeIdx);
    await writeFile(journalPath, JSON.stringify(journal));
    await migrate(db, { migrationsFolder: folder });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Ändert das Material, zu dem ein Gebinde gehört – am Router vorbei. */
export async function setProductOf(
  materialId: number,
  values: Partial<typeof schema.materialProducts.$inferInsert>
) {
  const db = getDb();
  const [row] = await db
    .select({ productId: schema.materials.productId })
    .from(schema.materials)
    .where(eq(schema.materials.id, materialId));
  await db
    .update(schema.materialProducts)
    .set(values)
    .where(eq(schema.materialProducts.id, row.productId));
}
