/**
 * Fotos und 3MF zu Drucken gegen eine echte PostgreSQL-Datenbank (seit
 * 4.3.0): Hochladen, Ausliefern, Bereich und Stufen, Obergrenzen, Löschen
 * samt Kaskaden, Aufräumlauf und der ZIP-Export.
 *
 * Die Ablage ist je Test ein Wegwerf-Verzeichnis (`setFileStorage`).
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 */
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { eq } from "drizzle-orm";
import { strToU8, unzipSync, zipSync } from "fflate";
import { Session } from "@contracts/constants";
import {
  MAX_FILES_PER_PRINT_JOB,
  MAX_STORAGE_BYTES_PER_SCOPE,
} from "@contracts/limits";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import app from "./app";
import { localFileStorage, setFileStorage } from "./lib/fileStorage";
import { resetRateLimits } from "./lib/rateLimit";
import { deleteUserAccount } from "./queries/account";
import { blockUser } from "./queries/blocking";
import { getDb } from "./queries/connection";
import { sweepOrphanFiles, type PrintFileView } from "./queries/printFiles";
import { findUserByUnionId, upsertUser } from "./queries/users";
import { signSessionToken } from "./telegram/session";
import {
  callerFor,
  closeDb,
  countRows,
  resetSchema,
} from "./test/integration-db";

const db = () => getDb();
const PERSONAL = { organizationId: null } as const;

let anna: User;
let bert: User;
let dir: string;

beforeAll(async () => {
  await resetSchema();
}, 60_000);

afterAll(async () => {
  setFileStorage(null);
  await closeDb();
});

beforeEach(async () => {
  await resetSchema();
  resetRateLimits();
  await upsertUser({ unionId: "anna-1", name: "Anna" });
  await upsertUser({ unionId: "bert-1", name: "Bert" });
  anna = (await findUserByUnionId("anna-1"))!;
  bert = (await findUserByUnionId("bert-1"))!;
  dir = await mkdtemp(path.join(tmpdir(), "filahub-files-"));
  setFileStorage(localFileStorage(dir));
}, 60_000);

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// --- Fixtures -------------------------------------------------------------

const be32 = (n: number) => [
  (n >>> 24) & 0xff,
  (n >> 16) & 0xff,
  (n >> 8) & 0xff,
  n & 0xff,
];
const chunk = (type: string, data: number[]) => [
  ...be32(data.length),
  ...[...type].map(c => c.charCodeAt(0)),
  ...data,
  0,
  0,
  0,
  0,
];

/** Ein PNG-Kopf – mehr liest die Erkennung nicht */
function png(width = 800, height = 600, extra: number[][] = []) {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", [...be32(width), ...be32(height), 8, 6, 0, 0, 0]),
    ...extra.flat(),
    ...chunk("IDAT", [1, 2, 3, 4]),
    ...chunk("IEND", []),
  ]);
}

function model3mf() {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "3D/3dmodel.model": strToU8("<model/>"),
  });
}

async function cookieFor(user: User) {
  const token = await signSessionToken({
    unionId: user.unionId,
    tokenVersion: user.tokenVersion,
  });
  return `${Session.cookieName}=${token}`;
}

async function upload(
  user: User,
  printJobId: number,
  file: { bytes: Uint8Array; name: string },
  options: { organizationId?: number; thumbnail?: Uint8Array } = {}
) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(file.bytes)], file.name));
  if (options.thumbnail)
    form.append(
      "thumbnail",
      new File([new Uint8Array(options.thumbnail)], "vorschau.png")
    );
  const query = options.organizationId
    ? `?organizationId=${options.organizationId}`
    : "";
  return app.request(`/api/files/print-jobs/${printJobId}${query}`, {
    method: "POST",
    body: form,
    headers: { cookie: await cookieFor(user) },
  });
}

/** Hochladen, das gelingen muss – liefert die Antwort als Datei */
async function uploadView(
  ...args: Parameters<typeof upload>
): Promise<PrintFileView> {
  const response = await upload(...args);
  expect(response.status).toBe(201);
  return (await response.json()) as PrintFileView;
}

async function get(user: User | null, url: string) {
  return app.request(url, {
    headers: user ? { cookie: await cookieFor(user) } : {},
  });
}

async function printFor(user: User, organizationId: number | null = null) {
  const { id } = await callerFor(user).print.create({
    organizationId,
    title: "Vase",
    printedAt: new Date("2026-09-01T10:00:00Z"),
    status: "success",
    durationMinutes: null,
    printer: null,
    notes: null,
    tags: [],
    links: [],
    materials: [],
  });
  return id;
}

