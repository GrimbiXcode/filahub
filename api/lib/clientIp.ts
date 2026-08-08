import { env } from "./env";

/**
 * Ermittelt die Adresse des Aufrufers aus den Weiterleitungs-Kopfzeilen.
 *
 * Die App läuft hinter einem Reverse Proxy (siehe README), die Verbindung
 * kommt also immer von `127.0.0.1`. Verwertbar ist nur `x-forwarded-for` –
 * und das ist heikel: Der Client darf die Kopfzeile selbst setzen, der Proxy
 * hängt seinen Wert **hinten** an. Der erste Eintrag ist damit
 * angreiferkontrolliert, der letzte stammt vom eigenen Proxy.
 *
 * Deshalb wird von hinten gezählt: Bei einem vertrauenswürdigen Proxy
 * (`TRUST_PROXY_HOPS=1`) ist der letzte Eintrag die echte Adresse. Wer zwei
 * Proxys davor hat – etwa Cloudflare vor Caddy – stellt auf 2.
 *
 * Ohne diese Vorsicht wäre jede Sperre wirkungslos: Ein Angreifer setzte
 * einfach bei jedem Versuch eine andere Adresse an den Anfang.
 */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map(part => part.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      const index = Math.max(0, hops.length - env.trustProxyHops);
      return hops[index] ?? hops[hops.length - 1] ?? null;
    }
  }

  // Einige Proxys setzen stattdessen diese Kopfzeile; sie trägt genau einen Wert.
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}
