import type { ReactNode } from "react";
import {
  counterInk,
  displayUnder,
  overlayInk,
  overlayInkFor,
  type ResolvedColorSpec,
  type TextureKind,
} from "@contracts/appearance";
import { hatchDefs, texturesDefs, texturesOverlay } from "./textures";

/**
 * Farbe und Oberfläche eines Materials im 24×24-Raum – die Fläche, die das
 * Feld (`AppearanceSwatch`) zeigt und die Spule (`Spool`) in ihren Kern
 * skaliert. Seit 4.7.0 auch mehrfarbig: Grundfläche nach Anordnung des
 * Farbbilds, darüber das Muster.
 *
 * Eigene Datei ohne Komponenten, aus demselben Grund wie `textures.tsx`: React
 * Fast Refresh verlangt Module, die entweder nur Komponenten oder keine
 * exportieren.
 *
 * **Das Muster je Teilfläche mit deren eigener Tinte.** Auf einer Grundfarbe
 * garantiert `overlayInk` den Kontrast; auf zwei Hälften Schwarz und Weiß
 * gibt es keine Tinte für beide. Deshalb wird bei koextrudiert und
 * segmentiert jede Teilfläche für sich gezeichnet – zugeschnitten auf ihre
 * Form, mit ihrer Tinte. Beim Verlauf geht das nicht (es gibt keine Grenze);
 * dort nimmt `overlayInkFor` die Tinte mit dem besten schlechtesten Kontrast,
 * und bei Mustern aus einzelnen Formen liegt ein Rand im Gegenton darunter.
 */

/**
 * Muster aus einzelnen Formen (Striche, Punkte, Sterne, Adern). Nur sie
 * bekommen auf einem Verlauf einen Rand; bei Flächenmustern (Rauschen,
 * Glanzband, Schachbrett) wäre der Rand eine zweite, gegenläufige Fläche –
 * aus Glanz würde Grau.
 */
const RIMMED_KINDS: ReadonlySet<TextureKind> = new Set([
  "glossy",
  "fiber",
  "wood",
  "speckle",
  "sparkle",
  "marble",
]);

/** Radius, über den die Sektoren sicher das ganze Feld abdecken */
const SECTOR_RADIUS = 20;

function point(angle: number) {
  const x = 12 + SECTOR_RADIUS * Math.cos(angle);
  const y = 12 + SECTOR_RADIUS * Math.sin(angle);
  // Gerundet, damit dieselbe Form bei jedem Rendern dieselbe Zeichenkette ist.
  return `${Math.round(x * 1000) / 1000} ${Math.round(y * 1000) / 1000}`;
}

/**
 * Tortenstück `index` von `count` um die Mitte, im Uhrzeigersinn – der
 * Querschnitt eines koextrudierten Strangs: zwei Hälften, drei Keile, vier
 * Viertel. Das erste Stück endet oben: bei zwei Farben die linke Hälfte, bei
 * vier das Viertel oben links – die erste Farbe steht, wo man zu lesen
 * beginnt („Rot/Blau“: Rot links).
 */
function sectorPath(index: number, count: number) {
  const step = (2 * Math.PI) / count;
  const start = -Math.PI / 2 + (index - 1) * step;
  const end = start + step;
  const largeArc = step > Math.PI ? 1 : 0;
  return `M12 12 L${point(start)} A${SECTOR_RADIUS} ${SECTOR_RADIUS} 0 ${largeArc} 1 ${point(end)} Z`;
}

/**
 * Der Teil des 24er-Raums, der zu sehen ist: im Feld alles, in der Spule nur
 * der Kern (Radius 7,2 um die Mitte). Streifen und Verläufe verteilen sich
 * über diesen Teil – sonst zeigte die Spule vom Regenbogen nur die mittleren
 * zwei Farben.
 */
function visibleSpan(inset: number) {
  return { from: inset, to: 24 - inset };
}

