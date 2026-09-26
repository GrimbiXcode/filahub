import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { normalizeMaterialType } from "@contracts/materials";
import {
  normalizeTags,
  type PrintJobInput,
  type PrintJobStatus,
} from "@contracts/printJobs";
import {
  consumptions,
  materialProducts,
  materials,
  printJobLinks,
  printJobMaterials,
  printJobs,
} from "@db/schema";
import { scopeOwner, scopeWhere, type Scope } from "../scope";
import { getDb } from "./connection";
import { lockProductInScope } from "./products";

/**
 * Druckhistorie (seit 4.2.0).
 *
 * **Der Verbrauch bleibt die einzige Wahrheit für die Restmenge.** Ein Druck
 * mit Gebinde und Grammzahl bucht einen gewöhnlichen Verbrauch ab (dieselbe
 * Tabelle wie `material.addConsumption`) und merkt sich dessen ID in
 * `print_job_materials.consumptionId`. Es gibt keine zweite Restmengenrechnung
 * über Drucke.
 *
 * Alle Schreibpfade laufen in **einer** Transaktion: Ein Druck ohne seine
 * Verbräuche oder Verbräuche ohne ihren Druck wären zwei Wahrheiten.
 */

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Fehlerkennungen der Schreibpfade – der Router übersetzt sie. */
export const PRINT_JOB_NOT_FOUND = "PRINT_JOB_NOT_FOUND";
export const PRINT_JOB_BAD_MATERIAL = "PRINT_JOB_BAD_MATERIAL";
export const PRINT_JOB_USED_UP = "PRINT_JOB_USED_UP";

type OldRow = typeof printJobMaterials.$inferSelect;
type InputRow = PrintJobInput["materials"][number];

/**
 * Je Eingabezeile, was mit ihr geschieht. `previous` ist die alte Zeile an
 * derselben Stelle, **wenn sie unverändert ist** (Material, Gebinde, Gramm).
 *
 * Eine unveränderte Zeile behält ihren Zustand: War sie abgebucht, wird sie
 * es wieder (etwa mit neuem Datum); war sie es nicht – weil jemand den
 * Verbrauch einzeln gelöscht hat –, bleibt sie es auch. Sonst holte jede
 * Datumskorrektur einen bewusst gelöschten Verbrauch still zurück.
 */
type RowPlan = { row: InputRow; previous: OldRow | null; book: boolean };

function planRows(
  input: readonly InputRow[],
  old: readonly OldRow[] = []
): RowPlan[] {
  return input.map((row, i) => {
    const candidate = old[i];
    const previous =
      candidate &&
      candidate.productId === row.productId &&
      candidate.materialId === (row.materialId ?? null) &&
      candidate.grams === row.grams
        ? candidate
        : null;
    const bookable = row.materialId != null && row.grams > 0;
    return {
      row,
      previous,
      book: bookable && (previous ? previous.consumptionId != null : true),
    };
  });
}

/**
 * Prüft die Materialzeilen gegen den Bereich und liefert je Material den
 * Namen für den Schnappschuss.
 *
 * Unter Sperre: die Materialien (`lockProductInScope`), damit keines zwischen
 * Prüfung und Schreiben mit seinem letzten Gebinde verschwindet, und die
 * Gebinde (`FOR SHARE`), damit keines gelöscht wird, während hier ein
 * Verbrauch darauf entsteht – `deleteMaterial` sperrt das Gebinde deshalb als
 * Erstes.
 */
