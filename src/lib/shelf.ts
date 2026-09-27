import type { MaterialOverview } from "@/types";

/**
 * Das Regal: die Gebinde nach Drybox gruppiert, „Ohne Box“ zuletzt – oder
 * seit 4.0.0 nach Material.
 * Reine Logik ohne React – die Darstellung steht in
 * `src/components/MaterialShelf.tsx`.
 */

export type ShelfGroup = {
  key: string;
  name: string;
  /** Tara der Box, `null` beim Brett ohne Box und bei Material-Brettern */
  tareWeight: number | null;
  /** Nur bei Material-Brettern: ob das Material knapp ist (`productStock`) */
  low?: boolean;
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

/**
 * Nach Material gruppiert (seit 4.0.0): je Material ein Brett mit seinen
 * Gebinden, Bretter nach Namen. Knappe Materialien tragen `low`, damit das
 * Brett selbst warnt und nicht jede Rolle einzeln.
 */
export function groupByProduct(
  materials: readonly MaterialOverview[]
): ShelfGroup[] {
  const groups = new Map<number, ShelfGroup>();
  for (const m of materials) {
    let group = groups.get(m.productId);
    if (!group) {
      group = {
        key: `product-${m.productId}`,
        name: m.name,
        tareWeight: null,
        low: m.stock.low,
        items: [],
      };
      groups.set(m.productId, group);
    }
    group.items.push(m);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
