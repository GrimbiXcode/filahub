import * as cookie from "cookie";
import type { CookieOptions } from "hono/utils/cookie";
import { Session } from "@contracts/constants";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

export function getSessionCookieOptions(headers: Headers): CookieOptions {
  const localhost = isLocalhost(headers);

  return {
    httpOnly: true,
    path: "/",
    /*
      `Lax`, nicht `None`. Das Telegram-Widget ruft `window.onTelegramAuth` im
      selben Dokument auf, der anschließende tRPC-Aufruf ist also same-origin –
      `None` war nie nötig, schickte das Session-Cookie aber bei jeder
      Cross-Site-Anfrage mit. In einer Codebasis ohne CSRF-Token ist das
      geschenkte Angriffsfläche. Eingebettet wird die App ohnehin nicht,
      dagegen steht `frame-ancestors 'none'`.
    */
    sameSite: "Lax",
    secure: !localhost,
  };
}

function serialize(headers: Headers, token: string, maxAgeSeconds: number) {
  const opts = getSessionCookieOptions(headers);
  return cookie.serialize(Session.cookieName, token, {
    httpOnly: opts.httpOnly,
    path: opts.path,
    sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
    secure: opts.secure,
    maxAge: maxAgeSeconds,
  });
}

/** Setzt das Session-Cookie nach erfolgreicher Anmeldung. */
export function sessionCookie(token: string, headers: Headers) {
  return serialize(headers, token, Session.maxAgeMs / 1000);
}

/**
 * Löscht das Session-Cookie.
 *
 * Muss dieselben Attribute tragen wie beim Setzen – sonst betrachtet der
 * Browser es als anderes Cookie und das alte bleibt liegen.
 */
export function clearSessionCookie(headers: Headers) {
  return serialize(headers, "", 0);
}
