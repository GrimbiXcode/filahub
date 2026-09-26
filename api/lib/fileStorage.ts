import { randomBytes } from "node:crypto";
import {
  access,
  mkdir,
  open as fsOpen,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "./env";

/**
 * Ablage der hochgeladenen Dateien (seit 4.3.0).
 *
 * Eine kleine Schnittstelle statt `fs` an jeder Stelle: Heute liegt alles in
 * einem Verzeichnis auf einem Volume (`UPLOAD_DIR`), die Metadaten stehen in
 * der Datenbank (`print_job_files`). Soll es später ein Objektspeicher sein,
 * kommt ein zweiter Treiber mit denselben vier Methoden dazu.
 *
 * **Der Name auf der Platte ist ein zufälliger Schlüssel**, nie der
 * hochgeladene Name: kein Pfad-Traversal, keine Kollisionen, und der Name
 * verrät nichts. Jeder Schlüssel wird vor dem Zugriff gegen `KEY_PATTERN`
 * geprüft – auch einer aus der eigenen Datenbank.
 */
export type FileStorage = {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /**
   * Die Datei als Strom samt Größe – zum Ausliefern. Eine 3MF mit 45 MB
   * ganz in den Speicher zu lesen, hieße: hundert gleichzeitige Abrufe, und
   * der Prozess läuft voll.
   */
  open(
    key: string
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null>;
  delete(key: string): Promise<void>;
  /** Alle Schlüssel samt Änderungszeit – für den Aufräumlauf */
  list(): Promise<{ key: string; modifiedAt: Date }[]>;
  /** Halb geschriebene Dateien älter als `before` entfernen; liefert die Anzahl */
  removeStaleTemp(before: Date): Promise<number>;
  /** Ob sich schreiben lässt – für `/verwaltung/system` und den Start */
  isWritable(): Promise<boolean>;
};

const KEY_PATTERN = /^[0-9a-f]{32}$/;
/** Temporäre Dateien heißen `<schlüssel>.<zufall>.tmp` – siehe `put` */
const TEMP_PATTERN = /^[0-9a-f]{32}\.[0-9a-f]{8}\.tmp$/;

/** Alle Dateien in den Unterordnern `<ab>/` der Ablage */
async function entries(root: string) {
  let shards: string[];
  try {
    shards = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const result: { name: string; full: string }[] = [];
  for (const shard of shards) {
    if (!/^[0-9a-f]{2}$/.test(shard)) continue;
    for (const name of await readdir(path.join(root, shard))) {
      if (name.startsWith(shard))
        result.push({ name, full: path.join(root, shard, name) });
    }
  }
  return result;
}

/** Ein neuer, zufälliger Schlüssel (128 Bit) */
export function newStorageKey(): string {
  return randomBytes(16).toString("hex");
}

export function isStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

function assertKey(key: string) {
  if (!isStorageKey(key)) throw new Error(`Ungültiger Speicherschlüssel`);
}

/**
 * Ablage im Dateisystem: `<dir>/<ab>/<schlüssel>`. Die zwei Zeichen davor
 * verteilen die Dateien auf 256 Unterordner – ein einzelnes Verzeichnis mit
 * Zehntausenden Einträgen wird auf manchen Dateisystemen zäh.
 */
export function localFileStorage(dir: string): FileStorage {
  const root = path.resolve(dir);
  const pathFor = (key: string) => path.join(root, key.slice(0, 2), key);

  return {
    async put(key, data) {
      assertKey(key);
      const target = pathFor(key);
      await mkdir(path.dirname(target), { recursive: true });
      // Erst vollständig schreiben, dann umbenennen: Ein Abbruch mitten im
      // Schreiben hinterlässt sonst eine halbe Datei unter dem echten Namen.
      const temp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(temp, data, { flag: "wx" });
      await rename(temp, target);
    },
    async get(key) {
      assertKey(key);
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async open(key) {
      assertKey(key);
      try {
        const handle = await fsOpen(pathFor(key), "r");
        const { size } = await handle.stat();
        const stream = Readable.toWeb(
          handle.createReadStream()
        ) as ReadableStream<Uint8Array>;
        return { stream, size };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      assertKey(key);
      await rm(pathFor(key), { force: true });
    },
    async list() {
      const result: { key: string; modifiedAt: Date }[] = [];
      for (const { name, full } of await entries(root)) {
        if (!isStorageKey(name)) continue;
        result.push({ key: name, modifiedAt: (await stat(full)).mtime });
      }
      return result;
    },
    async removeStaleTemp(before) {
      let removed = 0;
      for (const { name, full } of await entries(root)) {
        if (!TEMP_PATTERN.test(name)) continue;
        if ((await stat(full)).mtime < before) {
          await rm(full, { force: true });
          removed++;
        }
      }
      return removed;
    },
    async isWritable() {
      try {
        await mkdir(root, { recursive: true });
        await access(root, constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}

let storage: FileStorage | null = null;

/** Die Ablage der Instanz; Tests setzen eine eigene über `setFileStorage`. */
export function getFileStorage(): FileStorage {
  storage ??= localFileStorage(env.uploadDir);
  return storage;
}

export function setFileStorage(next: FileStorage | null) {
  storage = next;
}
