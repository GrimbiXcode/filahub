import { useEffect, useMemo, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18nContext";
import {
  detectInstallPlatform,
  isStandalone,
  type BeforeInstallPromptEvent,
  type InstallPlatform,
} from "@/lib/install";

/** Anleitungstext je Browser – siehe `src/lib/install.ts` zum Warum. */
const HOW_TO = {
  ios: "installHowIos",
  android: "installHowAndroid",
  "chromium-desktop": "installHowChromium",
  "safari-desktop": "installHowSafari",
  firefox: "installHowFirefox",
  unknown: "installHowUnknown",
} as const satisfies Record<InstallPlatform, string>;

/**
 * Legt filahub als App auf Home-Bildschirm oder Dock.
 *
 * Wo der Browser einen eigenen Installationsdialog anbietet, wird der
 * genommen; sonst erklärt ein Dialog den Weg von Hand. Beides hinter
 * demselben Knopf, damit die Karte nicht je nach Gerät anders aussieht.
 */
export function InstallAppCard() {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);
  const [nativePrompt, setNativePrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const platform = useMemo(() => detectInstallPlatform(), []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // Ohne `preventDefault` zeigt Chromium selbst ein Banner; wir wollen
      // den Dialog erst beim Druck auf den Knopf.
      event.preventDefault();
      setNativePrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setNativePrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleClick = async () => {
    if (!nativePrompt) {
      setDialogOpen(true);
      return;
    }
    await nativePrompt.prompt();
    const { outcome } = await nativePrompt.userChoice;
    // Das Ereignis lässt sich nur einmal verwenden. Nach einem Abbruch führt
    // der Knopf deshalb ab jetzt zur Anleitung.
    setNativePrompt(null);
    if (outcome === "accepted") setInstalled(true);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t.settings.install}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {installed ? (
          <p className="text-sm">{t.settings.installAlready}</p>
        ) : (
          <Button
            variant="outline"
            className="sm:w-fit"
            onClick={handleClick}
            aria-haspopup={nativePrompt ? undefined : "dialog"}
          >
            <Smartphone />
            {t.settings.installButton}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {t.settings.installHint}
        </p>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            {/* Platz für den Schließen-Knopf, sonst läuft der Titel am
                Telefon in das X hinein. */}
            <DialogTitle className="pr-8">
              {t.settings.installButton}
            </DialogTitle>
            <DialogDescription>
              {t.settings.installDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">{t.settings[HOW_TO[platform]]}</p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
