import {
  COLOR_ACCENTS_MAX,
  COLOR_EFFECT_KINDS,
  COLOR_EFFECTS_MAX,
  COLOR_LAYOUT_LIMITS,
  COLOR_SPEC_VERSION,
  normalizeHex,
  type ColorEffect,
  type ColorEffectKind,
  type ColorLayout,
  type ColorSpec,
  type ColorSpecInput,
  type ResolvedColorSpec,
} from "@contracts/appearance";

/**
 * Der Zustand des Farbbild-Editors (`ColorSpecEditor`) und die Wege hinein und
 * hinaus. Eigene Datei ohne Komponenten – React Fast Refresh verlangt Module,
 * die entweder nur Komponenten oder keine exportieren.
 *
 * Farbcodes stehen hier als Text, wie getippt: Das Textfeld neben dem
 * Farbwähler darf zwischendurch „#12“ enthalten. Geprüft wird erst beim
 * Speichern (`editorValueToInput`).
 */

export type EditorColor = { readonly hex: string; readonly name: string };

export type ColorEditorValue = {
  readonly layout: ColorLayout;
  readonly colors: readonly EditorColor[];
  readonly accents: readonly string[];
  /**
   * Wirkungen werden hier (noch) nicht bearbeitet, aber mitgeführt: Wer ein
   * Farbbild mit Wirkung umfärbt, soll sie nicht still verlieren.
   */
  readonly effects: readonly ColorEffect[];
};

/** Ausgangston einer neuen Farbe ohne Vorlage */
export const DEFAULT_EDITOR_HEX = "#3b82f6";

/** Ersatz für ein unbekanntes Stück eines berechneten Farbbilds („Rot/Xyz“) */
const UNKNOWN_STOP_HEX = "#8a8a8f";

/**
 * Editorzustand aus einer Leitfarbe und – wenn vorhanden – einem Farbbild.
 * Nimmt gespeicherte (`ColorSpec`) und berechnete Farbbilder
 * (`ResolvedColorSpec`, etwa aus „Rot/Blau“) gleichermaßen: So startet „genau
 * festlegen“ bei dem, was die App schon erkannt hat.
 */
export function editorValueFrom(
  hex: string | null | undefined,
  spec?: ColorSpec | ResolvedColorSpec | null
): ColorEditorValue {
  const lead = hex ?? DEFAULT_EDITOR_HEX;
  if (!spec) {
    return {
      layout: "solid",
      colors: [{ hex: lead, name: "" }],
      accents: [],
      effects: [],
    };
  }
  return {
    layout: spec.layout,
    colors: spec.colors.map(stop => ({
      hex: stop.hex ?? UNKNOWN_STOP_HEX,
      name: stop.name ?? "",
    })),
    accents: spec.accents.map(accent =>
      typeof accent === "string" ? accent : accent.hex
    ),
    effects: [...spec.effects],
  };
}

/**
 * Anordnung wechseln und die Farbliste an deren Grenzen anpassen: Fehlt eine
 * Farbe, kommt eine Kopie der letzten dazu; sind es zu viele, fallen die
 * hinteren weg. Einfarbig behält die erste.
 */
export function withLayout(
  value: ColorEditorValue,
  layout: ColorLayout
): ColorEditorValue {
  const { min, max } = COLOR_LAYOUT_LIMITS[layout];
  const colors = [...value.colors].slice(0, max);
  while (colors.length < min) {
    const last = colors.at(-1);
    colors.push({ hex: last?.hex ?? DEFAULT_EDITOR_HEX, name: "" });
  }
  return { ...value, layout, colors };
}

export function canAddColor(value: ColorEditorValue): boolean {
  return value.colors.length < COLOR_LAYOUT_LIMITS[value.layout].max;
}

export function canRemoveColor(value: ColorEditorValue): boolean {
  return value.colors.length > COLOR_LAYOUT_LIMITS[value.layout].min;
}

export function canAddAccent(value: ColorEditorValue): boolean {
  return value.accents.length < COLOR_ACCENTS_MAX;
}

/**
 * Was an den Server geht: ein Farbcode, wenn das Farbbild nur eine Farbe ohne
 * Partikel und Wirkung ist, sonst das Farbbild. Die Leitfarbe leitet der
 * Server selbst ab. `null`, wenn ein Farbcode nicht lesbar ist.
 */
