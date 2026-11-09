import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import {
  API_TOKEN_DISPLAY_LENGTH,
  API_TOKEN_PATTERN,
  API_TOKEN_PREFIX,
} from "@contracts/printImports";
import { env } from "./env";

/**
 * API-Schlüssel und die verschlüsselten Zugangsdaten der Brücke (seit 4.7.0).
 *
 * **Schlüssel:** `fh_` + 32 Byte Zufall. Gespeichert wird nur der SHA-256.
 * Kein Salz, kein langsames Verfahren: Bei 256 Bit Zufall gibt es nichts
 * durchzuprobieren – anders als bei einem Passwort, das ein Mensch wählt.
 */

export function generateApiToken(): {
  token: string;
  hash: string;
  prefix: string;
} {
  const token = API_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashApiToken(token),
    prefix: token.slice(0, API_TOKEN_DISPLAY_LENGTH),
  };
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Der Schlüssel aus `Authorization: Bearer …` – oder `null`, wenn die Form nicht stimmt */
export function bearerToken(header: string | undefined | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  const token = match?.[1] ?? null;
  return token && API_TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * **Zugangsdaten für PrusaLink** (API-Schlüssel oder Passwort) liegen
 * verschlüsselt in `bridge_printers.secretCiphertext`: AES-256-GCM, Schlüssel
 * per HKDF aus `APP_SECRET` abgeleitet. Ein Abzug der Datenbank allein gibt
 * sie nicht preis.
 *
 * Wer `APP_SECRET` rotiert, macht sie unlesbar – die Brücke meldet dann
 * „Zugang abgelehnt“, und der Benutzer trägt sie neu ein (README).
 *
 * Form: `v1.<iv>.<tag>.<ciphertext>`, alles base64url.
 */
function secretKey(): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      env.appSecret,
      Buffer.alloc(0),
      "filahub bridge printer secret v1",
      32
    )
  );
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}

/** Entschlüsselt; `null`, wenn es nicht geht (anderes `APP_SECRET`, kaputt) */
export function openSecret(sealed: string | null): string | null {
  if (!sealed) return null;
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secretKey(),
      Buffer.from(iv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
