import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { importPayloadSchema } from "@contracts/import";
import { buildImportPrompt } from "@/lib/importPrompt";
import { useFormat } from "@/lib/formatContext";
import { useI18n } from "@/lib/i18nContext";
import type { Messages } from "@/messages/de";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

/** Editierbare Tabellenzeile: alle Werte als Text, Validierung live. */
type ImportZeile = {
  hersteller: string;
  typ: string;
  farbe: string;
  nenngewicht: string;
  preis: string;
  anzahl: string;
};

/** Entfernt Markdown-Codefences (```json … ```), die LLMs oft mitschicken. */
function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

/** Liefert die Validierungsfehler einer Zeile (leer = gültig). */
function zeilenFehler(
  zeile: ImportZeile,
  parseMoney: (value: string) => number | null,
  t: Messages
): string[] {
  const fehler: string[] = [];
  if (!zeile.typ.trim()) fehler.push(t.import.errTypeMissing);
  const gewicht = Number(zeile.nenngewicht);
  if (!Number.isInteger(gewicht) || gewicht <= 0)
    fehler.push(t.import.errNominal);
  const anzahl = Number(zeile.anzahl);
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 50)
    fehler.push(t.import.errCount);
  if (zeile.preis.trim() && parseMoney(zeile.preis) === null)
    fehler.push(t.import.errPrice);
  return fehler;
}

