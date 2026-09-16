import { useId, type CSSProperties } from "react";
import {
  counterInk,
  overlayInk,
  type TextureKind,
} from "@contracts/appearance";
import { hatchDefs, textureDefs, textureOverlay } from "./textures";
import { fillLevelStroke } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Ein Material als Spule: der Ring ist der Füllstand, der Kern Farbe und
 * Oberfläche.
 *
 * Die Bildmarke der App ist eine Spule von vorn – hier wird sie zum Bauteil.
 * Der Bogen trägt dieselbe Skala wie jeder Füllbalken (`fillLevelStroke`), der
 * Kern dieselben Muster wie das Feld in der Tabelle (`AppearanceSwatch`), nur
 * fünfmal so groß: `textureOverlay` zeichnet im 24×24-Raum, die Gruppe
 * skaliert ihn auf die 120 Einheiten der Spule. So gibt es je Oberfläche
 * weiterhin genau eine Zeichnung.
 *
 * **Der Farbwert ist Daten, kein Styling** – wie beim Swatch kommt der Hex-Wert
 * als `fill` ins SVG; Ring, Nabe und Rand laufen über die Tokens.
 *
 * `percent` fehlt, wenn keine Nennmenge hinterlegt ist: dann bleibt der Ring
 * leer und grau statt irgendetwas vorzutäuschen.
 */

/** Umfang des Füllrings – Radius 52 im 120er-Raum. */
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

export function Spool({
  hex,
  kind,
  percent,
  label,
  size = 72,
  showPercent = false,
  className,
}: {
  /** `null` = kein Farbcode hinterlegt; dann erscheint die Schraffur */
  hex: string | null;
  kind: TextureKind;
  /** Füllstand 0–100, `null` ohne Nennmenge */
  percent: number | null;
  /** Für Hilfstechnik – die Spule ersetzt die Wörter nicht */
  label: string;
  /** Kantenlänge in Pixeln */
  size?: number;
  /** Prozentwert im Kern, unterhalb der Nabe – nur bei großen Spulen lesbar */
  showPercent?: boolean;
  className?: string;
}) {
  // Wie beim Swatch: Muster- und Filterkennungen gelten dokumentweit.
  const uid = useId().replace(/:/g, "");
  const clamped =
    percent == null ? 0 : Math.max(0, Math.min(100, percent)) / 100;
  const length = clamped * RING_CIRCUMFERENCE;
  const ink = hex ? overlayInk(hex) : null;

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={cn("shrink-0", className)}
    >
      <defs>
        <clipPath id={`${uid}-core`}>
          <circle cx="60" cy="60" r="36" />
        </clipPath>
        {hex && ink ? textureDefs(kind, uid, ink, counterInk(ink)) : null}
        {!hex && hatchDefs(uid)}
      </defs>

      {/* Ring: Spur und Bogen */}
      <circle
        cx="60"
        cy="60"
        r="52"
        fill="none"
        strokeWidth="11"
        className="stroke-muted"
      />
      {percent != null && length > 0 && (
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${length} ${RING_CIRCUMFERENCE}`}
          transform="rotate(-90 60 60)"
          className={cn("animate-spool-draw", fillLevelStroke(percent))}
          style={{ "--spool-len": length } as CSSProperties}
        />
      )}

      {/* Kern: Farbe und Oberfläche, in den Kreis geschnitten */}
      <g clipPath={`url(#${uid}-core)`}>
        {hex && ink ? (
          <>
            <rect width="120" height="120" fill={hex} />
            <g transform="scale(5)">{textureOverlay(kind, uid, ink)}</g>
          </>
        ) : (
          <>
            <rect width="120" height="120" className="fill-muted" />
            <rect
              width="120"
              height="120"
              fill={`url(#${uid}-hatch)`}
              className="text-muted-foreground"
            />
          </>
        )}
      </g>
      {/* Der Rand ist nicht Zierde: Ohne ihn stünde ein schwarzer Kern randlos
          im dunklen Schema und ein weißer im hellen. */}
      <circle
        cx="60"
        cy="60"
        r="36"
        fill="none"
        className="stroke-foreground/20"
      />
      {/* Nabe */}
      <circle cx="60" cy="60" r="9" className="fill-background stroke-border" />

      {showPercent && percent != null && (
        <text
          x="60"
          y="87"
          textAnchor="middle"
          fill={ink ?? "currentColor"}
          className={cn(
            "font-mono text-[11px] font-semibold",
            !ink && "text-muted-foreground"
          )}
        >
          {Math.round(percent)} %
        </text>
      )}
    </svg>
  );
}
