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
  /*
    Widerruf: Das Token nennt den Stand, unter dem es ausgestellt wurde. Liegt
    der Zähler in der Datenbank höher, wurde die Sitzung seither entwertet –
    etwa über „auf allen Geräten abmelden“. Kostet keine zusätzliche Abfrage,
    die Zeile ist oben ohnehin geladen worden.
  */
  if (claim.tokenVersion !== user.tokenVersion) {
    throw Errors.forbidden("Sitzung wurde beendet. Bitte neu anmelden.");
  }
  return user;
}
