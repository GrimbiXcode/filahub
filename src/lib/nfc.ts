import {
  OPENPRINTTAG_MIME,
  OpenPrintTagError,
  readOpenPrintTag,
  type OpenPrintTagMaterial,
} from "@contracts/openPrintTag";

/**
 * OpenPrintTag über Web NFC lesen (seit 4.7.0).
 *
 * Web NFC gibt es nur in Chrome auf Android – die Knöpfe erscheinen nur, wenn
 * `NDEFReader` da ist, alle anderen sehen die App wie bisher. Gelesen wird
 * im Browser; der Server erfährt nur, was jemand danach speichert.
 */

type NdefRecord = {
  recordType: string;
  mediaType?: string;
  data?: DataView;
};

type NdefReadingEvent = Event & {
  serialNumber: string;
  message: { records: NdefRecord[] };
};

type NdefReaderLike = EventTarget & {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: NdefReadingEvent) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
};

declare global {
  interface Window {
    NDEFReader?: new () => NdefReaderLike;
  }
}

export function nfcSupported(): boolean {
  return (
    typeof window !== "undefined" && typeof window.NDEFReader === "function"
  );
}

export type NfcErrorCode =
  "unsupported" | "denied" | "not_openprinttag" | "corrupt" | "unreadable";

export class NfcReadError extends Error {
  readonly code: NfcErrorCode;
  constructor(code: NfcErrorCode) {
    super(code);
    this.code = code;
  }
}

/**
 * Wartet auf das nächste Tag und liest es als OpenPrintTag. `signal` bricht
 * das Warten ab (Dialog geschlossen).
 */
export async function scanOpenPrintTag(
  signal: AbortSignal
): Promise<OpenPrintTagMaterial> {
  if (!nfcSupported() || !window.NDEFReader)
    throw new NfcReadError("unsupported");
  const reader = new window.NDEFReader();
  try {
    await reader.scan({ signal });
  } catch (error) {
    throw new NfcReadError(
      (error as Error)?.name === "NotAllowedError" ? "denied" : "unsupported"
    );
  }
  return new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason));
    reader.onreadingerror = () => reject(new NfcReadError("unreadable"));
    reader.onreading = event => {
      const record = event.message.records.find(
        r => r.recordType === "mime" && r.mediaType === OPENPRINTTAG_MIME
      );
      if (!record?.data) return reject(new NfcReadError("not_openprinttag"));
      try {
        resolve(
          readOpenPrintTag(
            new Uint8Array(
              record.data.buffer,
              record.data.byteOffset,
              record.data.byteLength
            )
          )
        );
      } catch (error) {
        reject(
          new NfcReadError(
            error instanceof OpenPrintTagError ? error.code : "corrupt"
          )
        );
      }
    };
  });
}
