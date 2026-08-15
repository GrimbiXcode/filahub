import { useMemo } from "react";
import {
  resolveAppearance,
  type AppearanceCatalog,
  type ResolvedAppearance,
  type TextureKind,
} from "@contracts/appearance";
import { useActiveScope } from "@/lib/activeScope";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18nContext";

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
  hex: string | null
) => string {
  const t = useT();
  return useMemo(
    () => (color, texture, hex) => {
      const parts: string[] = [];
      parts.push(
        color
          ? t.appearance.labelColor({ color })
          : t.appearance.labelColorUnknown
      );
      if (texture) parts.push(t.appearance.labelTexture({ texture }));
      if (color && !hex) parts.push(t.appearance.labelNoColorCode);
      return parts.join(", ");
    },
    [t]
  );
}

/** Beschriftung einer Musterart für Auswahl und Verwaltung. */
export function useTextureKindLabel(): (kind: TextureKind) => string {
  const t = useT();
  return useMemo(() => (kind: TextureKind) => t.appearance.kinds[kind], [t]);
}