const DATUM_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default function Import() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { centsToInput, currency, currencySymbol, parseMoney } = useFormat();
  const { t, language } = useI18n();
  const dateiInputRef = useRef<HTMLInputElement>(null);
  const importPrompt = buildImportPrompt(currency, language);

  const [jsonText, setJsonText] = useState("");
  const [pruefFehler, setPruefFehler] = useState<string | null>(null);
  const [zeilen, setZeilen] = useState<ImportZeile[] | null>(null);
  const [kaufdatum, setKaufdatum] = useState("");
  const [promptSichtbar, setPromptSichtbar] = useState(false);

  const importMutation = trpc.material.importMany.useMutation({
    onSuccess: async data => {
      toast.success(`${data.created} Materialien importiert`);
      await utils.material.list.invalidate();
      navigate("/");
    },
    onError: e => toast.error(e.message),
  });

  const promptKopieren = async () => {
    try {
      await navigator.clipboard.writeText(importPrompt);
      toast.success(t.import.promptCopied);
    } catch {
      toast.error(t.import.copyFailed);
    }
  };

  const dateiLesen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setJsonText(await datei.text());
    setPruefFehler(null);
    // Gleiche Datei erneut wählbar machen
    e.target.value = "";
  };

  const pruefen = () => {
    setPruefFehler(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(jsonText));
    } catch {
      setPruefFehler(t.import.invalidJson);
      return;
    }
    const ergebnis = importPayloadSchema.safeParse(parsed);
    if (!ergebnis.success) {
      setPruefFehler(
        ergebnis.error.issues
          .map(
            issue => `${issue.path.join(".") || "Payload"}: ${issue.message}`
          )
          .join("\n")
      );
      return;
    }
    setKaufdatum(ergebnis.data.bestelldatum ?? "");
    setZeilen(
      ergebnis.data.positionen.map(p => ({
        hersteller: p.hersteller ?? "",
        typ: p.typ,
        farbe: p.farbe ?? "",
        nenngewicht: String(p.nenngewicht),
        preis: p.preis != null ? centsToInput(Math.round(p.preis * 100)) : "",
        anzahl: String(p.anzahl),
      }))
    );
  };

  const zeileAendern = (
    index: number,
    feld: keyof ImportZeile,
    wert: string
  ) => {
    setZeilen(
      prev =>
        prev?.map((z, i) => (i === index ? { ...z, [feld]: wert } : z)) ?? null
    );
  };

  const zeileLoeschen = (index: number) => {
    setZeilen(prev => prev?.filter((_, i) => i !== index) ?? null);
  };

  const fehlerProZeile = (zeilen ?? []).map(z =>
    zeilenFehler(z, parseMoney, t)
  );
  const hatFehler = fehlerProZeile.some(f => f.length > 0);
  const kaufdatumUngueltig = kaufdatum !== "" && !DATUM_REGEX.test(kaufdatum);
  const gesamtAnzahl = (zeilen ?? []).reduce((summe, z) => {
    const n = Number(z.anzahl);
    return summe + (Number.isInteger(n) && n > 0 ? n : 0);
  }, 0);
  const importierbar =
    zeilen != null &&
    zeilen.length > 0 &&
    !hatFehler &&
    !kaufdatumUngueltig &&
    !importMutation.isPending;

  const importieren = () => {
    if (!zeilen) return;
    importMutation.mutate({
      purchaseDate: kaufdatum || undefined,
      items: zeilen.map(z => ({
        typ: z.typ.trim(),
        hersteller: z.hersteller.trim() || undefined,
        farbe: z.farbe.trim() || undefined,
        nenngewicht: Number(z.nenngewicht),
        priceCents: parseMoney(z.preis) ?? undefined,
        anzahl: Number(z.anzahl),
      })),
    });
  };

  return (
    <AuthLayout>
      <div className="flex max-w-5xl flex-col gap-4 sm:gap-6">
        <PageHeader title={t.import.title} description={t.import.description} />

        {/* Schritt 1: Prompt kopieren */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.import.step1}</CardTitle>
            <CardDescription>{t.import.step1Description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={promptKopieren}>
                <ClipboardCopy className="mr-2 h-4 w-4" />
                {t.import.copyPrompt}
              </Button>
              {/* Der Prompt ist lang – auf dem Telefon bleibt er eingeklappt,
                  bis ihn jemand wirklich lesen will. */}
              <Button
                variant="outline"
                onClick={() => setPromptSichtbar(v => !v)}
                aria-expanded={promptSichtbar}
              >
                {promptSichtbar ? (
                  <ChevronUp className="mr-2 h-4 w-4" />
                ) : (
                  <ChevronDown className="mr-2 h-4 w-4" />
                )}
                {promptSichtbar ? t.import.hidePrompt : t.import.showPrompt}
              </Button>
            </div>
            {promptSichtbar && (
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs sm:text-sm">
                {importPrompt}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* Schritt 2: JSON einfügen oder hochladen */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.import.step2}</CardTitle>
            <CardDescription>{t.import.step2Description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              value={jsonText}
              onChange={e => {
                setJsonText(e.target.value);
                setPruefFehler(null);
              }}
              placeholder='{ "bestelldatum": "2026-07-20", "positionen": [ … ] }'
              className="min-h-40 font-mono text-sm"
              spellCheck={false}
            />
            {pruefFehler && (
              <p className="whitespace-pre-wrap text-sm text-destructive">
                {pruefFehler}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={pruefen} disabled={!jsonText.trim()}>
                {t.import.check}
              </Button>
              <Button
                variant="outline"
                onClick={() => dateiInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {t.import.uploadFile}
              </Button>
              <input
                ref={dateiInputRef}
                type="file"
                accept=".json,.txt"
                className="hidden"
                onChange={dateiLesen}
              />
            </div>
          </CardContent>
        </Card>

        {/* Schritt 3: Übersicht bearbeiten und importieren */}
        {zeilen != null && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t.import.step3}</CardTitle>
              <CardDescription>{t.import.step3Description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex max-w-56 flex-col gap-1.5">
                <Label htmlFor="kaufdatum">{t.import.purchaseDateLabel}</Label>
                <Input
                  id="kaufdatum"
                  type="date"
                  value={kaufdatum}
                  onChange={e => setKaufdatum(e.target.value)}
                  className={cn(kaufdatumUngueltig && "border-destructive")}
                />
                {kaufdatumUngueltig && (
                  <p className="text-sm text-destructive">
                    Datum im Format JJJJ-MM-TT
                  </p>
                )}
              </div>

              {zeilen.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t.import.noPositions}
                </p>
              ) : (
                <>
                  {/* Telefon: je Position eine Karte mit beschrifteten Feldern –
                      eine sechsspaltige Eingabetabelle ist dort unbedienbar. */}
                  <div className="flex flex-col gap-3 lg:hidden">
                    {zeilen.map((zeile, index) => {
                      const fehler = fehlerProZeile[index];
                      return (
                        <div
                          key={index}
                          className={cn(
                            "rounded-xl border p-3",
                            fehler.length > 0 &&
                              "border-destructive/50 bg-destructive/5"
                          )}
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {t.import.position({ index: index + 1 })}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => zeileLoeschen(index)}
                              aria-label={t.import.deletePosition({
                                index: index + 1,
                              })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 grid gap-1.5">
                              <Label
                                htmlFor={`p-typ-${index}`}
                                className="text-xs"
                              >
                                {t.import.typeLabel}
                              </Label>
                              <Input
                                id={`p-typ-${index}`}
                                value={zeile.typ}
                                onChange={e =>
                                  zeileAendern(index, "typ", e.target.value)
                                }
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label
                                htmlFor={`p-hersteller-${index}`}
                                className="text-xs"
                              >
                                {t.common.manufacturer}
                              </Label>
                              <Input
                                id={`p-hersteller-${index}`}
                                value={zeile.hersteller}
                                onChange={e =>
                                  zeileAendern(
                                    index,
                                    "hersteller",
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label
                                htmlFor={`p-farbe-${index}`}
                                className="text-xs"
                              >
                                {t.common.color}
                              </Label>
                              <Input
                                id={`p-farbe-${index}`}
                                value={zeile.farbe}
                                onChange={e =>
                                  zeileAendern(index, "farbe", e.target.value)
                                }
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label
                                htmlFor={`p-gewicht-${index}`}
                                className="text-xs"
                              >
                                {t.import.nominalLabel}
                              </Label>
                              <Input
                                id={`p-gewicht-${index}`}
                                value={zeile.nenngewicht}
                                inputMode="numeric"
                                onChange={e =>
                                  zeileAendern(
                                    index,
                                    "nenngewicht",
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label
                                htmlFor={`p-preis-${index}`}
                                className="text-xs"
                              >
                                {t.import.priceLabel({
                                  symbol: currencySymbol,
                                })}
                              </Label>
                              <Input
                                id={`p-preis-${index}`}
                                value={zeile.preis}
                                inputMode="decimal"
                                placeholder={t.import.pricePlaceholder}
                                onChange={e =>
                                  zeileAendern(index, "preis", e.target.value)
                                }
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label
                                htmlFor={`p-anzahl-${index}`}
                                className="text-xs"
                              >
                                {t.import.countLabel}
                              </Label>
                              <Input
                                id={`p-anzahl-${index}`}
                                value={zeile.anzahl}
                                inputMode="numeric"
                                onChange={e =>
                                  zeileAendern(index, "anzahl", e.target.value)
                                }
                              />
                            </div>
                          </div>
                          {fehler.length > 0 && (
                            <p className="mt-2 text-sm text-destructive">
                              {fehler.join(", ")}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.common.manufacturer}</TableHead>
                          <TableHead>{t.import.typeLabel}</TableHead>
                          <TableHead>{t.common.color}</TableHead>
                          <TableHead className="w-28">
                            {t.import.nominalLabel}
                          </TableHead>
                          <TableHead className="w-28">
                            {t.import.priceLabel({ symbol: currencySymbol })}
                          </TableHead>
                          <TableHead className="w-20">
                            {t.import.countLabel}
                          </TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {zeilen.map((zeile, index) => {
                          const fehler = fehlerProZeile[index];
                          return (
                            <TableRow
                              key={index}
                              className={cn(
                                fehler.length > 0 && "bg-destructive/10"
                              )}
                            >
                              <TableCell>
                                <Input
                                  value={zeile.hersteller}
                                  aria-label={`Hersteller Position ${index + 1}`}
                                  onChange={e =>
                                    zeileAendern(
                                      index,
                                      "hersteller",
                                      e.target.value
                                    )
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={zeile.typ}
                                  aria-label={`Typ Position ${index + 1}`}
                                  onChange={e =>
                                    zeileAendern(index, "typ", e.target.value)
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={zeile.farbe}
                                  aria-label={`Farbe Position ${index + 1}`}
                                  onChange={e =>
                                    zeileAendern(index, "farbe", e.target.value)
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={zeile.nenngewicht}
                                  inputMode="numeric"
                                  aria-label={`Nenngewicht Position ${index + 1}`}
                                  onChange={e =>
                                    zeileAendern(
                                      index,
                                      "nenngewicht",
                                      e.target.value
                                    )
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={zeile.preis}
                                  inputMode="decimal"
                                  placeholder={t.import.pricePlaceholder}
                                  aria-label={`Preis Position ${index + 1}`}
                                  onChange={e =>
                                    zeileAendern(index, "preis", e.target.value)
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={zeile.anzahl}
                                  inputMode="numeric"
                                  aria-label={`Anzahl Position ${index + 1}`}
                                  onChange={e =>
                                    zeileAendern(
                                      index,
                                      "anzahl",
                                      e.target.value
                                    )
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => zeileLoeschen(index)}
                                  aria-label={t.import.deletePosition({
                                    index: index + 1,
                                  })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {hatFehler && (
                <div className="hidden lg:block">
                  {zeilen.map((_, index) =>
                    fehlerProZeile[index].length > 0 ? (
                      <p key={index} className="text-sm text-destructive">
                        {t.import.positionError({
                          index: index + 1,
                          errors: fehlerProZeile[index].join(", "),
                        })}
                      </p>
                    ) : null
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Button
                  onClick={importieren}
                  disabled={!importierbar}
                  className="w-full sm:w-auto"
                >
                  {importMutation.isPending
                    ? t.import.importing
                    : t.import.importCount({ count: gesamtAnzahl })}
                </Button>
                {hatFehler && (
                  <p className="text-sm text-destructive">
                    {t.import.fixErrors}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AuthLayout>
  );
}
