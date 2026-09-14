import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { MessageCircleCode, Send, ShieldQuestion, Wrench } from "lucide-react";
import {
  TELEGRAM_LOGIN_FRAME_MESSAGE,
  TELEGRAM_LOGIN_FRAME_PATH,
} from "@contracts/constants";
import {
  LEGAL_DOCUMENTS,
  LEGAL_PATHS,
  TELEGRAM_WIDGET_CONSENT_KEY,
} from "@/const";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/lib/i18nContext";
import { useAppTheme } from "@/lib/theme";
import { trpc } from "@/lib/trpc";

type TelegramWidgetUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

/**
 * Nachrichten des Rahmendokuments (`public/telegram-login.js`): entweder die
 * Anmeldedaten oder das Maß, das der Telegram-Knopf braucht.
 */
type WidgetFrameMessage =
  | { kind: "auth"; user: TelegramWidgetUser }
  | { kind: "size"; width: number; height: number };

/**
 * Liest eine `message`-Nutzlast, sofern sie vom eigenen Rahmen stammt und die
 * erwartete Form hat – sonst `null`.
 *
 * Bewusst geprüft statt `event.data` geglaubt: In dem Ereignis landet alles,
 * was irgendein Fenster hierher schickt. Die Anmeldedaten selbst prüft
 * ohnehin der Server (`verifyTelegramWidgetData`); hier geht es darum, dass
 * gar nicht erst Unsinn dorthin unterwegs ist.
 */
function widgetFrameMessage(data: unknown): WidgetFrameMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.source !== TELEGRAM_LOGIN_FRAME_MESSAGE) return null;
  if (
    message.kind === "size" &&
    typeof message.width === "number" &&
    typeof message.height === "number"
  ) {
    return { kind: "size", width: message.width, height: message.height };
  }
  if (message.kind === "auth" && typeof message.user === "object") {
    return { kind: "auth", user: message.user as TelegramWidgetUser };
  }
  return null;
}

/**
 * Maß des Rahmens, bis das Widget geladen ist und sein echtes meldet. Der
 * große Telegram-Knopf ist 40 Pixel hoch; so springt beim Laden nichts. Die
 * Breite ist nur ein Platzhalter: Der Rahmen ist unsichtbar, bis der Knopf
 * darin steht, und hat dann dessen Maß.
 */
const WIDGET_FRAME_INITIAL_SIZE = { width: 240, height: 40 };

