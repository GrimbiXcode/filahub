import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";

export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type MaterialOverview = RouterOutputs["material"]["list"][number];
export type MaterialDetail = RouterOutputs["material"]["byId"];
export type SpoolTypeItem = RouterOutputs["spoolType"]["list"][number];
export type StorageBoxItem = RouterOutputs["storageBox"]["list"][number];

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