export function editorValueToInput(
  value: ColorEditorValue
): { hex: string } | { spec: ColorSpecInput } | null {
  const colors = value.colors.map(color => ({
    hex: normalizeHex(color.hex),
    name: color.name.trim(),
  }));
  const accents = value.accents.map(accent => normalizeHex(accent));
  if (colors.some(color => !color.hex) || accents.some(accent => !accent)) {
    return null;
  }
  if (
    value.layout === "solid" &&
    accents.length === 0 &&
    value.effects.length === 0
  ) {
    return { hex: colors[0].hex! };
  }
  return {
    spec: {
      schemaVersion: COLOR_SPEC_VERSION,
      layout: value.layout,
      colors: colors.map(color => ({
        hex: color.hex!,
        ...(color.name ? { name: color.name } : {}),
      })),
      accents: accents.map(accent => ({ hex: accent! })),
      effects: [...value.effects],
    },
  };
}

/**
 * Die Vorschau, wie Feld und Spule sie zeichnen – auch mitten im Tippen:
 * Nicht lesbare Codes zeigen als Lücke, statt die Vorschau zu leeren.
 */
export function editorPreview(value: ColorEditorValue): {
  hex: string | null;
  spec: ResolvedColorSpec | null;
} {
  const colors = value.colors.map(color => ({
    hex: normalizeHex(color.hex),
    name: color.name || undefined,
  }));
  const accents = value.accents
    .map(accent => normalizeHex(accent))
    .filter((accent): accent is string => accent != null);
  const lead = colors.find(color => color.hex != null)?.hex ?? null;
  if (value.layout === "solid" && accents.length === 0) {
    return { hex: lead, spec: null };
  }
  return {
    hex: lead,
    spec: {
      layout: value.layout,
      colors,
      accents,
      effects: value.effects,
    },
  };
}

// ---------------------------------------------------------------------------
// Wirkungen (seit 4.8.0)
// ---------------------------------------------------------------------------

/** Ausgangsfarbe einer neuen Wirkung – violett, wie die meisten UV-Filamente */
const DEFAULT_EFFECT_HEX = "#7b3fb8";

/** Wirkungen ohne Zielfarbe: Infrarot hat keine, „Sonstiges“ darf keine haben */
export function effectNeedsTarget(kind: ColorEffectKind): boolean {
  return kind !== "infrared" && kind !== "other";
}

/** Die Arten, die noch nicht vergeben sind – jede Wirkung höchstens einmal */
export function freeEffectKinds(
  value: ColorEditorValue,
  except?: ColorEffectKind
): ColorEffectKind[] {
  const used = new Set(value.effects.map(effect => effect.kind));
  return COLOR_EFFECT_KINDS.filter(kind => kind === except || !used.has(kind));
}

export function canAddEffect(value: ColorEditorValue): boolean {
  return (
    value.effects.length < COLOR_EFFECTS_MAX &&
    freeEffectKinds(value).length > 0
  );
}

/** Die nächste freie Wirkung, mit Zielfarbe, wo sie eine braucht */
export function newEffect(value: ColorEditorValue): ColorEffect {
  const kind = freeEffectKinds(value)[0];
  return effectNeedsTarget(kind)
    ? { kind, to: { hex: DEFAULT_EFFECT_HEX } }
    : { kind };
}

/**
 * Art einer Wirkung wechseln: Die Zielfarbe bleibt, wo es eine gibt, und
 * entfällt bei Infrarot; die Schwelle gilt nur bei Wärme.
 */
export function withEffectKind(
  effect: ColorEffect,
  kind: ColorEffectKind
): ColorEffect {
  const to =
    kind === "infrared"
      ? undefined
      : (effect.to ??
        (effectNeedsTarget(kind) ? { hex: DEFAULT_EFFECT_HEX } : undefined));
  return {
    kind,
    ...(to ? { to } : {}),
    ...(kind === "thermochromic" && effect.thresholdC !== undefined
      ? { thresholdC: effect.thresholdC }
      : {}),
    ...(effect.note ? { note: effect.note } : {}),
  };
}
