import {
  buildVariantDisplayName,
  resolveName,
  type NameI18n,
} from "@contracts/presets";
import { useI18n } from "@/lib/i18nContext";

type Named = { name: string; nameI18n?: NameI18n | null };

/**
 * Katalognamen in der aktiven Sprache.
 *
 * Der Baum aus `preset.tree` liefert bewusst die Rohdaten (`name` plus
 * `nameI18n`) statt fertiger Texte: Die Verwaltung muss beide Sprachen
 * bearbeiten können, und der Client kennt seine tatsächliche Sprache ohnehin
 * genauer als der Server (Einstellung „automatisch“).
 *
 * Die flache Auswahlliste `preset.options` und die Materialabfragen liefern
 * dagegen fertige Namen – dort braucht niemand die Rohdaten.
 */
export function usePresetNames() {
  const { language } = useI18n();
  return {
    /** Name einer Serie oder Ausführung in der aktiven Sprache */
    name: (entry: Named) => resolveName(entry, language),
    /** „Polymaker · PolyTerra PLA · Kartonspule · 1 kg“ */
    variantLabel: (parts: {
      manufacturer: { name: string };
      series: Named;
      version: Named;
      nominalWeight: number;
    }) =>
      buildVariantDisplayName({
        manufacturer: parts.manufacturer.name,
        series: resolveName(parts.series, language),
        version: resolveName(parts.version, language),
        nominalWeight: parts.nominalWeight,
      }),
  };
}
