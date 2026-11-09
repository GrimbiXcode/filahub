import { useState } from "react";
import { toast } from "sonner";
import { Copy, ShieldAlert } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LOGIN_PATH } from "@/const";
import { useT } from "@/lib/i18nContext";

/**
 * Einmal-Code nach der Anmeldung mit Discord (seit 4.8.0, siehe
 * `api/discord.ts`).
 *
 * Hierher führt der Rücksprung, wenn er in einem anderen Browser ankommt als
 * dem, in dem die Anmeldung begann – typisch für die installierte App auf
 * iOS. Dieser Browser wird bewusst **nicht** angemeldet; der Code gilt nur
 * dort, wo das Bindungs-Cookie des Starts liegt.
 *
 * Der Code steht im Fragment (`#code=…`): Er geht mit keiner Anfrage mit und
 * erscheint in keinem Serverlog. Gelesen wird er einmal beim Laden.
 */
export default function DiscordHandoff() {
  const t = useT();
  const [code] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      "code"
    );
    return value && /^\d{6}$/.test(value) ? value : null;
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="fixed right-3 top-3">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle>
            <Wordmark className="justify-center text-lg [&_svg]:h-6 [&_svg]:w-6" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <h1 className="text-center text-base font-medium">
            {t.discordHandoff.title}
          </h1>
          {code ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t.discordHandoff.intro}
              </p>
              <p
                className="text-center font-mono text-3xl tracking-[0.3em]"
                aria-live="polite"
              >
                {code}
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await navigator.clipboard.writeText(code);
                  toast.success(t.discordHandoff.copied);
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t.discordHandoff.copy}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t.discordHandoff.where}
              </p>
              <p className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-xs text-destructive">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {t.discordHandoff.warning}
              </p>
            </>
          ) : (
            <p className="text-sm text-destructive">
              {t.discordHandoff.missing}
            </p>
          )}
          <Button asChild variant="secondary" className="w-full">
            <a href={LOGIN_PATH}>{t.discordHandoff.toLogin}</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
