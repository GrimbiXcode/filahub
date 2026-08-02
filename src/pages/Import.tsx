import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ClipboardCopy, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
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
import { IMPORT_PROMPT } from "@/lib/importPrompt";
import { parseEuroToCents } from "@/lib/format";
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
function zeilenFehler(zeile: ImportZeile): string[] {
  const fehler: string[] = [];
  if (!zeile.typ.trim()) fehler.push("Typ fehlt");
  const gewicht = Number(zeile.nenngewicht);
  if (!Number.isInteger(gewicht) || gewicht <= 0)
    fehler.push("Nenngewicht ungültig");
  const anzahl = Number(zeile.anzahl);
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 50)
    fehler.push("Anzahl ungültig");
  if (zeile.preis.trim() && parseEuroToCents(zeile.preis) === null)
    fehler.push("Preis ungültig");
  return fehler;
}

const DATUM_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default function Import() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const dateiInputRef = useRef<HTMLInputElement>(null);

  const [jsonText, setJsonText] = useState("");
  const [pruefFehler, setPruefFehler] = useState<string | null>(null);
  const [zeilen, setZeilen] = useState<ImportZeile[] | null>(null);
  const [kaufdatum, setKaufdatum] = useState("");

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
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      toast.success("Prompt in die Zwischenablage kopiert");
    } catch {
      toast.error("Kopieren fehlgeschlagen – bitte manuell markieren");
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
      setPruefFehler(
        "Das ist kein gültiges JSON. Bitte die Ausgabe des LLM prüfen."
      );
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
        preis: p.preis != null ? String(p.preis).replace(".", ",") : "",
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

  const fehlerProZeile = (zeilen ?? []).map(zeilenFehler);
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
        priceCents: parseEuroToCents(z.preis) ?? undefined,
        anzahl: Number(z.anzahl),
      })),
    });
  };

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Massenimport
          </h1>
          <p className="text-sm text-muted-foreground">
            Bestellliste per LLM in JSON umwandeln und alle Positionen auf
            einmal ins Lager übernehmen.
          </p>
        </div>

        {/* Schritt 1: Prompt kopieren */}
        <Card>
          <CardHeader>
            <CardTitle>1. Prompt kopieren</CardTitle>
            <CardDescription>
              Diesen Prompt zusammen mit deiner Bestellliste (Rechnung,
              Bestellbestätigung …) an ein LLM deiner Wahl schicken.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm max-h-64 overflow-y-auto">
              {IMPORT_PROMPT}
            </pre>
            <div>
              <Button variant="outline" onClick={promptKopieren}>
                <ClipboardCopy className="mr-2 h-4 w-4" />
                Prompt kopieren
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Schritt 2: JSON einfügen oder hochladen */}
        <Card>
          <CardHeader>
            <CardTitle>2. JSON einfügen</CardTitle>
            <CardDescription>
              Die Antwort des LLM hier einfügen oder als Datei (.json, .txt)
              hochladen.
            </CardDescription>
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
            />
            {pruefFehler && (
              <p className="whitespace-pre-wrap text-sm text-destructive">
                {pruefFehler}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={pruefen} disabled={!jsonText.trim()}>
                Überprüfen
              </Button>
              <Button
                variant="outline"
                onClick={() => dateiInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Datei hochladen
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
            <CardHeader>
              <CardTitle>3. Prüfen und importieren</CardTitle>
              <CardDescription>
                Angaben bei Bedarf korrigieren, fehlerhafte Positionen löschen.
                Pro Position und Stückzahl wird ein eigenes Material angelegt.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 max-w-56">
                <Label htmlFor="kaufdatum">Kaufdatum (optional)</Label>
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
                  Keine Positionen mehr vorhanden.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hersteller</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Farbe</TableHead>
                        <TableHead className="w-28">Nenngewicht (g)</TableHead>
                        <TableHead className="w-28">Preis (€)</TableHead>
                        <TableHead className="w-20">Anzahl</TableHead>
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
                                onChange={e =>
                                  zeileAendern(index, "typ", e.target.value)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={zeile.farbe}
                                onChange={e =>
                                  zeileAendern(index, "farbe", e.target.value)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
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
                            </TableCell>
                            <TableCell>
                              <Input
                                value={zeile.preis}
                                placeholder="z. B. 29,99"
                                onChange={e =>
                                  zeileAendern(index, "preis", e.target.value)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={zeile.anzahl}
                                inputMode="numeric"
                                onChange={e =>
                                  zeileAendern(index, "anzahl", e.target.value)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => zeileLoeschen(index)}
                                aria-label="Position löschen"
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
              )}

              {hatFehler &&
                zeilen.map((_, index) =>
                  fehlerProZeile[index].length > 0 ? (
                    <p key={index} className="text-sm text-destructive">
                      Position {index + 1}: {fehlerProZeile[index].join(", ")}
                    </p>
                  ) : null
                )}

              <div className="flex items-center gap-3">
                <Button onClick={importieren} disabled={!importierbar}>
                  {importMutation.isPending
                    ? "Importiere …"
                    : `${gesamtAnzahl} Materialien importieren`}
                </Button>
                {hatFehler && (
                  <p className="text-sm text-destructive">
                    Bitte zuerst die markierten Fehler beheben.
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