/** Streifen `index` von `count`, diagonal – harte Wechsel entlang des Strangs */
function bandRect(index: number, count: number, inset: number) {
  const { from, to } = visibleSpan(inset);
  // Diagonal gemessen ist der sichtbare Teil um √2 länger als seine Kante.
  const span = (to - from) * Math.SQRT2;
  const width = span / count;
  const start = 12 - span / 2;
  return (
    <rect
      // Außen je 12 Einheiten Zugabe, damit die Ecken des Felds gefüllt sind
      x={index === 0 ? start - 12 : start + index * width}
      y={-12}
      width={width + (index === 0 || index === count - 1 ? 12 : 0)}
      height={48}
      transform="rotate(45 12 12)"
    />
  );
}

type Region = {
  readonly id: string;
  readonly hex: string | null;
  readonly shape: ReactNode;
};

function faceBody({
  hex,
  kinds,
  spec,
  uid,
  inset = 0,
}: {
  /** Leitfarbe; bei `null` ohne Farbbild zeichnet der Aufrufer das Rückfallfeld */
  hex: string;
  /** Musterarten, Struktur vor Glanz – seit 4.9.0 bis zu zwei */
  kinds: readonly TextureKind[];
  spec?: ResolvedColorSpec | null;
  /** Dokumentweit eindeutige Kennung für Muster, Verläufe und Zuschnitte */
  uid: string;
  /** Unsichtbarer Rand je Seite im 24er-Raum – die Spule zeigt nur ihren Kern */
  inset?: number;
}): ReactNode {
  const accents = spec?.accents ?? [];
  const colors = spec?.colors ?? [];
  const layout = colors.length >= 2 ? spec?.layout : "solid";

  // Einfarbig: eine Fläche, ein Muster – wie bis 4.6.0.
  if (!layout || layout === "solid") {
    const ink = overlayInk(hex);
    return (
      <>
        <defs>{texturesDefs(kinds, uid, ink, counterInk(ink))}</defs>
        <rect width="24" height="24" fill={hex} />
        {texturesOverlay(kinds, uid, ink, counterInk(ink), accents)}
      </>
    );
  }

  // Verlauf: eine Fläche mit weichen Stopps, eine Tinte für alle.
  if (layout === "gradient") {
    const ink = overlayInkFor(colors.map(stop => stop.hex));
    const counter = counterInk(ink);
    const known = colors.filter(
      (stop): stop is { hex: string } => stop.hex != null
    );
    // Den Rand bekommen nur die Arten aus einzelnen Formen, siehe oben.
    const rimmed = kinds.filter(kind => RIMMED_KINDS.has(kind));
    return (
      <>
        <defs>
          <linearGradient
            id={`${uid}-fill`}
            gradientUnits="userSpaceOnUse"
            x1={visibleSpan(inset).from}
            y1={visibleSpan(inset).from}
            x2={visibleSpan(inset).to}
            y2={visibleSpan(inset).to}
          >
            {known.map((stop, index) => (
              <stop
                key={index}
                offset={`${known.length === 1 ? 0 : (index / (known.length - 1)) * 100}%`}
                stopColor={stop.hex}
              />
            ))}
          </linearGradient>
          {texturesDefs(kinds, uid, ink, counter)}
          {rimmed.length > 0 && (
            <>
              {texturesDefs(rimmed, `${uid}-rim`, counter, ink)}
              <filter id={`${uid}-rimfilter`}>
                <feMorphology operator="dilate" radius="0.45" />
              </filter>
            </>
          )}
        </defs>
        <rect width="24" height="24" fill={`url(#${uid}-fill)`} />
        {rimmed.length > 0 && (
          <g filter={`url(#${uid}-rimfilter)`} opacity="0.6">
            {texturesOverlay(rimmed, `${uid}-rim`, counter, ink, [])}
          </g>
        )}
        {texturesOverlay(kinds, uid, ink, counter, accents)}
      </>
    );
  }

  // Koextrudiert und segmentiert: Teilflächen, jede mit eigener Tinte.
  const regions: Region[] = colors.map((stop, index) => ({
    id: `${uid}-r${index}`,
    hex: stop.hex,
    shape:
      layout === "coextruded" ? (
        <path d={sectorPath(index, colors.length)} />
      ) : (
        bandRect(index, colors.length, inset)
      ),
  }));
  const hasUnknown = regions.some(region => region.hex == null);

  return (
    <>
      <defs>
        {regions.map(region => (
          <clipPath key={region.id} id={`${region.id}-clip`}>
            {region.shape}
          </clipPath>
        ))}
        {regions.map(region => {
          if (!region.hex) return null;
          const ink = overlayInk(region.hex);
          return (
            <g key={region.id}>
              {texturesDefs(kinds, region.id, ink, counterInk(ink))}
            </g>
          );
        })}
        {hasUnknown && hatchDefs(uid)}
      </defs>
      {regions.map(region => {
        if (!region.hex) {
          /*
            Ein unbekannter Teil („Rot/Xyz“) zeigt die ehrliche Lücke, wie
            das Rückfallfeld – nur kleiner. Kein Muster darauf: Es gäbe keine
            Farbe, auf der es sitzt.
          */
          return (
            <g key={region.id} clipPath={`url(#${region.id}-clip)`}>
              <rect width="24" height="24" className="fill-muted" />
              <rect
                width="24"
                height="24"
                fill={`url(#${uid}-hatch)`}
                className="text-muted-foreground"
              />
            </g>
          );
        }
        const ink = overlayInk(region.hex);
        return (
          <g key={region.id} clipPath={`url(#${region.id}-clip)`}>
            <rect width="24" height="24" fill={region.hex} />
            {texturesOverlay(kinds, region.id, ink, counterInk(ink), accents)}
          </g>
        );
      })}
    </>
  );
}

