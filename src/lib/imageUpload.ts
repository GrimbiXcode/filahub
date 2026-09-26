import { IMAGE_MAX_EDGE, THUMBNAIL_MAX_EDGE } from "@contracts/printFiles";

/**
 * Fotos vor dem Hochladen verkleinern und neu kodieren (seit 4.3.0).
 *
 * Das ist **Datenschutz, nicht Kosmetik**: Ein Handyfoto vom Drucker trägt in
 * seinen EXIF-Daten die GPS-Position – oft die Wohnadresse. Das Neukodieren
 * über ein Canvas schreibt nur die Pixel; EXIF, XMP und alles andere bleiben
 * zurück. Der Server lehnt Bilder mit Metadaten zusätzlich ab
 * (`detectPrintFile` → `hasMetadata`), eine Datei am Browser vorbei kommt
 * also nicht durch.
 *
 * Die Ausrichtung aus dem EXIF wird vorher angewendet
 * (`imageOrientation: "from-image"`) – sonst stünde ein Hochkantfoto nach dem
 * Entfernen der Metadaten auf der Seite.
 */

export type PreparedImage = {
  file: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
};

async function encode(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  const toBlob = (type: string) =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  /*
    WebP, wo der Browser es schreiben kann; Safari liefert auf die Bitte um
    WebP stillschweigend PNG – dann lieber JPEG, das ist bei Fotos ein
    Zehntel so groß.
  */
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
  if (!blob) throw new Error("encode");
  return { blob, width, height };
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const full = await encode(bitmap, IMAGE_MAX_EDGE, 0.85);
    const thumb = await encode(bitmap, THUMBNAIL_MAX_EDGE, 0.8);
    return {
      file: full.blob,
      thumbnail: thumb.blob,
      width: full.width,
      height: full.height,
    };
  } finally {
    bitmap.close();
  }
}

/** Ob eine gewählte Datei ein Foto ist, das der Browser öffnen kann */
export function looksLikeImage(file: File): boolean {
  return file.type.startsWith("image/") && file.type !== "image/svg+xml";
}

/** Dateiendung zum neu kodierten Typ – für den angezeigten Namen */
export function renameForType(name: string, type: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "foto";
  return `${base}.${type === "image/webp" ? "webp" : "jpg"}`;
}
