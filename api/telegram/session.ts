import { sign, verify } from "hono/jwt";
import { Session } from "@contracts/constants";
import { env } from "../lib/env";

/*
  Signiert und geprüft wird mit `hono/jwt` (bis 4.8.0 mit `jose`). Das Format
  ist dasselbe – HS256, kompakte Serialisierung –, ausgestellte Sitzungen
  bleiben gültig; `api/session.test.ts` prüft das an einem Token von `jose`.
*/
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
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      ...payload,
      clientId: "telegram",
      iat: now,
      /*
        Aus derselben Konstante wie die Cookie-Laufzeit: Standen beide
        unabhängig im Code, liefe irgendwann das eine ab, während das andere
        noch gilt – und der Fehler zeigt sich erst Wochen später.
      */
      exp: Math.floor((Date.now() + Session.maxAgeMs) / 1000),
    },
    env.appSecret,
    JWT_ALG
  );
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    // Verfahren festnageln: `verify` verlangt es und lehnt jedes andere ab –
    // auch `alg: none` und HS512 mit demselben Secret.
    const payload = await verify(token, env.appSecret, JWT_ALG);
    if (typeof payload.unionId !== "string" || !payload.unionId) return null;
    // `verify` prüft `exp` nur, wenn es da ist. Jede eigene Sitzung trägt es;
    // ein Token ohne Ablauf gälte für immer und kommt nicht von hier.
    if (typeof payload.exp !== "number") return null;
    return {
      unionId: payload.unionId,
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