async function storedFiles() {
  const result: string[] = [];
  for (const shard of await readdir(dir).catch(() => [])) {
    for (const name of await readdir(path.join(dir, shard))) result.push(name);
  }
  return result;
}

// --- Tests ----------------------------------------------------------------

describe("Hochladen und Ausliefern", () => {
  it("nimmt ein Foto samt Vorschau an und macht es zum Titelbild", async () => {
    const jobId = await printFor(anna);
    const response = await upload(
      anna,
      jobId,
      { bytes: png(), name: "../../Benchy.png" },
      { thumbnail: png(240, 180) }
    );
    expect(response.status).toBe(201);
    const view = (await response.json()) as PrintFileView;
    expect(view).toMatchObject({
      kind: "image",
      mimeType: "image/png",
      originalName: "Benchy.png",
      width: 800,
      height: 600,
      hasThumbnail: true,
    });
    expect(view).not.toHaveProperty("storageKey");
    expect(await storedFiles()).toHaveLength(2);

    const detail = await callerFor(anna).print.byId({ ...PERSONAL, id: jobId });
    expect(detail.coverFileId).toBe(view.id);
    expect(detail.files.map(f => [f.id, f.canDelete])).toEqual([
      [view.id, true],
    ]);

    const file = await get(anna, `/api/files/${view.id}`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(file.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(png());

    const thumb = await get(anna, `/api/files/${view.id}/thumbnail`);
    expect(new Uint8Array(await thumb.arrayBuffer())).toEqual(png(240, 180));
  });

  it("liefert 3MF immer als Download", async () => {
    const jobId = await printFor(anna);
    const response = await upload(anna, jobId, {
      bytes: model3mf(),
      name: "Gehäuse.3mf",
    });
    expect(response.status).toBe(201);
    const view = (await response.json()) as PrintFileView;
    expect(view).toMatchObject({ kind: "model_3mf", mimeType: "model/3mf" });
    const file = await get(anna, `/api/files/${view.id}`);
    expect(file.headers.get("content-disposition")).toBe(
      "attachment; filename=\"Geh_use.3mf\"; filename*=UTF-8''Geh%C3%A4use.3mf"
    );
    // Ein 3MF ist nie Titelbild
    const detail = await callerFor(anna).print.byId({ ...PERSONAL, id: jobId });
    expect(detail.coverFileId).toBeNull();
  });

  it("lehnt falsche Typen und Fotos mit Metadaten ab – ohne Spur", async () => {
    const jobId = await printFor(anna);
    const svg = strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(
      (await upload(anna, jobId, { bytes: svg, name: "a.png" })).status
    ).toBe(415);
    const office = zipSync({ "word/document.xml": strToU8("<w/>") });
    expect(
      (await upload(anna, jobId, { bytes: office, name: "a.3mf" })).status
    ).toBe(415);
    const withGps = png(800, 600, [chunk("eXIf", [1, 2, 3])]);
    expect(
      (await upload(anna, jobId, { bytes: withGps, name: "a.png" })).status
    ).toBe(422);
    const badThumb = await upload(
      anna,
      jobId,
      { bytes: png(), name: "a.png" },
      { thumbnail: svg }
    );
    expect(badThumb.status).toBe(422);
    expect(await countRows("print_job_files")).toBe(0);
    expect(await storedFiles()).toEqual([]);
  });
});

describe("Bereich, Stufen und Sperre", () => {
  it("gibt fremde Drucke und Dateien als 404 aus", async () => {
    const jobId = await printFor(anna);
    const own = await uploadView(anna, jobId, { bytes: png(), name: "a.png" });
    expect(
      (await upload(bert, jobId, { bytes: png(), name: "b.png" })).status
    ).toBe(404);
    expect((await get(bert, `/api/files/${own.id}`)).status).toBe(404);
    expect((await get(null, `/api/files/${own.id}`)).status).toBe(401);
    await expect(
      callerFor(bert).print.deleteFile({ ...PERSONAL, id: own.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lässt in der Organisation viewer sehen, weigher hochladen", async () => {
    const org = await callerFor(anna).organization.create({ name: "Hub" });
    const jobId = await printFor(anna, org.id);
    // Kein Mitglied: nicht einmal die Existenz der Organisation
    expect(
      (
        await upload(
          bert,
          jobId,
          { bytes: png(), name: "b.png" },
          { organizationId: org.id }
        )
      ).status
    ).toBe(404);
    await db()
      .insert(schema.organizationMembers)
      .values({ organizationId: org.id, userId: bert.id, role: "viewer" });
    expect(
      (
        await upload(
          bert,
          jobId,
          { bytes: png(), name: "b.png" },
          { organizationId: org.id }
        )
      ).status
    ).toBe(403);
    const annas = await uploadView(
      anna,
      jobId,
      { bytes: png(), name: "a.png" },
      { organizationId: org.id }
    );
    expect((await get(bert, `/api/files/${annas.id}`)).status).toBe(200);
    await db()
      .update(schema.organizationMembers)
      .set({ role: "weigher" })
      .where(eq(schema.organizationMembers.userId, bert.id));
    const berts = await uploadView(
      bert,
      jobId,
      { bytes: png(), name: "b.png" },
      { organizationId: org.id }
    );
    // weigher löscht nur die zuletzt hochgeladene – seine eigene
    await expect(
      callerFor(bert).print.deleteFile({
        organizationId: org.id,
        id: annas.id,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await callerFor(bert).print.deleteFile({
      organizationId: org.id,
      id: berts.id,
    });
    expect(await countRows("print_job_files")).toBe(1);
  });

  it("sperrt Hochladen und Ansehen für gesperrte Konten", async () => {
    const jobId = await printFor(anna);
    const view = await uploadView(anna, jobId, { bytes: png(), name: "a.png" });
    await blockUser({ userId: anna.id, reason: "abuse", blockedBy: bert.id });
    anna = (await findUserByUnionId("anna-1"))!;
    expect(
      (await upload(anna, jobId, { bytes: png(), name: "a.png" })).status
    ).toBe(403);
    expect((await get(anna, `/api/files/${view.id}`)).status).toBe(403);
    // Der Export bleibt offen – Betroffenenrecht
    expect((await get(anna, "/api/files/export")).status).toBe(200);
  });
});

describe("Obergrenzen", () => {
  it("hält Anzahl je Druck und Speicher je Bereich", async () => {
    const jobId = await printFor(anna);
    await db()
      .insert(schema.printJobFiles)
      .values(
        Array.from({ length: MAX_FILES_PER_PRINT_JOB }, (_, i) => ({
          printJobId: jobId,
          kind: "image" as const,
          originalName: `f${i}.png`,
          mimeType: "image/png",
          sizeBytes: 10,
          sha256: "0".repeat(64),
          storageKey: `${i}`.padStart(32, "0"),
        }))
      );
    expect(
      (await upload(anna, jobId, { bytes: png(), name: "a.png" })).status
    ).toBe(429);

    const other = await printFor(anna);
    await db()
      .update(schema.printJobFiles)
      .set({ sizeBytes: Math.floor(MAX_STORAGE_BYTES_PER_SCOPE / 20) })
      .where(eq(schema.printJobFiles.printJobId, jobId));
    const full = await upload(anna, other, { bytes: png(), name: "a.png" });
    expect(full.status).toBe(429);
    expect(((await full.clone().json()) as { code: string }).code).toBe(
      "storage_full"
    );
    expect(((await full.json()) as { error: string }).error).toMatch(
      /Speicherplatz/
    );
    // Der Speicher eines anderen Kontos zählt nicht mit
    const bertsJob = await printFor(bert);
    expect(
      (await upload(bert, bertsJob, { bytes: png(), name: "b.png" })).status
    ).toBe(201);
  });
});

describe("Gleichzeitige Uploads", () => {
  it("hält die Grenze je Druck auch bei parallelen Uploads", async () => {
    const jobId = await printFor(anna);
    await db()
      .insert(schema.printJobFiles)
      .values(
        Array.from({ length: MAX_FILES_PER_PRINT_JOB - 1 }, (_, i) => ({
          printJobId: jobId,
          kind: "image" as const,
          originalName: `f${i}.png`,
          mimeType: "image/png",
          sizeBytes: 10,
          sha256: "0".repeat(64),
          storageKey: `${i}`.padStart(32, "0"),
        }))
      );
    const results = await Promise.all([
      upload(anna, jobId, { bytes: png(), name: "a.png" }),
      upload(anna, jobId, { bytes: png(), name: "b.png" }),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([201, 429]);
    expect(await countRows("print_job_files")).toBe(MAX_FILES_PER_PRINT_JOB);
    // Die abgewiesene Datei liegt nicht in der Ablage
    expect(await storedFiles()).toHaveLength(1);
  });
});

describe("Löschen, Kaskaden und Aufräumen", () => {
  it("setzt beim Löschen des Titelbilds das nächste Foto", async () => {
    const jobId = await printFor(anna);
    const first = await uploadView(anna, jobId, {
      bytes: png(),
      name: "1.png",
    });
    const second = await uploadView(
      anna,
      jobId,
      { bytes: png(), name: "2.png" },
      { thumbnail: png(10, 10) }
    );
    await callerFor(anna).print.deleteFile({ ...PERSONAL, id: first.id });
    let detail = await callerFor(anna).print.byId({ ...PERSONAL, id: jobId });
    expect(detail.coverFileId).toBe(second.id);
    expect(await storedFiles()).toHaveLength(2);
    await callerFor(anna).print.setCover({
      ...PERSONAL,
      printJobId: jobId,
      fileId: second.id,
    });
    await callerFor(anna).print.deleteFile({ ...PERSONAL, id: second.id });
    detail = await callerFor(anna).print.byId({ ...PERSONAL, id: jobId });
    expect(detail.coverFileId).toBeNull();
    expect(await storedFiles()).toEqual([]);
  });

  it("nimmt kein Titelbild aus einem anderen Druck", async () => {
    const a = await printFor(anna);
    const b = await printFor(anna);
    const view = await uploadView(anna, a, { bytes: png(), name: "a.png" });
    await expect(
      callerFor(anna).print.setCover({
        ...PERSONAL,
        printJobId: b,
        fileId: view.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("löscht die Dateien mit dem Druck und mit dem Konto", async () => {
    const jobId = await printFor(anna);
    await upload(anna, jobId, { bytes: png(), name: "a.png" });
    await callerFor(anna).print.delete({
      ...PERSONAL,
      id: jobId,
      revertConsumptions: false,
    });
    expect(await countRows("print_job_files")).toBe(0);
    expect(await storedFiles()).toEqual([]);

    const again = await printFor(anna);
    await upload(anna, again, { bytes: model3mf(), name: "a.3mf" });
    await deleteUserAccount(anna.id);
    expect(await countRows("print_job_files")).toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("räumt Dateien ohne Zeile ab, aber erst nach einer Stunde", async () => {
    const jobId = await printFor(anna);
    await upload(anna, jobId, { bytes: png(), name: "a.png" });
    const storage = localFileStorage(dir);
    const orphan = "f".repeat(32);
    await storage.put(orphan, new Uint8Array([1, 2, 3]));
    expect(await sweepOrphanFiles()).toBe(0);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(path.join(dir, "ff", orphan), old, old);
    expect(await sweepOrphanFiles()).toBe(1);
    expect(await storedFiles()).toHaveLength(1);
    expect(await storage.get(orphan)).toBeNull();
  });
});

describe("Export", () => {
  it("liefert die eigenen Dateien als ZIP samt Verzeichnis", async () => {
    const jobId = await printFor(anna);
    await upload(anna, jobId, { bytes: png(), name: "Benchy.png" });
    await upload(anna, jobId, { bytes: model3mf(), name: "Benchy.3mf" });
    const bertsJob = await printFor(bert);
    await upload(bert, bertsJob, { bytes: png(), name: "fremd.png" });

    const response = await get(anna, "/api/files/export");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const names = Object.keys(entries).sort();
    expect(names).toHaveLength(3);
    expect(names).toContain("dateien.json");
    expect(names.some(n => n.endsWith("-Benchy.png"))).toBe(true);
    expect(names.some(n => n.includes("fremd"))).toBe(false);
    const manifest = JSON.parse(
      new TextDecoder().decode(entries["dateien.json"])
    );
    expect(manifest).toHaveLength(2);
    expect(manifest[0].sha256).toMatch(/^[0-9a-f]{64}$/);

    // Fehlt eine Datei in der Ablage, bricht der Export nicht ab und hängt nicht
    const [first] = await db()
      .select()
      .from(schema.printJobFiles)
      .where(eq(schema.printJobFiles.printJobId, jobId))
      .orderBy(schema.printJobFiles.id);
    await localFileStorage(dir).delete(first.storageKey);
    const partial = await get(anna, "/api/files/export");
    const rest = unzipSync(new Uint8Array(await partial.arrayBuffer()));
    expect(Object.keys(rest)).toHaveLength(2);
    const index = JSON.parse(new TextDecoder().decode(rest["dateien.json"]));
    expect(index[0].path).toBeNull();

    // Das JSON nennt die Dateien, ohne Speicherschlüssel
    const json = (await callerFor(anna).account.export()) as {
      printJobFiles: object[];
    };
    expect(json.printJobFiles).toHaveLength(2);
    expect(json.printJobFiles[0]).not.toHaveProperty("storageKey");
  });
});
