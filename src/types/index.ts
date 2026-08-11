import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";

export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type MaterialOverview = RouterOutputs["material"]["list"][number];
export type MaterialDetail = RouterOutputs["material"]["byId"];
export type SpoolTypeItem = RouterOutputs["spoolType"]["list"][number];
export type StorageBoxItem = RouterOutputs["storageBox"]["list"][number];

/**
 * Freunde und geteiltes Lager.
 *
 * `FriendMaterial` ist absichtlich schmaler als `MaterialOverview` – die
 * Projektion in `api/queries/friends.ts` lässt Preise, Notizen, Kaufdatum,
 * Lagerort und Wägungen weg. Wer hier ein Feld sucht und nicht findet, hat es
 * mit gutem Grund nicht.
 */
export type FriendshipItem = RouterOutputs["friend"]["list"][number];
export type FriendMaterial = RouterOutputs["friend"]["searchMaterials"][number];
export type LoanRequestItem = RouterOutputs["friend"]["loanRequests"][number];

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

/** Systemzustand für /verwaltung/system */
export type AdminSystemStatus = RouterOutputs["admin"]["system"]["status"];

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
