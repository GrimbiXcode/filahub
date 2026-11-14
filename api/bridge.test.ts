import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BRIDGE_VERSION,
  Bridge,
  classifyNetworkError,
  FILE_HEAD_MAX_BYTES,
  filamentsFromMeta,
  PrintFileHeadError,
  isPrivateIp,
  metaFromPrintFileHead,
  titleFromFileName,
  type BridgeConfig,
  type ConfigPrinter,
} from "../bridge/filahub-bridge";
import {
  BRIDGE_PROTOCOL_VERSION,
  bridgeReportSchema,
  isPrivateAddress,
  normalizePrinterHost,
} from "@contracts/bridge";
import { printImportInputSchema } from "@contracts/printImports";
import { startFakePrusaLink } from "./test/fakePrusaLink";
import {
  FILE_METADATA,
  buildBgcode,
  buildGcode,
  gcodeBlock,
  iniText,
  printerMetadata,
} from "./test/slicerFixtures";

/**
 * Die Brücke gegen zwei Nachbauten auf localhost: PrusaLink
 * (`api/test/fakePrusaLink.ts`) und filahub (hier). Jede Meldung und jede
 * Einlieferung läuft durch die zod-Schemas des Servers – die Brücke trägt das
 * Protokoll als eigene Typen, und genau hier fiele auf, wenn beide
 * auseinanderliefen.
 */

const TOKEN = `fh_${"a".repeat(43)}`;

type FakeFilahub = {
  url: string;
  config: BridgeConfig;
  reports: unknown[];
  imports: unknown[];
  ingestStatus: number;
  configStatus: number;
  close: () => Promise<void>;
};

async function startFakeFilahub(
  printers: ConfigPrinter[]
): Promise<FakeFilahub> {
  const fake = {
    config: {
      protocol: BRIDGE_PROTOCOL_VERSION,
      configPollSeconds: 15,
      printerPollSeconds: 10,
      printers,
    },
    reports: [] as unknown[],
    imports: [] as unknown[],
    ingestStatus: 201,
    configStatus: 200,
  } as FakeFilahub;
  const server: Server = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "nope" }));
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const reply = (status: number, json: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.url === "/api/bridge/config")
      return reply(fake.configStatus, fake.config);
    if (req.url === "/api/bridge/report") {
      fake.reports.push(JSON.parse(body));
      return reply(200, { ok: true });
    }
    if (req.url === "/api/ingest/print-imports") {
      if (fake.ingestStatus >= 300) return reply(fake.ingestStatus, {});
      fake.imports.push(JSON.parse(body));
      return reply(201, { id: fake.imports.length, duplicate: false });
    }
    reply(404, {});
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () =>
    new Promise<void>(resolve => server.close(() => resolve()));
  return fake;
}

const printer = (patch: Partial<ConfigPrinter>): ConfigPrinter => ({
  id: 1,
  name: "MK4S Werkstatt",
  host: "http://127.0.0.1:1",
  authKind: "api_key",
  username: null,
  secret: "geheim",
  testRequestedAt: null,
  ...patch,
});

const META = {
  "filament used [g]": "12.40, 0.00, 3.60",
  filament_type: "PLA;PLA;PETG",
  extruder_colour: "#1A1A1A;#FFFFFF;#00A700",
  filament_settings_id:
    '"Prusament PLA @MK4S";"Generic PLA";"Prusament PETG @MK4S"',
};

/**
 * bgcode wie vom Core One mit MMU3: Vorschaubild vor den Druck-Metadaten,
 * Farbe und Profile in den Slicer-Metadaten, danach ein großer G-Code-Block.
 */
function coreOneBgcode(gcodeBytes = 4 * 1024 * 1024) {
  return buildBgcode([
    { type: 0, data: FILE_METADATA },
    {
      type: 3,
      compression: 1,
      data: printerMetadata({ "filament used [g]": "12.40, 0.00, 3.60" }),
    },
    { type: 5, data: new Uint8Array(200_000).fill(7) },
    {
      type: 4,
      compression: 1,
      data: iniText({ "filament used [g]": "12.40, 0.00, 3.60" }),
    },
    {
      type: 2,
      compression: 1,
      data: iniText({
        filament_type: "PLA;PLA;PETG",
        extruder_colour: "#1A1A1A;#FFFFFF;#00A700",
        filament_settings_id: META.filament_settings_id,
      }),
    },
    gcodeBlock(gcodeBytes),
  ]);
}

