import { useId } from "react";
import type { ResolvedColorSpec, TextureKind } from "@contracts/appearance";
import { cn } from "@/lib/utils";
import { colorFace } from "./colorFace";
import { hatchDefs } from "./textures";

/**
 * Farbe und Oberfläche eines Materials als ein Feld.
 *
 * Die Grundfläche trägt den Farbcode, darüber liegt das Muster der Oberfläche –
 * Matt als feines Rauschen, Glänzend als zwei Glanzstriche, Carbon als Gewebe.
 * So ist in einer Zeile zu sehen, was sonst zwei Wörter sind.
 *
 * **Der Farbwert ist Daten, kein Styling.** `AGENTS.md` verbietet feste Farben
 * im UI-Code – das gilt für Gestaltung. Hier ist der Hex-Wert der Inhalt und
 * kommt deshalb als `fill` ins SVG. Alles drumherum (Rahmen, Rückfallfeld,
 * Beschriftung) läuft über die Tokens.
 *
 * **Das Muster ist nie fest weiß.** Seine Farbe kommt aus `overlayInk` und ist
 * immer die kontrastreichere von Schwarz und Weiß zur Grundfarbe. Ein fest
 * weißer Glanzstrich verschwände auf weißem Filament vollständig, ein fest
 * schwarzes Karbonmuster auf schwarzem – also genau dort, wo die Zeichnung
 * gebraucht wird. Die Zusicherung dahinter steht in `api/appearance.test.ts`.
 */

const SIZES = {
  sm: "size-6",
  md: "size-10",
} as const;

export type SwatchSize = keyof typeof SIZES;

export function AppearanceSwatch({
  hex,
  kinds,
  spec,
  label,
  size = "sm",
  className,
}: {
  /** `null` = kein Farbcode hinterlegt; dann erscheint das Rückfallfeld */
  hex: string | null;
  /** Musterarten, Struktur vor Glanz (seit 4.9.0 bis zu zwei) */
  kinds: readonly TextureKind[];
  /** Farbbild (seit 4.7.0): mehrere Farben, Partikelfarben */
  spec?: ResolvedColorSpec | null;
  /** Beschriftung mit den echten Texten – der Text darf nicht verlorengehen */
  label: string;
  size?: SwatchSize;
  className?: string;
}) {
  /*
    `<pattern>`- und `<filter>`-Kennungen gelten im ganzen Dokument. Ohne eine
    eigene je Feld zeigten alle zwanzig Zeilen einer Tabelle das Muster der
    ersten – deshalb `useId` und nicht ein fester Name.
  */
  const uid = useId().replace(/:/g, "");

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        /*
          Der Ring ist nicht Zierde: Ohne ihn steht ein fast weißes Feld im
          hellen Thema und ein fast schwarzes im dunklen randlos in der Fläche.
        */
        "inline-block shrink-0 overflow-hidden rounded ring-1 ring-border",
        SIZES[size],
        className
      )}
    >
      {hex ? (
        <ColorSwatch hex={hex} kinds={kinds} spec={spec} uid={uid} />
      ) : (
        <FallbackSwatch uid={uid} />
      )}
    </span>
  );
}

function ColorSwatch({
  hex,
  kinds,
  spec,
  uid,
}: {
  hex: string;
  kinds: readonly TextureKind[];
  spec?: ResolvedColorSpec | null;
  uid: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      {colorFace({ hex, kinds, spec, uid })}
    </svg>
  );
}

/**
 * Kein Farbcode hinterlegt: eine Schraffur aus den Tokens.
 *
 * Bewusst kein geratener Farbton aus dem Namen – „Feuerrot" könnte dann grün
 * erscheinen, und eine falsche Farbe ist schlechter als eine ehrliche Lücke.
 */
function FallbackSwatch({ uid }: { uid: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-full w-full bg-muted text-muted-foreground"
      aria-hidden="true"
    >
      <defs>{hatchDefs(uid)}</defs>
      <rect width="24" height="24" fill={`url(#${uid}-hatch)`} />
    </svg>
  );
}