async function checkMaterialRows(
  tx: Tx,
  scope: Scope,
  plans: readonly RowPlan[]
): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const productIds = [...new Set(plans.map(p => p.row.productId))].sort(
    (a, b) => a - b
  );
  for (const productId of productIds) {
    if (!(await lockProductInScope(tx, scope, productId)))
      throw new Error(PRINT_JOB_BAD_MATERIAL);
  }
  if (productIds.length > 0) {
    const products = await tx
      .select({ id: materialProducts.id, name: materialProducts.name })
      .from(materialProducts)
      .where(inArray(materialProducts.id, productIds));
    for (const p of products) names.set(p.id, p.name);
  }
  const gebindeIds = [
    ...new Set(
      plans.flatMap(p => (p.row.materialId ? [p.row.materialId] : []))
    ),
  ].sort((a, b) => a - b);
  if (gebindeIds.length > 0) {
    const gebinde = await tx
      .select({
        id: materials.id,
        productId: materials.productId,
        archivedAt: materials.archivedAt,
      })
      .from(materials)
      .where(
        and(inArray(materials.id, gebindeIds), scopeWhere(materials, scope))
      )
      .orderBy(materials.id)
      .for("share");
    const byId = new Map(gebinde.map(g => [g.id, g]));
    for (const { row, previous, book } of plans) {
      if (!row.materialId) continue;
      const g = byId.get(row.materialId);
      // Das Gebinde muss immer zum Bereich gehören …
      if (!g) throw new Error(PRINT_JOB_BAD_MATERIAL);
      /*
        … und zum genannten Material – außer die Zeile ist unverändert: Wurde
        das Gebinde seither einem anderen Material zugeordnet, bleibt der Druck
        beim Material von damals (Schnappschuss), und ein Umdatieren darf
        daran nicht scheitern.
      */
      if (!previous && g.productId !== row.productId)
        throw new Error(PRINT_JOB_BAD_MATERIAL);
      /*
        Von einem aufgebrauchten Gebinde wird nichts **neu** abgebucht. Eine
        unveränderte Zeile darf es behalten – sonst ließe sich ein alter Druck
        nicht mehr umdatieren, sobald seine Rolle leer ist.
      */
      if (g.archivedAt != null && book && !previous)
        throw new Error(PRINT_JOB_USED_UP);
    }
  }
  return names;
}

/**
 * Prüft die Obergrenze der Verbräuche je Gebinde, **nach** der
 * Bereichsprüfung und nach dem Zurücknehmen der alten Buchungen – sonst
 * verriete die Meldung fremde Gebinde, und ein Druck, der nur umgebucht wird,
 * stieße an seine eigenen Verbräuche.
 */
export type ConsumptionRoomCheck = (
  materialId: number,
  current: number,
  adding: number
) => void;

/** Schreibt Links und Materialzeilen samt Verbräuchen eines Drucks. */
async function insertChildren(
  tx: Tx,
  printJobId: number,
  input: PrintJobInput,
  plans: readonly RowPlan[],
  names: Map<number, string>,
  options: { firstPosition?: number; assertRoom?: ConsumptionRoomCheck } = {}
) {
  if (input.links.length > 0) {
    await tx.insert(printJobLinks).values(
      input.links.map((link, position) => ({
        printJobId,
        url: link.url,
        label: link.label?.trim() || null,
        position,
      }))
    );
  }
  if (options.assertRoom) {
    const adding = new Map<number, number>();
    for (const { row, book } of plans)
      if (book && row.materialId)
        adding.set(row.materialId, (adding.get(row.materialId) ?? 0) + 1);
    for (const [materialId, count] of adding) {
      const [{ value }] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(consumptions)
        .where(eq(consumptions.materialId, materialId));
      options.assertRoom(materialId, value, count);
    }
  }
  let position = options.firstPosition ?? 0;
  for (const { row, book } of plans) {
    let consumptionId: number | null = null;
    if (book && row.materialId) {
      const [created] = await tx
        .insert(consumptions)
        .values({
          materialId: row.materialId,
          weight: row.grams,
          consumedAt: input.printedAt,
          note: input.title.slice(0, 500),
        })
        .returning({ id: consumptions.id });
      consumptionId = created.id;
    }
    await tx.insert(printJobMaterials).values({
      printJobId,
      productId: row.productId,
      productName: names.get(row.productId) ?? "",
      materialId: row.materialId ?? null,
      grams: row.grams,
      consumptionId,
      position: position++,
    });
  }
}

function jobColumns(input: PrintJobInput) {
  return {
    title: input.title,
    printedAt: input.printedAt,
    status: input.status,
    durationMinutes: input.durationMinutes,
    printer: input.printer?.trim() || null,
    notes: input.notes?.trim() || null,
    tags: normalizeTags(input.tags),
  };
}

export async function createPrintJob(
  scope: Scope,
  input: PrintJobInput,
  assertRoom?: ConsumptionRoomCheck
): Promise<number> {
  return getDb().transaction(async tx => {
    const plans = planRows(input.materials);
    const names = await checkMaterialRows(tx, scope, plans);
    const [{ id }] = await tx
      .insert(printJobs)
      .values({ ...jobColumns(input), ...scopeOwner(scope) })
      .returning({ id: printJobs.id });
    await insertChildren(tx, id, input, plans, names, { assertRoom });
    return id;
  });
}

