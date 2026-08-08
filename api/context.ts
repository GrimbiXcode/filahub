import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import {
  FALLBACK_LANGUAGE,
  languageFromTag,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from "@contracts/i18n";
import { LANGUAGE_HEADER } from "@contracts/constants";
import { clientIpFrom } from "./lib/clientIp";
import { authenticateRequest } from "./telegram/auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  /**
   * Sprache, in der Antworten formuliert werden – betrifft heute die Namen
   * aus dem Preset-Katalog.
   *
   * Die Einstellung des Benutzers gewinnt. Steht sie auf „automatisch“
   * (`NULL`), entscheidet der Client per Kopfzeile: nur er kennt die Sprache
   * des Browsers. Ohne beides bleibt es bei der Grundsprache – damit liefert
   * auch ein `curl` etwas Brauchbares.
   */
  language: LanguageCode;
  /**
   * Adresse des Aufrufers, soweit ermittelbar – Schlüssel für die
   * Zugriffsbegrenzung. `null`, wenn keine Weiterleitungs-Kopfzeile ankommt;
   * dann teilen sich alle Aufrufer einen Eimer.
   */
  clientIp: string | null;
};

const KNOWN_LANGUAGES = SUPPORTED_LANGUAGES.map(l => l.code) as LanguageCode[];

function languageFromHeaders(headers: Headers): LanguageCode | null {
  const requested = headers.get(LANGUAGE_HEADER)?.trim();
  if (!requested) return null;
  return KNOWN_LANGUAGES.includes(requested as LanguageCode)
    ? (requested as LanguageCode)
    : languageFromTag(requested);
}

export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<TrpcContext> {
  const ctx: TrpcContext = {
    req: opts.req,
    resHeaders: opts.resHeaders,
    language: FALLBACK_LANGUAGE,
    clientIp: clientIpFrom(opts.req.headers),
  };
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    // Authentication is optional here
  }
  ctx.language =
    (ctx.user?.language as LanguageCode | null | undefined) ??
    languageFromHeaders(opts.req.headers) ??
    FALLBACK_LANGUAGE;
  return ctx;
}
