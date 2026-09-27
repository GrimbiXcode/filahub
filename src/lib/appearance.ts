import { useMemo } from "react";
import {
  resolveAppearance,
  type AppearanceCatalog,
  type ResolvedAppearance,
  type ResolvedColorSpec,
  type TextureKind,
} from "@contracts/appearance";
import { useActiveScope } from "@/lib/activeScope";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18nContext";
import { useFormat } from "@/lib/formatContext";

/**
 * Die eigenen Farben und Oberflächen des aktiven Bereichs.
 *
 * **Ein Aufruf für die ganze Seite, nicht einer je Zeile.** Der Katalog ist für
 * alle Zeilen derselbe und klein; ihn pro Material mitzuschicken bliese die
 * Materialliste um zwei Felder je Zeile auf, ohne eine Frage zu beantworten,
 * die der Browser nicht selbst beantworten kann.
 *
 * Die Ausnahme ist der Bestand eines Freundes: Dort löst der Server auf, weil
 * der Katalog des Betrachters die Farben des Freundes gar nicht kennt (siehe
 * `toFriendMaterial` in `api/queries/friends.ts`).
 *
 * **`isPending` gehört zur Auskunft.** Solange die Abfrage läuft, ist der
 * Katalog leer – und ein leerer Katalog sieht wie „nichts hinterlegt" aus,
 * obwohl er „weiß ich noch nicht" heißt. Wo aus dieser Antwort eine Handlung
 * folgt, muss der Unterschied sichtbar sein; deshalb kommt er hier mit heraus
 * und nicht als stiller Sonderfall beim Aufrufer.
 */
export function useAppearanceCatalog(): {
  catalog: AppearanceCatalog;
  isPending: boolean;
} {
  const scope = useActiveScope();
  const { data, isPending } = trpc.appearance.list.useQuery(scope, {
    staleTime: 1000 * 60 * 5,
  });

  const catalog = useMemo(
    () => ({
      colors: new Map((data?.colors ?? []).map(c => [c.nameKey, c.hex])),
      textures: new Map((data?.textures ?? []).map(t => [t.nameKey, t.kind])),
      // Nur Einträge mit Farbbild; die Leitfarbe steht für alle in `colors`.
      colorSpecs: new Map(
        (data?.colors ?? []).flatMap(c =>
          c.spec ? [[c.nameKey, c.spec] as const] : []
        )
      ),
    }),
    [data]
  );
  return { catalog, isPending };
}

/**
 * Die Auflösung Freitext → Darstellung, einmal gebaut und für jede Zeile
 * benutzbar.
 */
export function useAppearanceResolver(): (
  color: string | null | undefined,
  texture: string | null | undefined
) => ResolvedAppearance {
  const { catalog } = useAppearanceCatalog();
  return useMemo(
    () => (color, texture) => resolveAppearance(color, texture, catalog),
    [catalog]
  );
}

/**
 * Die Wirkungen eines Farbbilds in Worten (seit 4.8.0): „wechselt unter UV zu
 * Violett“, „leuchtet im Dunkeln in Grün“. Für die Beschriftung der Spule und
 * die Liste auf der Material-Seite – eine Formulierung für beide.
 *
 * Die Zielfarbe beim Namen, sonst „einer anderen Farbe“ – nie der Farbcode.
 * Die Schwelle über `useFormat`, weil sie eine Zahl ist.
 */
export function useEffectDescriptions(): (
  spec: ResolvedColorSpec | null | undefined
) => string[] {
  const t = useT();
  const { formatNumber } = useFormat();
  return useMemo(
    () => spec =>
      (spec?.effects ?? []).map(effect =>
        t.appearance.labelEffect[effect.kind]({
          to: effect.to?.name ?? t.appearance.labelOtherColor,
          threshold:
            effect.thresholdC == null
              ? null
              : `${formatNumber(effect.thresholdC)} °C`,
        })
      ),
    [t, formatNumber]
  );
}

/**
 * Beschriftung eines Felds – mit den **echten** Texten, nicht mit der
 * Musterart.
 *
 * Das Feld ersetzt die Wörter nicht, es tritt daneben: Wer die Farbe nicht
 * ansieht oder nicht ansehen kann, bekommt sie hier vorgelesen. Deshalb steht
 * hier „Farbe Schwarz, Oberfläche Matt“ und nicht „schwarzes Feld mit
 * Rauschen“.
 */
export function useSwatchLabel(): (
  color: string | null | undefined,
  texture: string | null | undefined,
  hex: string | null,
  spec?: ResolvedColorSpec | null
) => string {
  const t = useT();
  const describeEffects = useEffectDescriptions();
  return useMemo(
    () => (color, texture, hex, spec) => {
      const parts: string[] = [];
      parts.push(
        color
          ? t.appearance.labelColor({ color })
          : t.appearance.labelColorUnknown
      );
      /*
        Mehrfarbig: Anordnung und die Farben beim Namen – „zweifarbig: Gold
        und Silber“. Nie der Farbcode; „#c8a02c“ vorgelesen hilft niemandem.
        Ohne Namen „Farbe 2“, ein unbekannter Teil heißt so.
      */
      if (spec && spec.colors.length >= 2 && spec.layout !== "solid") {
        const names = spec.colors.map(
          (stop, index) =>
            stop.name ??
            (stop.hex
              ? t.appearance.colorStopLabel({ n: index + 1 })
              : t.appearance.labelUnknownPart)
        );
        // Ohne einen einzigen Namen hilft die Aufzählung „Farbe 1 … Farbe 6“
        // niemandem – dann nur die Zahl.
        const joined = spec.colors.every(stop => !stop.name)
          ? t.appearance.labelColorCount({ count: spec.colors.length })
          : `${names.slice(0, -1).join(", ")} ${t.appearance.labelAnd} ${names.at(-1)}`;
        parts.push(
          t.appearance.labelSpec({
            layout: t.appearance.labelLayout[spec.layout]({
              count: spec.colors.length,
            }),
            colors: joined,
          })
        );
      }
      parts.push(...describeEffects(spec));
      if (texture) parts.push(t.appearance.labelTexture({ texture }));
      if (color && !hex) parts.push(t.appearance.labelNoColorCode);
      return parts.join(", ");
    },
    [t, describeEffects]
  );
}

/** Beschriftung einer Musterart für Auswahl und Verwaltung. */
export function useTextureKindLabel(): (kind: TextureKind) => string {
  const t = useT();
  return useMemo(() => (kind: TextureKind) => t.appearance.kinds[kind], [t]);
}