/**
 * Ändert einen Druck. Materialien und Zeitpunkt wirken auf den Bestand: Hat
 * sich eines davon geändert, werden die alten Verbräuche zurückgenommen und
 * neu gebucht – sonst bleiben sie unangetastet (auch ihre IDs, auf die die
 * Korrekturregel der Verbräuche schaut). Welche Zeile dabei wieder abbucht,
 * entscheidet `planRows`.
 *
 * Zeilen, deren Material es nicht mehr gibt (`productId` NULL), kann die
 * Eingabe nicht nennen – das Schema verlangt ein Material. Sie bleiben
 * deshalb unberührt stehen, zählen nicht zum Vergleich und haben ohnehin
 * keinen Verbrauch mehr (das Löschen des Gebindes hat ihn gelöst).
 */
export async function updatePrintJob(
  scope: Scope,
  id: number,
  input: PrintJobInput,
  assertRoom?: ConsumptionRoomCheck
): Promise<void> {
  await getDb().transaction(async tx => {
    const [job] = await tx
      .select({ id: printJobs.id, printedAt: printJobs.printedAt })
      .from(printJobs)
      .where(and(eq(printJobs.id, id), scopeWhere(printJobs, scope)))
      .for("update");
    if (!job) throw new Error(PRINT_JOB_NOT_FOUND);
    const all = await tx
      .select()
      .from(printJobMaterials)
      .where(eq(printJobMaterials.printJobId, id))
      .orderBy(printJobMaterials.position);
    const old = all.filter(r => r.productId != null);
    const orphans = all.length - old.length;
    const plans = planRows(input.materials, old);
    const rebook =
      old.length !== plans.length ||
      plans.some(p => !p.previous) ||
      job.printedAt.getTime() !== input.printedAt.getTime();
    const names = rebook
      ? await checkMaterialRows(tx, scope, plans)
      : new Map<number, string>();

    await tx
      .update(printJobs)
      .set(jobColumns(input))
      .where(eq(printJobs.id, id));
    await tx.delete(printJobLinks).where(eq(printJobLinks.printJobId, id));
    if (rebook) {
      const booked = old.flatMap(r =>
        r.consumptionId ? [r.consumptionId] : []
      );
      if (booked.length > 0)
        await tx.delete(consumptions).where(inArray(consumptions.id, booked));
      if (old.length > 0)
        await tx.delete(printJobMaterials).where(
          inArray(
            printJobMaterials.id,
            old.map(r => r.id)
          )
        );
      // Den Schnappschuss unveränderter Zeilen behalten, wo das Material
      // nicht mehr gelesen wurde (siehe `checkMaterialRows`)
      for (const { row, previous } of plans)
        if (previous && !names.has(row.productId))
          names.set(row.productId, previous.productName);
      // Hinter den stehengebliebenen Zeilen weiterzählen
      const maxPosition = Math.max(-1, ...all.map(r => r.position));
      await insertChildren(tx, id, input, plans, names, {
        firstPosition: orphans > 0 ? maxPosition + 1 : 0,
        assertRoom,
      });
    } else {
      await insertChildren(tx, id, { ...input, materials: [] }, [], names);
    }
  });
}

/**
 * Löscht einen Druck. Mit `revertConsumptions` gehen die abgebuchten
 * Verbräuche mit (die Restmenge steigt wieder), sonst bleiben sie stehen und
 * verlieren nur ihren Bezug – der Druck war dann eben ein Eintrag zu viel,
 * das Material ist trotzdem weg.
 */
export async function deletePrintJob(
  scope: Scope,
  id: number,
  revertConsumptions: boolean
): Promise<boolean> {
  return getDb().transaction(async tx => {
    const [job] = await tx
      .select({ id: printJobs.id })
      .from(printJobs)
      .where(and(eq(printJobs.id, id), scopeWhere(printJobs, scope)))
      .for("update");
    if (!job) return false;
    if (revertConsumptions) {
      const rows = await tx
        .select({ consumptionId: printJobMaterials.consumptionId })
        .from(printJobMaterials)
        .where(eq(printJobMaterials.printJobId, id));
      const booked = rows.flatMap(r =>
        r.consumptionId ? [r.consumptionId] : []
      );
      if (booked.length > 0)
        await tx.delete(consumptions).where(inArray(consumptions.id, booked));
    }
    await tx.delete(printJobLinks).where(eq(printJobLinks.printJobId, id));
    await tx
      .delete(printJobMaterials)
      .where(eq(printJobMaterials.printJobId, id));
    await tx.delete(printJobs).where(eq(printJobs.id, id));
    return true;
  });
}

/** Die blanke Zeile im Bereich – für Rechteprüfungen */
export function findPrintJobRowInScope(scope: Scope, id: number) {
  return getDb().query.printJobs.findFirst({
    where: and(eq(printJobs.id, id), scopeWhere(printJobs, scope)),
  });
}