export default function Login() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: loginInfo, isLoading } = trpc.auth.loginInfo.useQuery();
  const widgetFrameRef = useRef<HTMLIFrameElement>(null);
  const [widgetFrameSize, setWidgetFrameSize] = useState(
    WIDGET_FRAME_INITIAL_SIZE
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const { resolvedTheme } = useAppTheme();
  // Einmal getroffen, bleibt die Entscheidung bestehen – sonst müsste man sie
  // bei jedem Anmeldeversuch neu treffen.
  const [widgetConsent, setWidgetConsent] = useState(
    () => localStorage.getItem(TELEGRAM_WIDGET_CONSENT_KEY) === "1"
  );

  const loginWithWidget = trpc.auth.loginWithWidget.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate("/");
    },
    onError: e => setError(e.message),
  });
  const loginWithCode = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate("/");
    },
    onError: e => setError(e.message),
  });

  const botUsername = loginInfo?.botUsername;

  /*
    Das offizielle Telegram Login Widget läuft in einem eigenen Dokument
    (`public/telegram-login.html`) statt hier: Das Skript von telegram.org
    braucht `eval`, und diese Seite bekommt es nicht – siehe api/app.ts. Der
    Rahmen schickt die signierten Anmeldedaten per `postMessage` zurück.

    Geladen wird er erst nach ausdrücklicher Einwilligung. Allein der Abruf
    teilt Telegram IP-Adresse und Gerätedaten mit, unabhängig davon, ob am Ende
    eine Anmeldung zustande kommt. Die Anmeldung per Bot-Code kommt ohne jedes
    Telegram-Asset aus und bleibt deshalb der einwilligungsfreie Standardweg.

    Der Rahmen bekommt das Farbschema der Seite als URL-Parameter mit: Ein
    iframe ist nur durchsichtig, wenn sein Schema zu dem des einbettenden
    Dokuments passt – sonst malt der Browser es deckend, und im dunklen Schema
    standen weiße Flächen neben dem Knopf. Bei einem Wechsel lädt der Rahmen
    neu; das ist selten und billiger als ein Nachrichtenkanal hinein. Zurück
    meldet er neben den Anmeldedaten das Maß des Knopfes, auf das der Rahmen
    zugeschnitten wird: So ragt nichts über den Knopf hinaus.
  */
  useEffect(() => {
    if (!widgetConsent) return;

    function onMessage(event: MessageEvent) {
      // Herkunft und Absenderfenster zuerst, Inhalt danach.
      if (event.origin !== window.location.origin) return;
      if (event.source !== widgetFrameRef.current?.contentWindow) return;
      const message = widgetFrameMessage(event.data);
      if (!message) return;

      if (message.kind === "size") {
        // 0 × 0 heißt: Das Widget hat seinen Knopf noch nicht eingesetzt.
        if (message.width > 0 && message.height > 0) {
          setWidgetFrameSize({
            width: Math.ceil(message.width),
            height: Math.ceil(message.height),
          });
        }
      } else {
        loginWithWidget.mutate(message.user);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetConsent]);

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 pb-16">
      {/* Farbschema schon vor der Anmeldung umstellbar */}
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
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center">
              {t.common.loading}
            </p>
          ) : !loginInfo?.botConfigured ? (
            <p className="text-sm text-destructive text-center">
              {t.login.notConfigured}
            </p>
          ) : (
            <>
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">{t.login.intro}</p>
                {!widgetConsent ? (
                  <div className="space-y-2 rounded-md border border-dashed p-3 text-left">
                    <p className="text-xs text-muted-foreground">
                      {t.login.widgetNotice}
                    </p>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        localStorage.setItem(TELEGRAM_WIDGET_CONSENT_KEY, "1");
                        setWidgetConsent(true);
                      }}
                    >
                      <ShieldQuestion className="mr-2 h-4 w-4" />
                      {t.login.widgetLoad}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t.login.widgetAlternative}
                    </p>
                  </div>
                ) : botUsername ? (
                  <iframe
                    ref={widgetFrameRef}
                    title={t.login.widgetTitle}
                    src={`${TELEGRAM_LOGIN_FRAME_PATH}?bot=${encodeURIComponent(botUsername)}&theme=${resolvedTheme}`}
                    className="mx-auto block max-w-full border-0"
                    style={widgetFrameSize}
                  />
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {t.login.orWithCode}
                </span>
                <Separator className="flex-1" />
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  setError(null);
                  loginWithCode.mutate({ code: code.trim() });
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  {/* `block` statt des `flex` der Basiskomponente: Sonst
                      werden Text und Link zu einzelnen Kacheln, die getrennt
                      umbrechen. */}
                  <Label
                    htmlFor="login-code"
                    className="block text-xs leading-snug"
                  >
                    {t.login.codeFromBot}{" "}
                    {botUsername && (
                      <a
                        className="font-medium underline"
                        href={`https://t.me/${botUsername}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        @{botUsername}
                      </a>
                    )}{" "}
                    {t.login.codeRequestHint({ command: "/login" })}
                  </Label>
                  <Input
                    id="login-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder={t.login.codePlaceholder}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full"
                  disabled={code.length !== 6 || loginWithCode.isPending}
                >
                  <MessageCircleCode className="mr-2 h-4 w-4" />
                  {loginWithCode.isPending
                    ? t.login.signingIn
                    : t.login.signInWithCode}
                </Button>
              </form>

              {error && (
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <Send className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
              )}
            </>
          )}

          {/*
            Nur lokal mit DEV_LOGIN=1 – bewusst außerhalb des
            botConfigured-Zweigs, sonst wäre er ohne Bot-Token unerreichbar.
          */}
          {loginInfo?.devLoginAvailable && (
            <>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {t.login.development}
                </span>
                <Separator className="flex-1" />
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  // Voller Seitenwechsel: Der Server setzt das Cookie und
                  // leitet weiter, der Client startet danach sauber neu.
                  window.location.href = "/api/dev-login";
                }}
              >
                <Wrench className="mr-2 h-4 w-4" />
                {t.login.signInWithoutTelegram}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Vor der Anmeldung erreichbar: Die Informationspflicht nach Art. 13
          DSGVO greift, bevor jemand ein Konto anlegt. */}
      <nav className="absolute bottom-4 flex flex-wrap justify-center gap-x-4 gap-y-1 px-4 text-xs text-muted-foreground">
        {LEGAL_DOCUMENTS.map(entry => (
          <a
            key={entry}
            href={LEGAL_PATHS[entry]}
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            {t.legal[entry]}
          </a>
        ))}
      </nav>
    </div>
  );
}