/** Eine Farbe halb zu Weiß gemischt – die Mitte eines Leuchthofs */
function towardWhite(hex: string): string {
  const channel = (index: number) =>
    parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return (
    "#" +
    [0, 1, 2]
      .map(index =>
        Math.round(channel(index) + (255 - channel(index)) * 0.5)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

/**
 * Die Fläche samt Muster – und, wenn das Stück unter der gezeigten Bedingung
 * selbst leuchtet (seit 4.8.0: nachleuchtend im Dunkeln, fluoreszierend unter
 * Schwarzlicht), ein Hof in der Leuchtfarbe darüber. Anders als die
 * Oberfläche „Leuchtend“ (ein Ring in der Tinte, weil die Leuchtfarbe dort
 * unbekannt ist) kennt ein Farbbild die echte Farbe des Leuchtens.
 */
export function colorFace({
  glow,
  ...face
}: {
  hex: string;
  kinds: readonly TextureKind[];
  spec?: ResolvedColorSpec | null;
  uid: string;
  inset?: number;
  /** Leuchtfarbe unter der gezeigten Bedingung, sonst nichts */
  glow?: string | null;
}): ReactNode {
  /*
    Eine Farbe, die mit dem Blickwinkel kippt, steht überall als weicher
    Verlauf zur zweiten da – dieselbe Regel wie im Umschalter der Vorschau
    (`displayUnder`), damit Regal und Vorschau nicht auseinanderlaufen.
  */
  const normal = glow ? null : displayUnder(face.hex, face.spec, "normal");
  return (
    <>
      {faceBody(normal?.spec ? { ...face, spec: normal.spec } : face)}
      {glow && (
        <>
          <defs>
            <radialGradient id={`${face.uid}-halo`} cx="50%" cy="50%" r="60%">
              {/* Die Mitte heller als die Leuchtfarbe – sonst sähe ein
                  Neon unter Schwarzlicht aus wie am Tag. */}
              <stop
                offset="0%"
                stopColor={towardWhite(glow)}
                stopOpacity="0.95"
              />
              <stop offset="55%" stopColor={glow} stopOpacity="0.6" />
              <stop offset="100%" stopColor={glow} stopOpacity="0.25" />
            </radialGradient>
          </defs>
          <rect width="24" height="24" fill={`url(#${face.uid}-halo)`} />
        </>
      )}
    </>
  );
}

/**
 * Die Farbe für Text über der Fläche (Prozentzahl in der Spule): wie das
 * Muster die kontrastreichere Tinte, über mehrere Farben die mit dem besten
 * schlechtesten Kontrast.
 */
export function faceInk(hex: string, spec?: ResolvedColorSpec | null): string {
  const colors = spec?.colors ?? [];
  return colors.length >= 2
    ? overlayInkFor(colors.map(stop => stop.hex))
    : overlayInk(hex);
}