let clock = Date.parse("2026-11-09T12:00:00Z");
const now = () => clock;

function lastReport(fake: FakeFilahub) {
  const report = fake.reports.at(-1);
  const parsed = bridgeReportSchema.safeParse(report);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.data;
}

let cleanup: (() => Promise<void>)[] = [];
beforeEach(() => {
  clock = Date.parse("2026-11-09T12:00:00Z");
  cleanup = [];
});
afterEach(async () => {
  for (const close of cleanup) await close();
});

async function setup(
  printers: ConfigPrinter[],
  options: { resolve?: (host: string) => Promise<string[]> } = {}
) {
  const filahub = await startFakeFilahub(printers);
  cleanup.push(filahub.close);
  const bridge = new Bridge({
    filahubUrl: filahub.url,
    token: TOKEN,
    dataDir: null,
    allowPublic: false,
    now,
    resolve: options.resolve,
  });
  bridge.write = () => undefined; // die Konsole der Tests bleibt still
  return { filahub, bridge };
}

describe("Brücke gegen PrusaLink", () => {
  it("meldet einen erreichbaren Drucker samt Angaben", async () => {
    const link = await startFakePrusaLink({
      auth: { kind: "api_key", key: "geheim" },
      printerState: "IDLE",
      job: null,
      mode: "prusalink",
    });
    cleanup.push(link.close);
    const { filahub, bridge } = await setup([printer({ host: link.host })]);
    await bridge.tick();
    const [report] = lastReport(filahub).printers;
    expect(report).toMatchObject({
      id: 1,
      state: "ok",
      printerState: "IDLE",
      info: { serial: "SN-4711", firmware: "6.2.0", nozzleDiameter: 0.4 },
      job: null,
    });
  });

  it("meldet einen falschen API-Schlüssel als „unauthorized“", async () => {
    const link = await startFakePrusaLink({
      auth: { kind: "api_key", key: "richtig" },
      printerState: "IDLE",
      job: null,
      mode: "prusalink",
    });
    cleanup.push(link.close);
    const { filahub, bridge } = await setup([
      printer({ host: link.host, secret: "falsch" }),
    ]);
    await bridge.tick();
    expect(lastReport(filahub).printers[0]).toMatchObject({
      state: "unauthorized",
      httpStatus: 401,
    });
  });

  it("meldet sich per Digest an", async () => {
    const link = await startFakePrusaLink({
      auth: { kind: "digest", password: "pw" },
      printerState: "IDLE",
      job: null,
      mode: "prusalink",
    });
    cleanup.push(link.close);
    const { filahub, bridge } = await setup([
      printer({
        host: link.host,
        authKind: "digest",
        username: "maker",
        secret: "pw",
      }),
    ]);
    await bridge.tick();
    expect(lastReport(filahub).printers[0].state).toBe("ok");

    const wrong = await setup([
      printer({
        host: link.host,
        authKind: "digest",
        username: "maker",
        secret: "nein",
      }),
    ]);
    await wrong.bridge.tick();
    expect(lastReport(wrong.filahub).printers[0].state).toBe("unauthorized");
  });

  it.each([
    ["not_found", "not_prusalink"],
    ["html", "not_prusalink"],
  ] as const)(
    "erkennt einen Dienst, der kein PrusaLink ist (%s)",
    async (mode, state) => {
      const link = await startFakePrusaLink({
        auth: { kind: "api_key", key: "geheim" },
        printerState: "IDLE",
        job: null,
        mode,
      });
      cleanup.push(link.close);
      const { filahub, bridge } = await setup([printer({ host: link.host })]);
      await bridge.tick();
      expect(lastReport(filahub).printers[0].state).toBe(state);
    }
  );

  it("meldet einen geschlossenen Port als „refused“", async () => {
    const link = await startFakePrusaLink({
      auth: { kind: "api_key", key: "geheim" },
      printerState: "IDLE",
      job: null,
      mode: "prusalink",
    });
    await link.close();
    const { filahub, bridge } = await setup([printer({ host: link.host })]);
    await bridge.tick();
    expect(lastReport(filahub).printers[0].state).toBe("refused");
  });

  it("verweigert Ziele außerhalb des lokalen Netzes, ohne sie anzufragen", async () => {
    const { filahub, bridge } = await setup(
      [printer({ host: "http://drucker.example.com" })],
      { resolve: async () => ["93.184.216.34"] }
    );
    await bridge.tick();
    expect(lastReport(filahub).printers[0]).toMatchObject({
      state: "blocked_public",
    });
  });

  it("meldet einen nicht auflösbaren Namen als „dns_failed“", async () => {
    const { filahub, bridge } = await setup(
      [printer({ host: "http://mk4.local" })],
      {
        resolve: async () => {
          throw Object.assign(new Error("getaddrinfo ENOTFOUND"), {
            code: "ENOTFOUND",
          });
        },
      }
    );
    await bridge.tick();
    expect(lastReport(filahub).printers[0].state).toBe("dns_failed");
  });

  it("beantwortet eine Testanfrage aus der App", async () => {
    const link = await startFakePrusaLink({
      auth: { kind: "api_key", key: "geheim" },
      printerState: "IDLE",
      job: null,
      mode: "prusalink",
    });
    cleanup.push(link.close);
    const testAt = "2026-11-09T11:59:00.000Z";
    const { filahub, bridge } = await setup([
      printer({ host: link.host, testRequestedAt: testAt }),
    ]);
    await bridge.quickCheck();
    expect(lastReport(filahub).printers[0].testAnsweredFor).toBe(testAt);
  });
});

