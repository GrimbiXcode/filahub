/**
 * Welche Dateiablage die Instanz benutzt (seit 4.4.0) – ein Verzeichnis auf
 * einem Volume oder ein S3-kompatibler Objektspeicher (AWS S3, Cloudflare R2,
 * Hetzner, MinIO …).
 *
 * Eine reine Funktion über den Umgebungsvariablen, damit sie ohne Prozess und
 * ohne Netz testbar ist (`api/storageConfig.test.ts`). `api/lib/env.ts` ruft
 * sie beim Start auf: Eine unvollständige S3-Angabe soll den Start scheitern
 * lassen und nicht erst den ersten Upload.
 */

export type LocalStorageConfig = { driver: "local"; directory: string };

export type S3StorageConfig = {
  driver: "s3";
  bucket: string;
  /** Region für die Signatur; bei R2 `auto`, bei MinIO meist `us-east-1` */
  region: string;
  /**
   * Eigener Endpunkt (R2, Hetzner, MinIO …) ohne Bucket. Fehlt er, gilt AWS:
   * `https://<bucket>.s3.<region>.amazonaws.com`.
   */
  endpoint: string | null;
  /**
   * Bucket im Pfad (`endpoint/bucket/schlüssel`) statt im Hostnamen. Vorgabe:
   * an, sobald ein eigener Endpunkt gesetzt ist – MinIO und viele
   * Selbstbetriebene können nur das – oder der Bucket einen Punkt trägt; bei
   * AWS sonst aus.
   */
  forcePathStyle: boolean;
  /** Präfix vor jedem Schlüssel, z. B. `filahub/`; leer oder mit `/` am Ende */
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Nur für kurzlebige Zugangsdaten (STS) */
  sessionToken: string | null;
};

export type StorageConfig = LocalStorageConfig | S3StorageConfig;

type Env = Record<string, string | undefined>;

const truthy = (value: string | undefined) =>
  ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
const falsy = (value: string | undefined) =>
  ["0", "false", "no"].includes((value ?? "").trim().toLowerCase());

/**
 * Liest die Ablage aus den Umgebungsvariablen. Wirft mit einer Meldung, die
 * die fehlende Variable nennt – **nie** ihren Wert.
 */
export function parseStorageConfig(source: Env): StorageConfig {
  const read = (name: string) => source[name]?.trim() || "";
  const driver = (read("STORAGE_DRIVER") || "local").toLowerCase();

  if (driver === "local") {
    return {
      driver: "local",
      directory:
        read("UPLOAD_DIR") ||
        (source.NODE_ENV === "production" ? "/data/uploads" : "data/uploads"),
    };
  }
  if (driver !== "s3") {
    throw new Error(
      `STORAGE_DRIVER muss "local" oder "s3" sein, nicht "${driver}".`
    );
  }

  const missing = [
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ].filter(name => !read(name));
  const endpointRaw = read("S3_ENDPOINT");
  // Ohne eigenen Endpunkt ist es AWS, und dort gehört die Region zur Adresse
  if (!endpointRaw && !read("S3_REGION")) missing.push("S3_REGION");
  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER=s3 braucht außerdem: ${missing.join(", ")}.`
    );
  }

  let endpoint: string | null = null;
  if (endpointRaw) {
    let url: URL;
    try {
      url = new URL(endpointRaw);
    } catch {
      throw new Error("S3_ENDPOINT ist keine gültige Adresse.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error("S3_ENDPOINT muss mit https:// beginnen.");
    if (url.search || url.hash)
      throw new Error("S3_ENDPOINT darf keine Abfrage enthalten.");
    // Zugangsdaten gehören in S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY – in der
    // Adresse landeten sie in jedem Log, das die Adresse nennt
    if (url.username || url.password)
      throw new Error("S3_ENDPOINT darf keine Zugangsdaten enthalten.");
    endpoint = url.toString().replace(/\/+$/, "");
  }

  const bucket = read("S3_BUCKET");
  // Bucket-Namen nach den S3-Regeln – sonst landete er ungeprüft in der Adresse
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
    throw new Error("S3_BUCKET ist kein gültiger Bucket-Name.");

  let prefix = read("S3_PREFIX").replace(/^\/+/, "");
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  if (
    !/^[A-Za-z0-9._\-/]*$/.test(prefix) ||
    prefix.includes("//") ||
    // `.` und `..` löst die Adresse auf – `../` verließe den Bucket, und die
    // Liste suchte an einer anderen Stelle, als geschrieben wurde
    prefix.split("/").some(part => part === "." || part === "..")
  )
    throw new Error(
      "S3_PREFIX darf nur Buchstaben, Ziffern, Punkt, Binde- und Unterstrich sowie / enthalten."
    );

  const pathStyle = read("S3_FORCE_PATH_STYLE");
  return {
    driver: "s3",
    bucket,
    region: read("S3_REGION") || "us-east-1",
    endpoint,
    /*
      Vorgabe: Pfad-Stil bei eigenem Endpunkt, und bei einem Bucket mit Punkt
      im Namen – im Hostnamen deckte das Wildcard-Zertifikat
      (`*.s3.<region>.amazonaws.com`) die zusätzliche Ebene nicht, TLS
      scheiterte.
    */
    forcePathStyle: truthy(pathStyle)
      ? true
      : falsy(pathStyle)
        ? false
        : endpoint != null || bucket.includes("."),
    prefix,
    accessKeyId: read("S3_ACCESS_KEY_ID"),
    secretAccessKey: read("S3_SECRET_ACCESS_KEY"),
    sessionToken: read("S3_SESSION_TOKEN") || null,
  };
}

/**
 * Wo die Dateien liegen, für Menschen – `/verwaltung/system` und das Log.
 * Ohne Zugangsdaten, und vom Endpunkt nur der Host.
 */
export function describeStorage(config: StorageConfig): string {
  if (config.driver === "local") return config.directory;
  const where = `s3://${config.bucket}/${config.prefix}`;
  return config.endpoint
    ? `${where} (${new URL(config.endpoint).host})`
    : `${where} (AWS ${config.region})`;
}
