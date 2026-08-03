import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
import { ThemeSegmentedControl } from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  type CurrencyCode,
  type LocaleCode,
} from "@contracts/locale";
import {
  currencySymbol,
  formatDate,
  formatGrams,
  formatMoney,
} from "@contracts/format";
import { browserLocale, useFormat } from "@/lib/formatContext";
import { trpc } from "@/lib/trpc";

/** Wert im Auswahlfeld, wenn der Browser über das Format entscheidet */
const AUTO = "__auto__";

/** Beispielwerte für die Vorschau – bewusst mit Tausendertrennzeichen */
const PREVIEW_GRAMS = 1250;
const PREVIEW_CENTS = 129900;
const PREVIEW_DATE = "2026-07-20";

export default function Settings() {
  const utils = trpc.useUtils();
  const { locale, localeSetting, currency } = useFormat();

  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success("Einstellung gespeichert");
    },
    onError: e => toast.error(e.message),
  });

  const browser = browserLocale();

  return (
    <AuthLayout>
      <div className="flex max-w-2xl flex-col gap-4 sm:gap-6">
        <PageHeader
          title="Einstellungen"
          description="Darstellung, Währung und Zahlenformate"
        />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Erscheinungsbild</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ThemeSegmentedControl />
            <p className="text-xs text-muted-foreground">
              „System“ folgt der Einstellung deines Geräts. Das Farbschema wird
              lokal gespeichert und gilt deshalb pro Gerät – am Telefon darf es
              dunkel sein, während der Rechner hell bleibt.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Währung</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="s-currency">Anzeigewährung</Label>
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
                      {c.label} ({currencySymbol(locale, c.code)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Bestehende Preise werden nicht umgerechnet, sondern nur in der
              neuen Währung dargestellt.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Regionalformat</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="s-locale">Zahlen- und Datumsformat</Label>
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
                    Automatisch (Browser: {browser})
                  </SelectItem>
                  {SUPPORTED_LOCALES.map(l => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <dl className="grid gap-1 rounded-lg border p-3 text-sm sm:max-w-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Datum</dt>
                <dd className="font-medium">
                  {formatDate(PREVIEW_DATE, locale)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Gewicht</dt>
                <dd className="font-medium">
                  {formatGrams(PREVIEW_GRAMS, locale)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Preis</dt>
                <dd className="font-medium">
                  {formatMoney(PREVIEW_CENTS, locale, currency)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}