describe("Drucke ins Eingangsfach", () => {
  async function printing(meta: Record<string, unknown> | null, extra = {}) {
    const link = await startFakePrusaLink({
      auth: { kind: "api_key", key: "geheim" },
      printerState: "PRINTING",
      job: {
        id: 42,
        progress: 10,
        timePrinting: 600,
        fileName: "Benchy_0.4n_0.2mm_PLA_MK4S_1h3m.bgcode",
        meta,
        ...extra,
      },
      mode: "prusalink",
    });
    cleanup.push(link.close);
    const env = await setup([printer({ host: link.host })]);
    await env.bridge.tick();
    return { link, ...env };
  }

  it("liefert einen fertigen Druck mit Gramm je Filament ein", async () => {
    const { link, filahub, bridge } = await printing(META);
    expect(lastReport(filahub).printers[0].job).toMatchObject({
      id: 42,
      progressPercent: 10,
    });
    link.state.printerState = "FINISHED";
    link.state.job = { ...link.state.job!, progress: 100, timePrinting: 3780 };
    clock += 60_000;
    await bridge.tick();
    // Noch einmal FINISHED: derselbe Druck wird nicht zweimal gemeldet
    clock += 10_000;
    await bridge.tick();

    expect(filahub.imports).toHaveLength(1);
    const item = printImportInputSchema.parse(filahub.imports[0]);
    expect(item).toMatchObject({
      source: "printer",
      title: "Benchy",
      status: "success",
      durationMinutes: 63,
      printer: "MK4S Werkstatt",
      gramsEstimated: false,
    });
    expect(item.filaments.map(f => [f.slot, f.grams, f.colorHex])).toEqual([
      [0, 12, "#1a1a1a"],
      [2, 4, "#00a700"],
    ]);
    expect(item.externalKey).toMatch(/^prusalink:SN-4711:42:/);
  });

  it("schätzt die Gramm eines abgebrochenen Drucks aus dem Fortschritt", async () => {
    const { link, filahub, bridge } = await printing(META);
    link.state.printerState = "STOPPED";
    link.state.job = { ...link.state.job!, progress: 50 };
    await bridge.tick();
    const item = printImportInputSchema.parse(filahub.imports[0]);
    expect(item.status).toBe("cancelled");
    expect(item.gramsEstimated).toBe(true);
    expect(item.filaments.map(f => f.grams)).toEqual([6, 2]);
  });

  it("liest die Metadaten auch über die Dateiliste", async () => {
    const { link, filahub, bridge } = await printing(META, {
      metaOnlyInFiles: true,
    });
    link.state.printerState = "FINISHED";
    await bridge.tick();
    expect(link.requests).toContain(
      "/api/v1/files/usb/Benchy_0.4n_0.2mm_PLA_MK4S_1h3m.bgcode"
    );
    expect(
      printImportInputSchema.parse(filahub.imports[0]).filaments
    ).toHaveLength(2);
  });

  it("liest die Gramm aus der Datei, wenn PrusaLink keine Metadaten nennt (Buddy-Firmware)", async () => {
    const { link, filahub, bridge } = await printing(null, {
      fileBytes: coreOneBgcode(),
    });
    link.state.printerState = "FINISHED";
    link.state.job = { ...link.state.job!, progress: 100 };
    await bridge.tick();
    expect(link.requests).toContain(
      "/usb/Benchy_0.4n_0.2mm_PLA_MK4S_1h3m.bgcode"
    );
    const item = printImportInputSchema.parse(filahub.imports[0]);
    expect(item.filaments.map(f => [f.slot, f.grams, f.colorHex])).toEqual([
      [0, 12, "#1a1a1a"],
      [2, 4, "#00a700"],
    ]);
    expect(lastReport(filahub).printers[0].metaWarning).toBeNull();
  });

  it("versucht es wieder, wenn der Drucker den Download beim Start verweigert", async () => {
    const { link, filahub, bridge } = await printing(null, {
      fileBytes: coreOneBgcode(),
      fileBusy: 2,
    });
    const downloads = () =>
      link.requests.filter(path => path.startsWith("/usb/")).length;
    expect(downloads()).toBe(1);
    // Vor Ablauf des Abstands kein neuer Versuch
    clock += 10_000;
    await bridge.tick();
    expect(downloads()).toBe(1);
    clock += 30_000;
    await bridge.tick();
    expect(downloads()).toBe(2);
    clock += 60_000;
    await bridge.tick();
    expect(downloads()).toBe(3);
    link.state.printerState = "FINISHED";
    link.state.job = { ...link.state.job!, progress: 100 };
    await bridge.tick();
    expect(downloads()).toBe(3);
    const item = printImportInputSchema.parse(filahub.imports[0]);
    expect(item.filaments.map(f => [f.slot, f.grams])).toEqual([
      [0, 12],
      [2, 4],
    ]);
    expect(lastReport(filahub).printers[0].metaWarning).toBeNull();
  });

  it("versucht es beim Ende ein letztes Mal", async () => {
    const { link, filahub, bridge } = await printing(null, {
      fileBytes: coreOneBgcode(),
      fileBusy: 1,
    });
    link.state.printerState = "FINISHED";
    await bridge.tick();
    expect(
      printImportInputSchema.parse(filahub.imports[0]).filaments
    ).toHaveLength(2);
  });

  it("liest bei ASCII-G-Code nach dem Druck das Ende der Datei", async () => {
    const file = buildGcode({
      foot: { "filament used [g]": "0.00, 0.00, 18.72" },
      config: {
        filament_type: "PLA;PLA;PETG",
        extruder_colour: "#1A1A1A;#FFFFFF;#00A700",
      },
      bodyBytes: 3 * 1024 * 1024,
    });
    const { link, filahub, bridge } = await printing(null, {
      fileBytes: file,
    });
    const downloads = () =>
      link.requests.filter(path => path.startsWith("/usb/")).length;
    expect(downloads()).toBe(1);
    // Der Kopf hilft nicht – kein erneuter Versuch während des Drucks
    clock += 10 * 60_000;
    await bridge.tick();
    expect(downloads()).toBe(1);
    link.state.printerState = "FINISHED";
    link.state.job = { ...link.state.job!, progress: 100 };
    await bridge.tick();
    await bridge.settle();
    expect(downloads()).toBe(2);
    await bridge.tick();
    const item = printImportInputSchema.parse(filahub.imports[0]);
    expect(item.filaments.map(f => [f.slot, f.grams, f.colorHex])).toEqual([
      [2, 19, "#00a700"],
    ]);
    expect(lastReport(filahub).printers[0].metaWarning).toBeNull();
  });

  it("nimmt den langen Dateinamen, wenn die Kurzform nicht gefunden wird", async () => {
    const { link, filahub, bridge } = await printing(null, {
      fileBytes: coreOneBgcode(),
      shortName: "BENCHY~1.BGC",
    });
    link.state.printerState = "FINISHED";
    await bridge.tick();
    expect(link.requests).toContain("/usb/BENCHY~1.BGC");
    expect(link.requests).toContain(
      "/usb/Benchy_0.4n_0.2mm_PLA_MK4S_1h3m.bgcode"
    );
    expect(
      printImportInputSchema.parse(filahub.imports[0]).filaments
    ).toHaveLength(2);
  });

  it("liefert ohne Metadaten trotzdem ein und sagt es", async () => {
    const { link, filahub, bridge } = await printing(null);
    link.state.printerState = "FINISHED";
    await bridge.tick();
    expect(printImportInputSchema.parse(filahub.imports[0]).filaments).toEqual(
      []
    );
    expect(lastReport(filahub).printers[0].metaWarning).toMatch(/Gramm/);
  });

  it("meldet einen verschwundenen Job nach dem letzten Fortschritt", async () => {
    const { link, filahub, bridge } = await printing(META);
    link.state.printerState = "IDLE";
    link.state.job = null;
    await bridge.tick();
    expect(printImportInputSchema.parse(filahub.imports[0]).status).toBe(
      "cancelled"
    );
  });

  it("hält Drucke zurück, solange filahub nicht annimmt", async () => {
    const { link, filahub, bridge } = await printing(META);
    filahub.ingestStatus = 503;
    link.state.printerState = "FINISHED";
    await bridge.tick();
    expect(filahub.imports).toHaveLength(0);
    expect(lastReport(filahub).queued).toBe(1);
    filahub.ingestStatus = 201;
    await bridge.tick();
    expect(filahub.imports).toHaveLength(1);
    expect(lastReport(filahub).queued).toBe(0);
  });

  it("pausiert, wenn filahub den Schlüssel ablehnt", async () => {
    const { filahub, bridge } = await setup([]);
    filahub.configStatus = 200;
    bridge.options.token = `fh_${"b".repeat(43)}`;
    await bridge.tick();
    expect(bridge.pausedUntil).toBeGreaterThan(clock);
    expect(filahub.reports).toHaveLength(0);
  });
});

