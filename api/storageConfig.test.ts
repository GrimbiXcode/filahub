import { describe, expect, it } from "vitest";
import { describeStorage, parseStorageConfig } from "./lib/storageConfig";
import { s3Url } from "./lib/s3Storage";

/** Welche Ablage die Umgebung wählt (seit 4.4.0) – ohne Prozess, ohne Netz. */

const s3 = {
  STORAGE_DRIVER: "s3",
  S3_BUCKET: "filahub-dateien",
  S3_ACCESS_KEY_ID: "AKIA",
  S3_SECRET_ACCESS_KEY: "geheim",
};

describe("parseStorageConfig", () => {
  it("bleibt ohne Angabe beim Verzeichnis", () => {
    expect(parseStorageConfig({})).toEqual({
      driver: "local",
      directory: "data/uploads",
    });
    expect(parseStorageConfig({ NODE_ENV: "production" })).toEqual({
      driver: "local",
      directory: "/data/uploads",
    });
    expect(parseStorageConfig({ UPLOAD_DIR: " /srv/dateien " })).toMatchObject({
      directory: "/srv/dateien",
    });
  });

  it("liest AWS mit Region und ohne Endpunkt", () => {
    expect(parseStorageConfig({ ...s3, S3_REGION: "eu-central-1" })).toEqual({
      driver: "s3",
      bucket: "filahub-dateien",
      region: "eu-central-1",
      endpoint: null,
      forcePathStyle: false,
      prefix: "",
      accessKeyId: "AKIA",
      secretAccessKey: "geheim",
      sessionToken: null,
    });
  });

  it("nimmt bei eigenem Endpunkt den Pfad-Stil, außer er ist abgewählt", () => {
    const minio = parseStorageConfig({
      ...s3,
      S3_ENDPOINT: "https://s3.example.org/",
      S3_PREFIX: "/instanz-a",
    });
    expect(minio).toMatchObject({
      endpoint: "https://s3.example.org",
      forcePathStyle: true,
      region: "us-east-1",
      prefix: "instanz-a/",
    });
    expect(
      parseStorageConfig({
        ...s3,
        S3_ENDPOINT: "https://r2.example.org",
        S3_FORCE_PATH_STYLE: "false",
        S3_REGION: "auto",
      })
    ).toMatchObject({ forcePathStyle: false, region: "auto" });
  });

  it("nimmt bei einem Bucket mit Punkt den Pfad-Stil", () => {
    expect(
      parseStorageConfig({
        ...s3,
        S3_BUCKET: "dateien.example.org",
        S3_REGION: "eu-central-1",
      })
    ).toMatchObject({ forcePathStyle: true });
  });

  it("nennt fehlende Angaben – ohne Werte preiszugeben", () => {
    expect(() => parseStorageConfig({ STORAGE_DRIVER: "s3" })).toThrow(
      "S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION"
    );
    expect(() =>
      parseStorageConfig({ ...s3, S3_SECRET_ACCESS_KEY: "" })
    ).toThrow(/S3_SECRET_ACCESS_KEY/);
    expect(() => parseStorageConfig({ STORAGE_DRIVER: "ftp" })).toThrow(
      /local.*s3/
    );
  });

  it("lehnt ungültige Buckets, Endpunkte und Präfixe ab", () => {
    const withRegion = { ...s3, S3_REGION: "eu-central-1" };
    for (const bucket of ["A", "ab", "Filahub", "a/b", "evil.com/x"])
      expect(() =>
        parseStorageConfig({ ...withRegion, S3_BUCKET: bucket })
      ).toThrow(/Bucket/);
    for (const endpoint of [
      "kein url",
      "ftp://x.org",
      "https://x.org/?a=1",
      "https://user:pw@x.org",
    ])
      expect(() =>
        parseStorageConfig({ ...withRegion, S3_ENDPOINT: endpoint })
      ).toThrow(/S3_ENDPOINT/);
    for (const prefix of ["a b", "a//b", "../x?y", "../", "x/./", "a/../b"])
      expect(() =>
        parseStorageConfig({ ...withRegion, S3_PREFIX: prefix })
      ).toThrow(/S3_PREFIX/);
  });

  it("beschreibt den Ort ohne Zugangsdaten", () => {
    const config = parseStorageConfig({
      ...s3,
      S3_ENDPOINT: "https://s3.example.org",
      S3_PREFIX: "a",
    });
    const text = describeStorage(config);
    expect(text).toBe("s3://filahub-dateien/a/ (s3.example.org)");
    expect(text).not.toMatch(/geheim|AKIA/);
  });
});

describe("s3Url", () => {
  const base = parseStorageConfig({ ...s3, S3_REGION: "eu-central-1" });
  if (base.driver !== "s3") throw new Error("s3 erwartet");

  it("baut AWS-Adressen im Host- und im Pfad-Stil", () => {
    expect(s3Url(base, "a/b").toString()).toBe(
      "https://filahub-dateien.s3.eu-central-1.amazonaws.com/a/b"
    );
    expect(s3Url({ ...base, forcePathStyle: true }, "a/b").toString()).toBe(
      "https://s3.eu-central-1.amazonaws.com/filahub-dateien/a/b"
    );
  });

  it("setzt den Bucket bei eigenem Endpunkt in Pfad oder Host", () => {
    const custom = { ...base, endpoint: "https://s3.example.org/basis" };
    expect(s3Url({ ...custom, forcePathStyle: true }, "x/y").toString()).toBe(
      "https://s3.example.org/basis/filahub-dateien/x/y"
    );
    expect(s3Url({ ...custom, forcePathStyle: false }, "x/y").toString()).toBe(
      "https://filahub-dateien.s3.example.org/basis/x/y"
    );
    // Die Bucket-Adresse fürs Auflisten
    expect(s3Url({ ...custom, forcePathStyle: true }, "").pathname).toBe(
      "/basis/filahub-dateien/"
    );
  });
});
