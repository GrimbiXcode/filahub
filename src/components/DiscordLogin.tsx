import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Copy, KeyRound, LogIn } from "lucide-react";
import {
  DISCORD_CODE_PATH,
  DISCORD_START_PATH,
  parseDiscordLoginResult,
} from "@contracts/discord";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";

/**
 * Ergebnis des Rücksprungs von Discord (`/login?discord=<Grund>`), bei
 * „nicht freigegeben“ mit der Discord-ID aus dem Fragment (`#id=…`). Der Grund
 * stammt aus einer festen Liste (`contracts/discord.ts`); Unbekanntes wird
 * ignoriert, statt angezeigt.
 */
function useDiscordReturn() {
  const [value] = useState(() => {
    const reason = parseDiscordLoginResult(
      new URLSearchParams(window.location.search).get("discord")
    );
    if (!reason) return null;
    const id = new URLSearchParams(window.location.hash.slice(1)).get("id");
    return { reason, id: id && /^\d{17,20}$/.test(id) ? id : null };
  });
  return value;
}

/** Meldung nach dem Rücksprung – auch dann, wenn Discord nicht angeboten wird. */
export function DiscordReturnNotice() {
  const t = useT();
  const result = useDiscordReturn();
  if (!result) return null;
  if (result.reason === "cancelled") {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t.login.discordCancelled}
      </p>
    );
  }
  return (
    <div
      className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm"
      role="alert"
    >
      <p className="text-destructive">
        {t.login.discordResults[result.reason]}
      </p>
      {result.reason === "not_allowlisted" && result.id && (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          {t.login.discordYourId} <code className="font-mono">{result.id}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(result.id ?? "");
              toast.success(t.login.discordIdCopied);
            }}
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            {t.login.discordCopyId}
          </Button>
        </p>
      )}
    </div>
  );
}

/**
 * „Mit Discord anmelden“ samt Einmal-Code (siehe `api/discord.ts`).
 *
 * Ein Knopf statt eines Links: Er wechselt zur Server-Route, die zu Discord
 * weiterleitet. Kommt man ohne Seitenwechsel zurück – Discord lief in einem
 * anderen Browser, etwa aus der installierten App auf iOS –, öffnet sich das
 * Codefeld von selbst: Dort zeigt der andere Browser den Code.
 */
export function DiscordLogin() {
  const t = useT();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [starting, setStarting] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!starting) return;
    function onReturn() {
      if (document.visibilityState !== "visible") return;
      setStarting(false);
      setCodeOpen(true);
    }
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("pageshow", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onReturn);
    };
  }, [starting]);

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const resp = await fetch(DISCORD_CODE_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
        credentials: "same-origin",
      });
      const body = (await resp.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      if (!resp.ok) {
        setError(
          typeof body?.message === "string"
            ? body.message
            : t.login.discordResults.failed
        );
        return;
      }
      await utils.invalidate();
      navigate("/");
    } catch {
      setError(t.login.discordResults.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={starting}
        onClick={() => {
          setStarting(true);
          // Voller Seitenwechsel: Der Server setzt das Bindungs-Cookie und
          // leitet zu Discord weiter.
          window.location.assign(DISCORD_START_PATH);
        }}
      >
        <LogIn className="mr-2 h-4 w-4" />
        {starting ? t.login.discordStarting : t.login.discordSignIn}
      </Button>
      <p className="text-xs text-muted-foreground">{t.login.discordNotice}</p>

      {codeOpen ? (
        <form onSubmit={redeem} className="space-y-2">
          <Label htmlFor="discord-code" className="block text-xs">
            {t.login.discordCodeLabel}
          </Label>
          <div className="flex gap-2">
            <Input
              id="discord-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={t.login.codePlaceholder}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={code.length !== 6 || pending}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {pending ? t.login.signingIn : t.login.discordCodeSubmit}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.login.discordCodeHint}
          </p>
        </form>
      ) : (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0 text-xs"
          onClick={() => setCodeOpen(true)}
        >
          {t.login.discordCodeOpen}
        </Button>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