describe("Hilfen der Brücke", () => {
  it("erkennt lokale Adressen wie der Server", () => {
    for (const ip of [
      "10.0.0.5",
      "192.168.178.20",
      "172.20.1.1",
      "127.0.0.1",
      "169.254.1.1",
      "fd00::1",
      "::1",
      "::ffff:192.168.1.2",
    ])
      expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "2001:db8::1", "93.184.216.34"])
      expect(isPrivateIp(ip)).toBe(false);
    // Dieselben Antworten wie `isPrivateAddress` für IPs
    for (const ip of ["10.0.0.5", "8.8.8.8", "fd00::1", "2001:db8::1"])
      expect(isPrivateIp(ip)).toBe(isPrivateAddress(ip));
  });

  it("normalisiert Druckeradressen", () => {
    expect(normalizePrinterHost("192.168.1.50")).toBe("http://192.168.1.50");
    expect(normalizePrinterHost(" http://mk4.local:8080/ ")).toBe(
      "http://mk4.local:8080"
    );
    expect(normalizePrinterHost("https://drucker")).toBe("https://drucker");
    expect(normalizePrinterHost("ftp://x")).toBeNull();
    expect(normalizePrinterHost("http://a:b@x")).toBeNull();
    expect(normalizePrinterHost("http://x/api")).toBeNull();
    expect(normalizePrinterHost("")).toBeNull();
    expect(isPrivateAddress("mk4.local")).toBe(true);
    expect(isPrivateAddress("drucker")).toBe(true);
    expect(isPrivateAddress("mk4.fritz.box")).toBe(true);
    expect(isPrivateAddress("printer.example.com")).toBe(false);
  });

  it("ordnet Netzfehler zu", () => {
    const err = (code: string) => ({ cause: { code } });
    expect(classifyNetworkError(err("ECONNREFUSED")).state).toBe("refused");
    expect(classifyNetworkError(err("ENOTFOUND")).state).toBe("dns_failed");
    expect(classifyNetworkError(err("EHOSTUNREACH")).state).toBe("unreachable");
    expect(classifyNetworkError({ name: "TimeoutError" }).state).toBe(
      "timeout"
    );
    expect(
      classifyNetworkError(err("ERR_TLS_CERT_ALTNAME_INVALID")).state
    ).toBe("tls");
  });

  it("liest Filamente aus Metadaten in Text- und Zahlenform", () => {
    expect(filamentsFromMeta(null)).toBeNull();
    expect(filamentsFromMeta({ foo: 1 })).toBeNull();
    expect(
      filamentsFromMeta({ "filament used [g]": 7.5, filament_type: "PETG" })
    ).toEqual([
      {
        slot: 0,
        grams: 7.5,
        filamentType: "PETG",
        colorHex: null,
        profileName: null,
        vendor: null,
      },
    ]);
    // MMU, nur Platz 3 benutzt
    expect(
      filamentsFromMeta({
        "filament used [g]": "0.00, 0.00, 18.72, 0.00, 0.00",
        filament_type: "PLA;PLA;PETG;PLA;PLA",
      })
    ).toMatchObject([{ slot: 2, grams: 18.72, filamentType: "PETG" }]);
    expect(titleFromFileName("/usb/BENCHY~1.BGC")).toBe("BENCHY~1");
  });
});

