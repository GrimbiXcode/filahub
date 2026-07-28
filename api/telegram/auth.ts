import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { Errors } from "@contracts/errors";
import { findUserByUnionId } from "../queries/users";
import { verifySessionToken } from "./session";

/** Ermittelt den eingeloggten Benutzer aus dem Session-Cookie. */
export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) {
    throw Errors.forbidden("Nicht angemeldet.");
  }
  const claim = await verifySessionToken(token);
  if (!claim) {
    throw Errors.forbidden("Ungültige Sitzung. Bitte neu anmelden.");
  }
  const user = await findUserByUnionId(claim.unionId);
  if (!user) {
    throw Errors.forbidden("Benutzer nicht gefunden. Bitte neu anmelden.");
  }
  return user;
}
