import {
  readSlicerFile,
  type ByteSource,
  type SlicerJob,
} from "@contracts/slicerMetadata";

/**
 * Eine gewählte Datei als `ByteSource` – gelesen wird nur, was der Parser
 * anfordert (`Blob.slice`), nie die ganze Datei. Ein G-Code von 150 MB kostet
 * damit ein paar hundert Kilobyte Speicher, und nichts davon geht ins Netz.
 */
export function blobByteSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) =>
      new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
  };
}

/** Endungen für die Dateiauswahl; geprüft wird trotzdem an den Bytes */
export const SLICER_FILE_ACCEPT = ".gcode,.bgcode,.gco,.g";

export function readSlicerUpload(file: File): Promise<SlicerJob> {
  return readSlicerFile(blobByteSource(file), file.name);
}
