import * as jose from "jose";
import { Session } from "@contracts/constants";
import { env } from "../lib/env";

const JWT_ALG = "HS256";

export type SessionPayload = {
  /** Telegram-User-ID als String */
  unionId: string;
  /**
   * Stand von `users.tokenVersion` bei Ausstellung. Stimmt er nicht mehr mit
   * der Datenbank überein, gilt die Sitzung als widerrufen.
   */
  tokenVersion: number;
};

export async function signSessionToken(
  payload: SessionPayload
): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return (
    new jose.SignJWT({ ...payload, clientId: "telegram" })
      .setProtectedHeader({ alg: JWT_ALG })
      .setIssuedAt()
      /*
        Aus derselben Konstante wie die Cookie-Laufzeit: Standen beide
        unabhängig im Code, liefe irgendwann das eine ab, während das andere
        noch gilt – und der Fehler zeigt sich erst Wochen später.
      */
      .setExpirationTime(new Date(Date.now() + Session.maxAgeMs))
      .sign(secret)
  );
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      // Verfahren festnageln: Ohne diese Angabe akzeptierte die Prüfung auch
      // `alg: none` oder ein anderes Verfahren als das beim Signieren.
      algorithms: [JWT_ALG],
    });
    if (!payload.unionId) return null;
    return {
      unionId: payload.unionId as string,
      /*
        Ältere Token kennen den Anspruch noch nicht. Sie als Version 0 zu
        lesen ist richtig: Wer seither nichts widerrufen hat, steht ebenfalls
        auf 0 und bleibt angemeldet; wer widerrufen hat, ist auf 1 und wirft
        sie damit hinaus.
      */
      tokenVersion:
        typeof payload.tokenVersion === "number" ? payload.tokenVersion : 0,
    };
  } catch {
    return null;
  }
}
