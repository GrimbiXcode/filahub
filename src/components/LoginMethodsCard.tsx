import { useEffect } from "react";
import { toast } from "sonner";
import { Link2, Unlink } from "lucide-react";
import { parseDiscordLinkResult } from "@contracts/discord";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";

/** Ergebnisse, die als Erfolg gemeldet werden; alles andere als Hinweis. */
const LINK_SUCCESS = new Set(["linked", "already_linked"]);

/**
 * Anmeldewege des Kontos (seit 4.8.0): Telegram und Discord.
 *
 * Discord verbinden geht nur in dem Browser bzw. der App, in der man
 * angemeldet ist – der Server prüft beim Rücksprung, dass dort genau dieses
 * Konto angemeldet ist (`api/discord.ts`). Das Ergebnis kommt als
 * `?discord=<Ergebnis>` zurück und wird hier einmal gemeldet.
 */
export function LoginMethodsCard() {
  const t = useT();
  const utils = trpc.useUtils();
  const { data } = trpc.auth.loginMethods.useQuery();

  const linkStart = trpc.auth.discordLinkStart.useMutation({
    onSuccess: ({ url }) => window.location.assign(url),
    onError: e => toast.error(e.message),
  });
  const unlink = trpc.auth.discordUnlink.useMutation({
    onSuccess: async () => {
      await utils.auth.loginMethods.invalidate();
      toast.success(t.settings.discordDisconnected);
    },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = parseDiscordLinkResult(params.get("discord"));
    if (!result) return;
    const message = t.settings.discordLinkResults[result];
    if (LINK_SUCCESS.has(result)) toast.success(message);
    else toast.error(message);
    // Nur einmal melden – auch nach einem Neuladen der Seite nicht wieder.
    params.delete("discord");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return null;
  // Ohne Discord auf dieser Instanz und ohne verbundenes Konto gibt es nichts
  // zu wählen – dann bleibt die Karte weg, wie vor 4.8.0.
  if (!data.discordAvailable && !data.discord) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t.settings.loginMethods}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          {t.settings.loginMethodsHint}
        </p>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {t.settings.telegramMethod}
            </span>
            <span className="text-sm text-muted-foreground">
              {data.telegram
                ? data.telegramUsername
                  ? t.settings.methodConnectedAs({
                      name: `@${data.telegramUsername}`,
                    })
                  : t.settings.methodConnected
                : t.settings.methodNotConnected}
            </span>
          </div>
          {!data.telegram && (
            <p className="text-xs text-muted-foreground">
              {t.settings.telegramOnlyAtLogin}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {t.settings.discordMethod}
            </span>
            {data.discord ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {data.discord.username
                    ? t.settings.methodConnectedAs({
                        name: data.discord.username,
                      })
                    : t.settings.methodConnected}
                </span>
                {data.canUnlinkDiscord && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unlink.isPending}
                    onClick={() => unlink.mutate()}
                  >
                    <Unlink className="mr-2 h-4 w-4" />
                    {t.settings.discordDisconnect}
                  </Button>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={linkStart.isPending || linkStart.isSuccess}
                onClick={() => linkStart.mutate()}
              >
                <Link2 className="mr-2 h-4 w-4" />
                {linkStart.isPending || linkStart.isSuccess
                  ? t.settings.discordConnecting
                  : t.settings.discordConnect}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {data.discord
              ? data.canUnlinkDiscord
                ? null
                : t.settings.discordDisconnectOnlyWay
              : t.settings.discordConnectHint}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
