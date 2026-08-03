import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";

export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type MaterialOverview = RouterOutputs["material"]["list"][number];
export type MaterialDetail = RouterOutputs["material"]["byId"];
export type SpoolTypeItem = RouterOutputs["spoolType"]["list"][number];
export type StorageBoxItem = RouterOutputs["storageBox"]["list"][number];

/** Preset-Katalog: Baum und flache Auswahlliste */
export type PresetCatalog = RouterOutputs["preset"]["tree"];
export type PresetManufacturerNode = PresetCatalog[number];
export type PresetSeriesNode = PresetManufacturerNode["series"][number];
export type PresetVersionNode = PresetSeriesNode["versions"][number];
export type PresetVariantNode = PresetVersionNode["variants"][number];
export type PresetOption = RouterOutputs["preset"]["options"][number];

/** Vorschläge – eigene Sicht und Moderationssicht */
export type PresetProposalItem =
  RouterOutputs["preset"]["proposals"]["mine"][number];
export type AdminProposalItem =
  RouterOutputs["admin"]["proposal"]["list"][number];

/** Gängige 3D-Druck-Materialarten für Vorschläge */
export const COMMON_MATERIAL_TYPES = [
  "PLA",
  "PLA+",
  "PETG",
  "ABS",
  "ASA",
  "TPU",
  "PA (Nylon)",
  "PC",
  "PET",
  "HIPS",
  "PVA",
  "PP",
  "Resin",
] as const;