/** Der zuletzt erfasste Druck des Bereichs (höchste ID) – für `mayDeletePrintJob` */
export async function findLatestPrintJobId(
  scope: Scope
): Promise<number | null> {
  const rows = await getDb()
    .select({ id: printJobs.id })
    .from(printJobs)
    .where(scopeWhere(printJobs, scope))
    .orderBy(desc(printJobs.id))
    .limit(1);
  return rows.at(0)?.id ?? null;
}

/** Wie viele Drucke der Bereich hat – Grundlage der Obergrenze. */
export async function countPrintJobsInScope(scope: Scope): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(printJobs)
    .where(scopeWhere(printJobs, scope));
  return Number(rows.at(0)?.value ?? 0);
}

/** Drucker und Tags, die im Bereich vorkommen – Vorschläge und Filter */
export async function findPrintJobFacets(
  scope: Scope
): Promise<{ printers: string[]; tags: string[] }> {
  const db = getDb();
  const [printerRows, tagRows] = await Promise.all([
    db
      .selectDistinct({ printer: printJobs.printer })
      .from(printJobs)
      .where(
        and(scopeWhere(printJobs, scope), sql`${printJobs.printer} IS NOT NULL`)
      )
      .orderBy(printJobs.printer),
    db.execute<{ tag: string }>(
      sql`SELECT DISTINCT unnest(${printJobs.tags}) AS tag FROM ${printJobs} WHERE ${scopeWhere(printJobs, scope)} ORDER BY tag`
    ),
  ]);
  return {
    printers: printerRows.flatMap(r => (r.printer ? [r.printer] : [])),
    tags: tagRows.rows.map(r => r.tag),
  };
}

export type PrintJobFilters = {
  query?: string;
  productId?: number;
  materialId?: number;
  materialType?: string;
  status?: PrintJobStatus;
  printer?: string;
  tag?: string;
  from?: Date;
  to?: Date;
};

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, char => `\\${char}`);
}

/** Die Bedingungen der Liste – jede als eigener Baustein, und-verknüpft */
function filterConditions(scope: Scope, f: PrintJobFilters): SQL[] {
  const db = getDb();
  const conditions: SQL[] = [scopeWhere(printJobs, scope)];
  const materialRows = (condition: SQL) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(printJobMaterials)
        .where(and(eq(printJobMaterials.printJobId, printJobs.id), condition))
    );
  const term = f.query?.trim();
  if (term) {
    const pattern = `%${escapeLike(term)}%`;
    conditions.push(
      or(
        ilike(printJobs.title, pattern),
        ilike(printJobs.notes, pattern),
        sql`array_to_string(${printJobs.tags}, ' ') ILIKE ${pattern}`,
        ilike(printJobs.printer, pattern),
        exists(
          db
            .select({ one: sql`1` })
            .from(printJobLinks)
            .where(
              and(
                eq(printJobLinks.printJobId, printJobs.id),
                or(
                  ilike(printJobLinks.url, pattern),
                  ilike(printJobLinks.label, pattern)
                )
              )
            )
        ),
        /*
          Der Name, wie er angezeigt wird: der aktuelle des Materials, sonst
          der Schnappschuss. Nur den Schnappschuss zu durchsuchen fände ein
          umbenanntes oder zusammengeführtes Material nicht mehr.
        */
        materialRows(
          or(
            ilike(printJobMaterials.productName, pattern),
            inArray(
              printJobMaterials.productId,
              db
                .select({ id: materialProducts.id })
                .from(materialProducts)
                .where(
                  and(
                    scopeWhere(materialProducts, scope),
                    ilike(materialProducts.name, pattern)
                  )
                )
            )
          )!
        )
      )!
    );
  }
  if (f.productId != null)
    conditions.push(materialRows(eq(printJobMaterials.productId, f.productId)));
  if (f.materialId != null)
    conditions.push(
      materialRows(eq(printJobMaterials.materialId, f.materialId))
    );
  if (f.materialType?.trim()) {
    const key = normalizeMaterialType(f.materialType);
    conditions.push(
      materialRows(
        inArray(
          printJobMaterials.productId,
          db
            .select({ id: materialProducts.id })
            .from(materialProducts)
            .where(
              and(
                scopeWhere(materialProducts, scope),
                sql`upper(regexp_replace(btrim(${materialProducts.materialType}), '\\s+', ' ', 'g')) = ${key}`
              )
            )
        )
      )
    );
  }
  if (f.status) conditions.push(eq(printJobs.status, f.status));
  if (f.printer?.trim())
    conditions.push(eq(printJobs.printer, f.printer.trim()));
  if (f.tag?.trim()) {
    const [tag] = normalizeTags([f.tag]);
    if (tag) conditions.push(sql`${tag} = ANY(${printJobs.tags})`);
  }
  if (f.from) conditions.push(gte(printJobs.printedAt, f.from));
  if (f.to) conditions.push(lte(printJobs.printedAt, f.to));
  return conditions;
}

