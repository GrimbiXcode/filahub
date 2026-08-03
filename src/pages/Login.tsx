import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { MessageCircleCode, Send, Wrench } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

export default function Login() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: loginInfo, isLoading } = trpc.auth.loginInfo.useQuery();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginWithWidget = trpc.auth.loginWithWidget.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate("/");
    },
    onError: (e) => setError(e.message),
  });
  const loginWithCode = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate("/");
    },
    onError: (e) => setError(e.message),
  });

  // Offizielles Telegram Login Widget laden
  useEffect(() => {
    if (!loginInfo?.botConfigured || !loginInfo.botUsername || !widgetRef.current)
      return;
    window.onTelegramAuth = (user) => loginWithWidget.mutate(user);
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", loginInfo.botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "true");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    widgetRef.current.innerHTML = "";
    widgetRef.current.appendChild(script);
    return () => {
      window.onTelegramAuth = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginInfo?.botConfigured, loginInfo?.botUsername]);

  const botUsername = loginInfo?.botUsername;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {/* Farbschema schon vor der Anmeldung umstellbar */}
      <div className="fixed right-3 top-3">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Filament-Lager</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center">Laden …</p>
          ) : !loginInfo?.botConfigured ? (
            <p className="text-sm text-destructive text-center">
              Telegram-Login ist noch nicht konfiguriert. Bitte hinterlege
              TELEGRAM_BOT_TOKEN und TELEGRAM_BOT_USERNAME auf dem Server.
            </p>
          ) : (
            <>
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">
                  Melde dich mit deinem Telegram-Konto an. Telegram bestätigt
                  deine Identität – auf Wunsch auch per Telefonnummer.
                </p>
                <div ref={widgetRef} className="flex justify-center min-h-10" />
              </div>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">oder per Code</span>
                <Separator className="flex-1" />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  loginWithCode.mutate({ code: code.trim() });
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="login-code" className="text-xs">
                    Code vom Bot{" "}
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
                    (per <span className="font-mono">/login</span> anfordern)
                  </Label>
                  <Input
                    id="login-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6-stelliger Code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full"
                  disabled={code.length !== 6 || loginWithCode.isPending}
                >
                  <MessageCircleCode className="mr-2 h-4 w-4" />
                  {loginWithCode.isPending ? "Anmelden …" : "Mit Code anmelden"}
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
                <span className="text-xs text-muted-foreground">Entwicklung</span>
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
                Ohne Telegram anmelden
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
