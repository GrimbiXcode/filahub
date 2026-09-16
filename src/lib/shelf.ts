import type { MaterialOverview } from "@/types";

/**
 * Das Regal: die Materialien nach Drybox gruppiert, „Ohne Box“ zuletzt.
 * Reine Logik ohne React – die Darstellung steht in
 * `src/components/MaterialShelf.tsx`.
 */

export type ShelfGroup = {
  key: string;
  name: string;
  /** Tara der Box, `null` beim Brett ohne Box */
  tareWeight: number | null;
  items: MaterialOverview[];
};

/** Nach Drybox gruppiert, Bretter nach Namen, das Brett ohne Box zuletzt. */
export function groupByStorageBox(
  materials: readonly MaterialOverview[],
  noBoxLabel: string
): ShelfGroup[] {
  const groups = new Map<string, ShelfGroup>();
  let noBox: ShelfGroup | null = null;
  for (const m of materials) {
    if (!m.storageBox) {
      noBox ??= { key: "none", name: noBoxLabel, tareWeight: null, items: [] };
      noBox.items.push(m);
      continue;
    }
    const key = String(m.storageBox.id);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: m.storageBox.name,
        tareWeight: m.storageBox.tareWeight,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(m);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  return noBox ? [...sorted, noBox] : sorted;
}
