export const Session = {
  cookieName: "filament_sid",
  /**
   * Lebensdauer einer Sitzung. Ein Jahr war reichlich für ein Token, das sich
   * nicht widerrufen ließ; 30 Tage sind bequem genug und begrenzen den
   * Schaden, wenn ein Token abhandenkommt.
   *
   * Gilt für Cookie **und** JWT – `signSessionToken` leitet die Ablaufzeit
   * hieraus ab, damit beide nicht auseinanderlaufen können.
   */
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
} as const;

/**
 * Kopfzeile, mit der der Client seine tatsächliche Oberflächensprache meldet.
 * Nötig, solange die Spracheinstellung auf „automatisch“ steht – dann kennt
 * nur der Browser die Sprache (siehe api/context.ts).
 */
export const LANGUAGE_HEADER = "x-filahub-language";
