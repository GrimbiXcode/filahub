import * as jose from "jose";
import { env } from "../lib/env";

const JWT_ALG = "HS256";

export type SessionPayload = {
  /** Telegram-User-ID als String */
  unionId: string;
};

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT({ ...payload, clientId: "telegram" })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("1 year")
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (!payload.unionId) return null;
    return { unionId: payload.unionId as string };
  } catch {
    return null;
  }
}
