import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Download, LogOut, Trash2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { InstallAppCard } from "@/components/InstallAppCard";
import { PageHeader } from "@/components/PageHeader";
import { ThemeSegmentedControl } from "@/components/ThemeToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@contracts/i18n";
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  currencyLabel,
  localeLabel,
  type CurrencyCode,
  type LocaleCode,
} from "@contracts/locale";
import {
  currencySymbol,
  formatDate,
  formatGrams,
  formatMoney,
} from "@contracts/format";
import { deletionConfirmationMatches } from "@contracts/account";
import { LOGIN_PATH } from "@/const";
import { useAuth } from "@/hooks/useAuth";
import { browserLocale, useFormat } from "@/lib/formatContext";
import { browserLanguage, useI18n } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";

/** Wert im Auswahlfeld, wenn der Browser über das Format entscheidet */
const AUTO = "__auto__";

/** Beispielwerte für die Vorschau – bewusst mit Tausendertrennzeichen */
const PREVIEW_GRAMS = 1250;
const PREVIEW_CENTS = 129900;
const PREVIEW_DATE = "2026-07-20";

export default function Settings() {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const { locale, localeSetting, currency } = useFormat();
  const { t, language, languageSetting } = useI18n();
  const { user } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success(t.settings.saved);
    },
    onError: e => toast.error(e.message),
  });

  const exportData = trpc.account.export.useMutation({
    onSuccess: data => {
      /*
        Der Abzug geht direkt in eine Datei und nicht durch den Query-Cache –
        siehe die Begründung an `account.export` im Server. Das Objekt-URL wird
        sofort wieder freigegeben, sonst hinge der Blob bis zum Seitenwechsel
        im Speicher.
      */
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `filahub-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t.settings.exportDone);
    },
    onError: e => toast.error(e.message),
  });

  const logoutAll = trpc.auth.logoutAllDevices.useMutation({
    onSuccess: async () => {
      // Die eigene Sitzung ist mit entwertet – der Weg führt zurück zur Anmeldung.
      await utils.invalidate();
      navigate(LOGIN_PATH);
    },
    onError: e => toast.error(e.message),
  });

  const deleteAccount = trpc.account.delete.useMutation({
    onSuccess: async () => {
      setDeleteOpen(false);
      // Der Server hat das Cookie schon gelöscht; hier nur noch der Client.
      await utils.invalidate();
      navigate(LOGIN_PATH);
    },
    onError: e => toast.error(e.message),
  });

  const confirmationValid = deletionConfirmationMatches(
    confirmation,
    user?.name ?? null
  );

  const browser = browserLocale();
  const browserLang = browserLanguage();

  return (
    <AuthLayout>
      <div className="flex max-w-2xl flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.settings.title}
          description={t.settings.description}
        />

        {/* Sprache steht bewusst zuoberst: Wer die Oberfläche nicht lesen
            kann, sucht genau hier – und die Autonyme („Deutsch“, „English“)
            sind auch dann verständlich. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.settings.language}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="s-language">{t.settings.languageLabel}</Label>
              <Select
                value={languageSetting ?? AUTO}
                disabled={updateSettings.isPending}
                onValueChange={value =>
                  updateSettings.mutate({
                    language: value === AUTO ? null : (value as LanguageCode),
                  })
                }
              >
                <SelectTrigger id="s-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>
                    {t.settings.automatic({ value: browserLang })}
                  </SelectItem>
                  {SUPPORTED_LANGUAGES.map(l => (
                    <SelectItem key={l.code} value={l.code}>
                      {localeLabel(l.code, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.settings.languageHint}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.settings.appearance}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ThemeSegmentedControl />
            <p className="text-xs text-muted-foreground">
              {t.settings.appearanceHint}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.settings.currency}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="s-currency">{t.settings.currencyLabel}</Label>
              <Select
                value={currency}
                disabled={updateSettings.isPending}
                onValueChange={value =>
                  updateSettings.mutate({ currency: value as CurrencyCode })
                }
              >
                <SelectTrigger id="s-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>
                      {currencyLabel(c.code, language)} (
                      {currencySymbol(locale, c.code)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.settings.currencyHint}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t.settings.regionalFormat}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="s-locale">{t.settings.regionalFormatLabel}</Label>
              <Select
                value={localeSetting ?? AUTO}
                disabled={updateSettings.isPending}
                onValueChange={value =>
                  updateSettings.mutate({
                    locale: value === AUTO ? null : (value as LocaleCode),
                  })
                }
              >
                <SelectTrigger id="s-locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>
                    {t.settings.automatic({ value: browser })}
                  </SelectItem>
                  {SUPPORTED_LOCALES.map(l => (
                    <SelectItem key={l.code} value={l.code}>
                      {localeLabel(l.code, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <dl className="grid gap-1 rounded-lg border p-3 text-sm sm:max-w-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t.common.date}</dt>
                <dd className="font-medium">
                  {formatDate(PREVIEW_DATE, locale)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t.common.weight}</dt>
                <dd className="font-medium">
                  {formatGrams(PREVIEW_GRAMS, locale)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t.common.price}</dt>
                <dd className="font-medium">
                  {formatMoney(PREVIEW_CENTS, locale, currency)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Steht weit unten: eine einmalige Handlung, die niemand sucht,
            während er Formate einstellt. */}
        <InstallAppCard />

        {/* Betroffenenrechte: Auskunft, Datenübertragbarkeit, Löschung.
            Bewusst ganz zuunterst – gebraucht wird das selten, gefunden
            werden muss es trotzdem, und eine Kontolöschung will man nicht
            versehentlich streifen. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t.settings.dataAndAccount}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {t.settings.exportHint}
              </p>
              <Button
                variant="outline"
                className="sm:self-start"
                disabled={exportData.isPending}
                onClick={() => exportData.mutate()}
              >
                <Download className="mr-2 h-4 w-4" />
                {exportData.isPending
                  ? t.settings.exportPending
                  : t.settings.exportAction}
              </Button>
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {t.settings.logoutAllHint}
              </p>
              <Button
                variant="outline"
                className="sm:self-start"
                disabled={logoutAll.isPending}
                onClick={() => logoutAll.mutate()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t.settings.logoutAllAction}
              </Button>
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {t.settings.deleteHint}
              </p>
              <Button
                variant="outline"
                className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive sm:self-start"
                onClick={() => {
                  setConfirmation("");
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t.settings.deleteAction}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.settings.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.settings.deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="delete-confirm" className="text-xs">
              {t.settings.deleteConfirmLabel({ name: user?.name ?? "" })}
            </Label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmationValid || deleteAccount.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={e => {
                // Der Dialog schließt sonst, bevor die Mutation durch ist.
                e.preventDefault();
                deleteAccount.mutate({ confirmation });
              }}
            >
              {deleteAccount.isPending
                ? t.settings.deletePending
                : t.settings.deleteConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthLayout>
  );
}