describe("Metadaten aus dem Kopf einer Druckdatei", () => {
  it("liest bgcode bis zum ersten G-Code-Block und braucht den Rest nicht", () => {
    const file = coreOneBgcode();
    const gcodeStart = file.length - 4 * 1024 * 1024 - 2 - 8 - 4;
    // Zu kurz: es fehlen Bytes
    expect(metaFromPrintFileHead(file.subarray(0, 5000), false)).toBe("more");
    // Bis kurz hinter den Kopf des G-Code-Blocks genügt
    const meta = metaFromPrintFileHead(
      file.subarray(0, gcodeStart + 12),
      false
    );
    expect(meta).toMatchObject({
      "filament used [g]": "12.40, 0.00, 3.60",
      extruder_colour: "#1A1A1A;#FFFFFF;#00A700",
    });
    expect(filamentsFromMeta(meta as Record<string, string>)).toHaveLength(2);
    expect(gcodeStart + 12).toBeLessThan(FILE_HEAD_MAX_BYTES);
  });

  it("lehnt eine kaputte Prüfsumme ab", () => {
    const file = buildBgcode([
      {
        type: 4,
        data: iniText({ "filament used [g]": "5" }),
        badChecksum: true,
      },
      gcodeBlock(10),
    ]);
    expect(() => metaFromPrintFileHead(file, true)).toThrow(PrintFileHeadError);
  });

  it("liest ASCII-G-Code aus den Kommentaren des Kopfes", () => {
    const file = buildGcode({
      head: { "filament used [g]": "8.21", filament_type: "PETG" },
      bodyBytes: 3 * 1024 * 1024,
    });
    const meta = metaFromPrintFileHead(file.subarray(0, 64 * 1024), false);
    expect(filamentsFromMeta(meta as Record<string, string>)).toMatchObject([
      { slot: 0, grams: 8.21, filamentType: "PETG" },
    ]);
    // Ohne Verbrauch im Kopf: weiterlesen bis zum ersten Befehl, dann aufhören
    const bare = buildGcode({ bodyBytes: 3 * 1024 * 1024 });
    expect(metaFromPrintFileHead(bare.subarray(0, 60), false)).toBe("more");
    expect(metaFromPrintFileHead(bare.subarray(0, 4096), false)).toBeNull();
    expect(() =>
      metaFromPrintFileHead(new Uint8Array([1, 0, 2]), true)
    ).toThrow(PrintFileHeadError);
  });
});

describe("Versionen", () => {
  it("Brücke und PrusaSlicer-Skript tragen die Version der App", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      version: string;
    };
    expect(BRIDGE_VERSION).toBe(pkg.version);
    const script = readFileSync("public/tools/filahub-import.py", "utf8");
    expect(script).toContain(`VERSION = "${pkg.version}"`);
  });
});
