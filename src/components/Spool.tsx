import { useId, type CSSProperties } from "react";
import {
  effectKindsOf,
  type ResolvedColorSpec,
  type TextureKind,
} from "@contracts/appearance";
import { EFFECT_ICONS } from "@/lib/effectIcons";
import { colorFace, faceInk } from "./colorFace";
import { hatchDefs } from "./textures";
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

/**
 * Der Kern (Radius 36 im 120er-Raum) zeigt vom 24er-Raum der Muster nur den
 * Kreis mit Radius 7,2 um die Mitte – je Seite bleiben 4,8 unsichtbar.
 * `colorFace` verteilt Streifen und Verläufe über den sichtbaren Teil.
 */
const CORE_INSET = 12 - 36 / 5;

/** Umfang des Füllrings – Radius 52 im 120er-Raum. */
/**
 * Die Zeichen der Wirkungen (seit 4.8.0) sitzen oben rechts am Rand der
 * Spule, wie Aufkleber. Unter 56 Pixeln Kantenlänge wären es Krümel; dort
 * sagt es nur die Beschriftung.
 */
const BADGE_MIN_SIZE = 56;
/** Höchstens so viele Zeichen; ab dem nächsten steht „+n“ */
const BADGES_MAX = 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

export function Spool({
  hex,
  kind,
  spec,
  glow,
  effectsFrom,
  percent,
  label,
  size = 72,
  showPercent = false,
  className,
}: {
  /** `null` = kein Farbcode hinterlegt; dann erscheint die Schraffur */
  hex: string | null;
  kind: TextureKind;
  /** Farbbild (seit 4.7.0): mehrere Farben, Partikelfarben */
  spec?: ResolvedColorSpec | null;
  /** Leuchtfarbe, wenn das Stück in der gezeigten Ansicht leuchtet (4.8.0) */
  glow?: string | null;
  /**
   * Woher die Zeichen der Wirkungen kommen, wenn nicht aus `spec` – in der
   * Vorschau unter UV zeigt `spec` die Zielfarbe ohne Wirkungen, die Zeichen
   * beschreiben aber das Material und bleiben stehen.
   */
  effectsFrom?: ResolvedColorSpec | null;
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
  const ink = hex ? faceInk(hex, spec) : null;

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
        {hex ? (
          <g transform="scale(5)">
            {colorFace({ hex, kind, spec, uid, inset: CORE_INSET, glow })}
          </g>
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
      {size >= BADGE_MIN_SIZE && <EffectBadges spec={effectsFrom ?? spec} />}
    </svg>
  );
}

/**
 * Die Zeichen der Wirkungen, senkrecht am rechten oberen Rand. Nur zur
 * Orientierung – was sie bedeuten, steht in der Beschriftung der Spule, und
 * die Zeichen selbst sind für Hilfstechnik verborgen.
 */
function EffectBadges({ spec }: { spec?: ResolvedColorSpec | null }) {
  const kinds = effectKindsOf(spec);
  if (kinds.length === 0) return null;
  const shown =
    kinds.length > BADGES_MAX ? kinds.slice(0, BADGES_MAX - 1) : kinds;
  const rest = kinds.length - shown.length;
  return (
    <g aria-hidden="true">
      {shown.map((kind, index) => {
        const Icon = EFFECT_ICONS[kind];
        const cy = 13 + index * 27;
        return (
          <g key={kind}>
            <circle
              cx="107"
              cy={cy}
              r="12"
              className="fill-background stroke-border"
              strokeWidth="1.5"
            />
            <Icon
              x={107 - 8}
              y={cy - 8}
              width={16}
              height={16}
              strokeWidth={2.5}
              className="text-foreground"
            />
          </g>
        );
      })}
      {rest > 0 && (
        <g>
          <circle
            cx="107"
            cy={13 + shown.length * 27}
            r="12"
            className="fill-background stroke-border"
            strokeWidth="1.5"
          />
          <text
            x="107"
            y={13 + shown.length * 27 + 4}
            textAnchor="middle"
            className="fill-foreground font-mono text-[11px] font-semibold"
          >
            +{rest}
          </text>
        </g>
      )}
    </g>
  );
}