/** Materialien und Links zu einer Menge von Drucken, je Druck sortiert */
async function loadChildren(ids: number[]) {
  if (ids.length === 0)
    return {
      materialsByJob: new Map<number, PrintJobMaterialView[]>(),
      linksByJob: new Map<number, (typeof printJobLinks.$inferSelect)[]>(),
    };
  const db = getDb();
  const [materialRows, linkRows] = await Promise.all([
    db
      .select({
        row: printJobMaterials,
        product: {
          id: materialProducts.id,
          name: materialProducts.name,
          color: materialProducts.color,
          texture: materialProducts.texture,
        },
        gebinde: {
          id: materials.id,
          identifier: materials.identifier,
          archivedAt: materials.archivedAt,
        },
      })
      .from(printJobMaterials)
      .leftJoin(
        materialProducts,
        eq(materialProducts.id, printJobMaterials.productId)
      )
      .leftJoin(materials, eq(materials.id, printJobMaterials.materialId))
      .where(inArray(printJobMaterials.printJobId, ids))
      .orderBy(printJobMaterials.position),
    db
      .select()
      .from(printJobLinks)
      .where(inArray(printJobLinks.printJobId, ids))
      .orderBy(printJobLinks.position),
  ]);
  const materialsByJob = new Map<number, PrintJobMaterialView[]>();
  for (const { row, product, gebinde } of materialRows) {
    const view: PrintJobMaterialView = {
      id: row.id,
      productId: product?.id ?? null,
      /** Der aktuelle Name, sonst der Schnappschuss */
      name: product?.name ?? row.productName,
      color: product?.color ?? null,
      texture: product?.texture ?? null,
      materialId: row.materialId,
      identifier: gebinde?.identifier ?? null,
      gebindeArchived: gebinde?.archivedAt != null,
      grams: row.grams,
      booked: row.consumptionId != null,
    };
    const list = materialsByJob.get(row.printJobId);
    if (list) list.push(view);
    else materialsByJob.set(row.printJobId, [view]);
  }
  const linksByJob = new Map<number, (typeof printJobLinks.$inferSelect)[]>();
  for (const link of linkRows) {
    const list = linksByJob.get(link.printJobId);
    if (list) list.push(link);
    else linksByJob.set(link.printJobId, [link]);
  }
  return { materialsByJob, linksByJob };
}

export type PrintJobMaterialView = {
  id: number;
  productId: number | null;
  name: string;
  color: string | null;
  texture: string | null;
  materialId: number | null;
  identifier: string | null;
  gebindeArchived: boolean;
  grams: number;
  /** Ob für diese Zeile ein Verbrauch gebucht ist */
  booked: boolean;
};

/**
 * Eine Seite der Druckhistorie, neueste zuerst. `cursor` ist der letzte
 * Eintrag der vorigen Seite (`printedAt`, `id`).
 */
export async function listPrintJobs(
  scope: Scope,
  filters: PrintJobFilters,
  cursor: { printedAt: Date; id: number } | null,
  limit: number
) {
  const conditions = filterConditions(scope, filters);
  if (cursor) {
    conditions.push(
      or(
        lt(printJobs.printedAt, cursor.printedAt),
        and(
          eq(printJobs.printedAt, cursor.printedAt),
          lt(printJobs.id, cursor.id)
        )
      )!
    );
  }
  const rows = await getDb()
    .select()
    .from(printJobs)
    .where(and(...conditions))
    .orderBy(desc(printJobs.printedAt), desc(printJobs.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const { materialsByJob, linksByJob } = await loadChildren(
    page.map(j => j.id)
  );
  return {
    items: page.map(job => ({
      ...job,
      materials: materialsByJob.get(job.id) ?? [],
      links: linksByJob.get(job.id) ?? [],
    })),
    hasMore: rows.length > limit,
  };
}

/** Ein Druck mit Materialien und Links, oder `null` */
export async function findPrintJobInScope(scope: Scope, id: number) {
  const job = await findPrintJobRowInScope(scope, id);
  if (!job) return null;
  const { materialsByJob, linksByJob } = await loadChildren([id]);
  return {
    ...job,
    materials: materialsByJob.get(id) ?? [],
    links: linksByJob.get(id) ?? [],
  };
}
