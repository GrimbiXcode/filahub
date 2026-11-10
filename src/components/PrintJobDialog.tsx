import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Check,
  ChevronsUpDown,
  FileUp,
  Package,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { normalizeMaterialType } from "@contracts/materials";
import {
  MAX_LINK_LENGTH,
  MAX_LINKS_PER_PRINT_JOB,
  MAX_MATERIALS_PER_PRINT_JOB,
  MAX_PRINT_DURATION_MINUTES,
  MAX_PRINT_GRAMS,
  MAX_TAGS_PER_PRINT_JOB,
  PRINT_JOB_STATUSES,
  isHttpsUrl,
  parseTagInput,
  tagsOverLimit,
  type PrintJobStatus,
} from "@contracts/printJobs";
import {
  findPrinterByName,
  loadedMaterialId,
  loadedSpools,
} from "@contracts/printers";
import {
  SlicerFileError,
  pickProductForFilament,
  type SlicerFilament,
  type SlicerJob,
} from "@contracts/slicerMetadata";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { printJobPath } from "@/const";
import { useActiveScope } from "@/lib/activeScope";
import { useAppearanceResolver } from "@/lib/appearance";
import { useFormat } from "@/lib/formatContext";
import { formKeys } from "@/lib/formKeyboard";
import { useT } from "@/lib/i18nContext";
import type { PrintJobPrefill } from "@/lib/quickActions";
import { SLICER_FILE_ACCEPT, readSlicerUpload } from "@/lib/slicerFile";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type {
  MaterialOverview,
  PrintImportEntry,
  PrintJobDetail,
} from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PrintJobDetail | null;
  prefill: PrintJobPrefill | null;
};

/** Eine Materialzeile im Formular; `key` nur für React */
type Row = {
  key: number;
  productId: number | null;
  materialId: number | null;
  grams: string;
  /** Was die Slicer-Datei zu dieser Zeile sagt – nur zur Anzeige */
  fromFile?: SlicerFilament;
  /** Das Gebinde kommt aus dem geladenen Platz des Druckers (seit 4.9.0) */
  fromSlot?: boolean;
};

/** Ein geladenes Gebinde samt Drucker und Platz – Vorschlag fürs Abbuchen */
type LoadedOption = {
  printerName: string;
  /** Ab 1; `null` bei einem Drucker mit nur einem Platz */
  slot: number | null;
  material: MaterialOverview;
};

type LinkRow = { key: number; url: string; label: string };

let nextKey = 1;
const newKey = () => nextKey++;

/** Date → Wert eines `datetime-local`-Feldes in der Ortszeit des Browsers */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Wörter in Kleinbuchstaben – für den Abgleich des Druckermodells */
function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * „MK4S“ aus dem G-Code → der schon benutzte Druckername, der das Modell als
 * Wort enthält („Prusa MK4S Werkstatt“); sonst das Modell selbst.
 */
function printerFromModel(model: string, known: readonly string[]): string {
  const key = model.toLowerCase();
  return known.find(name => words(name).includes(key)) ?? model;
}

/**
 * Druck erfassen und bearbeiten (seit 4.2.0).
 *
 * Jede Materialzeile nennt ein Material und optional ein Gebinde. Mit Gebinde
 * und Gramm bucht der Server einen gewöhnlichen Verbrauch ab – in derselben
 * Transaktion wie den Druck. Die Auswahl bietet deshalb zuerst die Gebinde an
 * (der häufige Fall: „von Rolle F12“) und darunter die Materialien ohne
 * Abbuchen, etwa für eine längst leere Rolle.
 */
export function PrintJobDialog({
  open,
  onOpenChange,
  editing,
  prefill,
}: Props) {
  const t = useT();
  const scope = useActiveScope();
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const { data: allMaterials } = trpc.material.list.useQuery(scope, {
    enabled: open,
  });
  const { data: products } = trpc.product.list.useQuery(scope, {
    enabled: open,
  });
  const { data: facets } = trpc.print.facets.useQuery(scope, {
    enabled: open,
  });
  /*
    Drucker mit geladenen Gebinden (seit 4.9.0): Filament 2 aus dem G-Code ist
    die Rolle in Platz 2 – ein sichererer Vorschlag als die ähnlichste Farbe.
  */
  const { data: printers, isPending: printersPending } =
    trpc.printer.list.useQuery(scope, { enabled: open });

  const [title, setTitle] = useState("");
  const [printedAt, setPrintedAt] = useState("");
  const [status, setStatus] = useState<PrintJobStatus>("success");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [printer, setPrinter] = useState("");
  const [tags, setTags] = useState("");
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState("");
  /** Name der zuletzt übernommenen Slicer-Datei – für den Hinweis im Formular */
  const [fileApplied, setFileApplied] = useState<string | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const resolveAppearance = useAppearanceResolver();
  /**
   * Ein Eintrag des Eingangsfachs, dessen Materialzeilen noch zugeordnet
   * werden müssen – sobald Materialien und Gebinde geladen sind (unten).
   */
  const [pendingImport, setPendingImport] = useState<PrintImportEntry | null>(
    null
  );
  const importItem = editing ? null : (prefill?.importItem ?? null);

  /* Beim Öffnen befüllen – während des Renderns, wie im Materialformular. */
  const formKey = open
    ? editing
      ? `edit-${editing.id}`
      : `new-${prefill?.productId ?? ""}-${prefill?.materialId ?? ""}-${prefill?.importItem?.id ?? ""}`
    : null;
  const [applied, setApplied] = useState<string | null>(null);
  if (formKey !== applied) {
    setApplied(formKey);
    if (formKey !== null) {
      if (editing) {
        setTitle(editing.title);
        setPrintedAt(toLocalInput(new Date(editing.printedAt)));
        setStatus(editing.status);
        const duration = editing.durationMinutes;
        setHours(duration != null ? String(Math.floor(duration / 60)) : "");
        setMinutes(duration != null ? String(duration % 60) : "");
        setPrinter(editing.printer ?? "");
        setTags(editing.tags.join(", "));
        setLinks(
          editing.links.map(link => ({
            key: newKey(),
            url: link.url,
            label: link.label ?? "",
          }))
        );
        // Zeilen ohne Material (gelöscht) bleiben auf dem Server stehen und
        // werden hier nur angezeigt – siehe `orphans` unten.
        setRows(
          editing.materials
            .filter(m => m.productId != null)
            .map(m => ({
              key: newKey(),
              productId: m.productId,
              materialId: m.materialId,
              grams: String(m.grams),
            }))
        );
        setNotes(editing.notes ?? "");
        setPendingImport(null);
      } else if (importItem) {
        // Aus dem Eingangsfach: Kopf sofort, Materialzeilen nach dem Laden
        setTitle(importItem.title);
        setPrintedAt(toLocalInput(new Date(importItem.printedAt)));
        setStatus(importItem.status);
        const duration = importItem.durationMinutes;
        setHours(duration != null ? String(Math.floor(duration / 60)) : "");
        setMinutes(duration != null ? String(duration % 60) : "");
        setPrinter(importItem.printer ?? "");
        setTags("");
        setLinks([]);
        setRows([]);
        setNotes("");
        setPendingImport(importItem);
      } else {
        setTitle("");
        setPrintedAt(toLocalInput(new Date()));
        setStatus("success");
        setHours("");
        setMinutes("");
        setPrinter("");
        setTags("");
        setLinks([]);
        setRows([
          {
            key: newKey(),
            productId: prefill?.productId ?? null,
            materialId: prefill?.materialId ?? null,
            grams: "",
          },
        ]);
        setNotes("");
        setPendingImport(null);
      }
      setFileApplied(null);
    }
  }

  const orphans = editing?.materials.filter(m => m.productId == null) ?? [];

  /** Druckernamen zur Auswahl: eingerichtete Drucker und bisher benutzte */
  const printerNames = useMemo(() => {
    const names = (printers ?? []).map(p => p.name);
    for (const name of facets?.printers ?? [])
      if (!findPrinterByName(printers ?? [], name)) names.push(name);
    return names;
  }, [printers, facets]);

  /** Ein Gebinde in Gebrauch – nur solche schlägt ein Platz vor */
  const activeGebinde = (id: number) =>
    allMaterials?.find(m => m.id === id && m.archivedAt == null);

  const matchedPrinter = findPrinterByName(printers ?? [], printer);
  const loadedOptions: LoadedOption[] = useMemo(
    () =>
      loadedSpools(printers ?? [], matchedPrinter).flatMap(entry => {
        const material = allMaterials?.find(
          m => m.id === entry.materialId && m.archivedAt == null
        );
        return material
          ? [
              {
                printerName: entry.printer.name,
                slot: entry.printer.slotCount > 1 ? entry.slot + 1 : null,
                material,
              },
            ]
          : [];
      }),
    [printers, matchedPrinter, allMaterials]
  );
  /** Die Knöpfe über den Zeilen: nur der Drucker dieses Drucks */
  const loadedHere = matchedPrinter
    ? loadedOptions.filter(o => o.printerName === matchedPrinter.name)
    : [];

  /** Ein geladenes Gebinde übernehmen: in die erste leere Zeile oder neu */
  const takeLoaded = (material: MaterialOverview) =>
    setRows(current => {
      if (current.some(row => row.materialId === material.id)) return current;
      const patch = {
        productId: material.productId,
        materialId: material.id,
        fromSlot: true,
      };
      const empty = current.find(row => row.productId == null);
      if (empty)
        return current.map(row =>
          row.key === empty.key ? { ...row, ...patch } : row
        );
      if (current.length + orphans.length >= MAX_MATERIALS_PER_PRINT_JOB)
        return current;
      return [...current, { key: newKey(), grams: "", ...patch }];
    });

  /**
   * Die Angaben einer Slicer-Datei eintragen (seit 4.7.0). Nur in leere
   * Felder: Was jemand schon getippt hat, bleibt. Das Material ist ein
   * Vorschlag (`pickProductForFilament`) und wird nur gesetzt, wenn er
   * eindeutig ist; das Gebinde nur, wenn das Material genau eines in Gebrauch
   * hat.
   */
  const applySlicerJob = (
    job: Pick<
      SlicerJob,
      "title" | "durationMinutes" | "printerModel" | "filaments" | "fileName"
    >,
    options: { quiet?: boolean } = {}
  ) => {
    const resolveHex = (color: string | null) =>
      resolveAppearance(color, null).hex;
    const activeOf = (productId: number) =>
      (allMaterials ?? []).filter(
        m => m.productId === productId && m.archivedAt == null
      );
    // Der Drucker dieses Drucks – aus dem Feld oder aus der Datei
    const printerName =
      printer.trim() ||
      (job.printerModel
        ? printerFromModel(job.printerModel, printerNames)
        : "");
    const target = findPrinterByName(printers ?? [], printerName);
    const rowFor = (
      filament: SlicerFilament,
      keepProductId: number | null
    ): Row => {
      /*
        Zuerst der geladene Platz (seit 4.9.0). Ein schon gewähltes Material
        (von der Material-Seite geöffnet) bleibt; dann zählt der Platz nur,
        wenn sein Gebinde zu diesem Material gehört.
      */
      const slotted = loadedMaterialId(
        target,
        filament.slot,
        id => activeGebinde(id) != null
      );
      const slottedGebinde = slotted != null ? activeGebinde(slotted) : null;
      if (
        slottedGebinde &&
        (keepProductId == null || slottedGebinde.productId === keepProductId)
      )
        return {
          key: newKey(),
          productId: slottedGebinde.productId,
          materialId: slottedGebinde.id,
          grams: String(filament.grams),
          fromFile: filament,
          fromSlot: true,
        };
      const productId =
        keepProductId ??
        pickProductForFilament(filament, products ?? [], resolveHex);
      const active = productId != null ? activeOf(productId) : [];
      return {
        key: newKey(),
        productId,
        materialId: active.length === 1 ? active[0].id : null,
        grams: String(filament.grams),
        fromFile: filament,
      };
    };

    if (!title.trim()) setTitle(job.title);
    if (job.durationMinutes != null && !hours.trim() && !minutes.trim()) {
      setHours(String(Math.floor(job.durationMinutes / 60)));
      setMinutes(String(job.durationMinutes % 60));
    }
    if (job.printerModel && !printer.trim()) setPrinter(printerName);

    setRows(current => {
      // Ein Material, eine Zeile ohne Gramm – etwa von der Material-Seite
      // geöffnet: Das gewählte Material bleibt, die Gramm kommen dazu.
      const [only] = current;
      if (
        job.filaments.length === 1 &&
        current.length === 1 &&
        only.grams.trim() === ""
      ) {
        const row = rowFor(job.filaments[0], only.productId);
        return [
          only.productId != null && only.materialId != null
            ? { ...row, materialId: only.materialId, fromSlot: false }
            : row,
        ];
      }
      const kept = current.filter(
        row => row.productId != null || row.grams.trim() !== ""
      );
      const room = MAX_MATERIALS_PER_PRINT_JOB - kept.length - orphans.length;
      const next = [
        ...kept,
        ...job.filaments.slice(0, Math.max(0, room)).map(f => rowFor(f, null)),
      ];
      // Ohne Filamente bleibt eine leere Zeile zum Eintragen
      return next.length > 0
        ? next
        : [{ key: newKey(), productId: null, materialId: null, grams: "" }];
    });
    setFileApplied(job.fileName);
    if (job.filaments.length === 0 && !options.quiet)
      toast.warning(t.prints.form.fromFileEmpty);
  };

  /* Eintrag des Eingangsfachs: zuordnen, sobald die Listen da sind */
  if (pendingImport && products && allMaterials && !printersPending) {
    setPendingImport(null);
    applySlicerJob(
      {
        title: pendingImport.title,
        durationMinutes: pendingImport.durationMinutes,
        printerModel: null,
        filaments: pendingImport.filaments,
        fileName: pendingImport.title,
      },
      { quiet: true }
    );
  }

  const onFilePicked = async (file: File | undefined) => {
    if (!file) return;
    setReadingFile(true);
    try {
      applySlicerJob(await readSlicerUpload(file));
    } catch (error) {
      toast.error(
        error instanceof SlicerFileError
          ? t.prints.form.fromFileErrors[error.code]
          : t.prints.form.fromFileErrors.unexpected
      );
    } finally {
      setReadingFile(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const unassigned = fileApplied
    ? rows.filter(row => row.fromFile && row.productId == null).length
    : 0;

  const onSaved = (id: number, created: boolean) => {
    toast.success(created ? t.prints.created : t.prints.saved);
    utils.print.invalidate();
    // Ein Druck bucht ab: Bestand und Verlauf der Gebinde ändern sich mit
    utils.material.list.invalidate();
    utils.material.byId.invalidate();
    utils.product.invalidate();
    onOpenChange(false);
    if (created) navigate(printJobPath(id));
  };
  const create = trpc.print.create.useMutation({
    onSuccess: ({ id }) => onSaved(id, true),
    onError: e => toast.error(e.message),
  });
  const update = trpc.print.update.useMutation({
    onSuccess: () => editing && onSaved(editing.id, false),
    onError: e => toast.error(e.message),
  });
  const resolveImport = trpc.printImport.resolve.useMutation({
    onSuccess: ({ id }) => {
      utils.printImport.invalidate();
      onSaved(id, true);
    },
    onError: e => toast.error(e.message),
  });
  const pending =
    create.isPending || update.isPending || resolveImport.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error(t.prints.form.titleRequired);
    /*
      Das Feld kennt nur Minuten. Steht dort noch der ursprüngliche Wert,
      bleibt der gespeicherte Zeitpunkt samt Sekunden – sonst sähe der Server
      bei jeder Titeländerung ein neues Datum und buchte die Verbräuche um.
    */
    const when =
      editing && printedAt === toLocalInput(new Date(editing.printedAt))
        ? new Date(editing.printedAt)
        : new Date(printedAt);
    if (!printedAt || Number.isNaN(when.getTime()))
      return toast.error(t.prints.form.invalidDate);
    const materials: {
      productId: number;
      materialId: number | null;
      grams: number;
    }[] = [];
    for (const row of rows) {
      // Ganz leere Zeilen übergehen – eine angefangene Zeile ist keine Absicht
      if (row.productId == null && row.grams.trim() === "") continue;
      if (row.productId == null)
        return toast.error(t.prints.form.materialMissing);
      const grams = row.grams.trim() === "" ? 0 : Number(row.grams);
      if (!Number.isInteger(grams) || grams < 0 || grams > MAX_PRINT_GRAMS)
        return toast.error(t.prints.form.invalidGrams);
      materials.push({
        productId: row.productId,
        materialId: row.materialId,
        grams,
      });
    }
    const cleanLinks = links
      .filter(link => link.url.trim() !== "")
      .map(link => ({
        url: link.url.trim(),
        label: link.label.trim() || null,
      }));
    if (
      cleanLinks.some(
        link => !isHttpsUrl(link.url) || link.url.length > MAX_LINK_LENGTH
      )
    )
      return toast.error(t.prints.form.invalidLink);
    const h = hours.trim() === "" ? 0 : Number(hours);
    const m = minutes.trim() === "" ? 0 : Number(minutes);
    const durationMinutes =
      hours.trim() === "" && minutes.trim() === ""
        ? null
        : Number.isFinite(h) && Number.isFinite(m)
          ? Math.max(0, Math.round(h * 60 + m))
          : null;
    if (durationMinutes != null && durationMinutes > MAX_PRINT_DURATION_MINUTES)
      return toast.error(t.prints.form.invalidDuration);
    const parsedTags = parseTagInput(tags);
    if (tagsOverLimit(tags))
      return toast.error(
        t.prints.form.tooManyTags({ max: MAX_TAGS_PER_PRINT_JOB })
      );
    const data = {
      ...scope,
      title: title.trim(),
      printedAt: when,
      status,
      durationMinutes,
      printer: printer.trim() || null,
      notes: notes.trim() || null,
      tags: parsedTags,
      links: cleanLinks,
      materials,
    };
    if (editing) update.mutate({ ...data, id: editing.id });
    else if (importItem)
      resolveImport.mutate({ ...data, importId: importItem.id });
    else create.mutate(data);
  };

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows(current =>
      current.map(row => (row.key === key ? { ...row, ...patch } : row))
    );
  const setLink = (key: number, patch: Partial<LinkRow>) =>
    setLinks(current =>
      current.map(link => (link.key === key ? { ...link, ...patch } : link))
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? t.prints.form.titleEdit : t.prints.form.titleNew}
          </DialogTitle>
          <DialogDescription>{t.prints.form.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" {...formKeys}>
          {!editing && (
            <div className="grid gap-1.5 rounded-md border border-dashed p-3">
              <input
                ref={fileInput}
                type="file"
                accept={SLICER_FILE_ACCEPT}
                className="hidden"
                onChange={e => void onFilePicked(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                disabled={readingFile}
                onClick={() => fileInput.current?.click()}
              >
                <FileUp className="mr-1.5 h-3.5 w-3.5" />
                {readingFile
                  ? t.prints.form.fromFileReading
                  : t.prints.form.fromFile}
              </Button>
              <p className="text-xs wrap-anywhere text-muted-foreground">
                {importItem && fileApplied === importItem.title
                  ? t.prints.form.fromImportApplied
                  : fileApplied
                    ? t.prints.form.fromFileApplied({ name: fileApplied })
                    : t.prints.form.fromFileHint}
              </p>
              {unassigned > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t.prints.form.fromFileUnassigned({ count: unassigned })}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="pj-title">{t.prints.form.titleLabel}</Label>
            <Input
              id="pj-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t.prints.form.titlePlaceholder}
              maxLength={255}
              required
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pj-date">{t.prints.form.printedAtLabel}</Label>
              <Input
                id="pj-date"
                type="datetime-local"
                value={printedAt}
                onChange={e => setPrintedAt(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pj-status">{t.prints.form.statusLabel}</Label>
              <Select
                value={status}
                onValueChange={value => setStatus(value as PrintJobStatus)}
              >
                <SelectTrigger id="pj-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRINT_JOB_STATUSES.map(value => (
                    <SelectItem key={value} value={value}>
                      {t.prints.status[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>{t.prints.form.materialsLabel}</Label>
            <p className="text-xs text-muted-foreground">
              {t.prints.form.materialsHint}
            </p>
            {loadedHere.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-xs text-muted-foreground">
                  {t.prints.form.loadedLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {loadedHere.map(option => {
                    const taken = rows.some(
                      row => row.materialId === option.material.id
                    );
                    return (
                      <button
                        key={option.material.id}
                        type="button"
                        disabled={taken}
                        onClick={() => takeLoaded(option.material)}
                        className="max-w-full truncate rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
                      >
                        {option.slot != null && (
                          <span className="mr-1 font-mono text-muted-foreground">
                            {option.slot}
                          </span>
                        )}
                        {option.material.name}
                        {option.material.identifier && (
                          <span className="ml-1 font-mono text-muted-foreground">
                            {option.material.identifier}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {rows.map(row => (
              <div key={row.key} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <MaterialRowPicker
                    row={row}
                    alreadyBooked={
                      editing?.materials.some(
                        m =>
                          m.booked &&
                          m.materialId != null &&
                          m.materialId === row.materialId
                      ) ?? false
                    }
                    materials={allMaterials ?? []}
                    products={products ?? []}
                    loaded={loadedOptions}
                    onChange={patch =>
                      setRow(row.key, { ...patch, fromSlot: false })
                    }
                  />
                  {row.fromFile && (
                    <FileFilamentHint
                      filament={row.fromFile}
                      fromSlot={row.fromSlot ?? false}
                      productType={
                        products?.find(p => p.id === row.productId)
                          ?.materialType ?? null
                      }
                    />
                  )}
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={row.grams}
                  onChange={e => setRow(row.key, { grams: e.target.value })}
                  placeholder={t.prints.form.gramsLabel}
                  aria-label={t.prints.form.gramsLabel}
                  className="w-24 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t.prints.form.removeMaterial}
                  onClick={() =>
                    setRows(current => current.filter(r => r.key !== row.key))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {orphans.map(orphan => (
              <div
                key={orphan.id}
                className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
              >
                <span className="font-medium text-foreground">
                  {orphan.name}
                </span>{" "}
                · {t.prints.form.orphanHint}
              </div>
            ))}
            {rows.length + orphans.length < MAX_MATERIALS_PER_PRINT_JOB && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() =>
                  setRows(current => [
                    ...current,
                    {
                      key: newKey(),
                      productId: null,
                      materialId: null,
                      grams: "",
                    },
                  ])
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t.prints.form.addMaterial}
              </Button>
            )}
            {editing && (
              <p className="text-xs text-muted-foreground">
                {t.prints.form.rebookHint}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pj-printer">{t.prints.form.printerLabel}</Label>
              <AutocompleteInput
                id="pj-printer"
                value={printer}
                onChange={setPrinter}
                suggestions={printerNames}
                placeholder={t.prints.form.printerPlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pj-hours">{t.prints.form.durationLabel}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pj-hours"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={hours}
                  onChange={e => setHours(e.target.value)}
                  className="w-20 font-mono"
                />
                <span className="text-sm text-muted-foreground">
                  {t.prints.form.hours}
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={e => setMinutes(e.target.value)}
                  aria-label={t.prints.form.minutes}
                  className="w-20 font-mono"
                />
                <span className="text-sm text-muted-foreground">
                  {t.prints.form.minutes}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pj-tags">{t.prints.form.tagsLabel}</Label>
            <Input
              id="pj-tags"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder={t.prints.form.tagsPlaceholder}
            />
            <TagSuggestions
              known={facets?.tags ?? []}
              value={tags}
              onPick={tag =>
                setTags(current => [...parseTagInput(current), tag].join(", "))
              }
            />
            <p className="text-xs text-muted-foreground">
              {t.prints.form.tagsHint}
            </p>
          </div>

          <div className="grid gap-2">
            <Label>{t.prints.form.linksLabel}</Label>
            {links.map(link => (
              <div
                key={link.key}
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
              >
                <Input
                  type="url"
                  inputMode="url"
                  value={link.url}
                  onChange={e => setLink(link.key, { url: e.target.value })}
                  placeholder={t.prints.form.linkUrlPlaceholder}
                  aria-label={t.prints.form.linksLabel}
                  className="min-w-0 flex-1"
                />
                <div className="flex items-center gap-2 sm:w-56">
                  <Input
                    value={link.label}
                    onChange={e => setLink(link.key, { label: e.target.value })}
                    placeholder={t.prints.form.linkLabelPlaceholder}
                    aria-label={t.prints.form.linkLabelPlaceholder}
                    maxLength={100}
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t.prints.form.removeLink}
                    onClick={() =>
                      setLinks(current =>
                        current.filter(l => l.key !== link.key)
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {links.length < MAX_LINKS_PER_PRINT_JOB && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() =>
                  setLinks(current => [
                    ...current,
                    { key: newKey(), url: "", label: "" },
                  ])
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t.prints.form.addLink}
              </Button>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pj-notes">{t.prints.form.notesLabel}</Label>
            <Textarea
              id="pj-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t.prints.form.notesPlaceholder}
              rows={5}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Was die Slicer-Datei zu einer Zeile sagt: Farbe, Materialart, Profil. Weicht
 * die Materialart des gewählten Materials ab, steht das in Warnfarbe daneben –
 * gewählt bleibt, was der Mensch gewählt hat.
 */
function FileFilamentHint({
  filament,
  fromSlot,
  productType,
}: {
  filament: SlicerFilament;
  fromSlot: boolean;
  productType: string | null;
}) {
  const t = useT();
  const fileType = filament.filamentType;
  const mismatch =
    fileType != null &&
    productType != null &&
    normalizeMaterialType(fileType) !== normalizeMaterialType(productType);
  const parts = [filament.filamentType, filament.profileName].filter(
    (part, i, all): part is string => part != null && all.indexOf(part) === i
  );
  return (
    // Umbrechen statt abschneiden: Eine einzeilige Zeile gibt ihre volle
    // Breite als Mindestbreite ans Raster weiter und schiebt den Dialog auf
    // dem Telefon über den Rand.
    <p className="mt-1 text-xs wrap-anywhere text-muted-foreground">
      {filament.colorHex && (
        <span
          aria-hidden
          className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border align-[-1px]"
          style={{ backgroundColor: filament.colorHex }}
        />
      )}
      {t.prints.form.fileFilamentLabel({ slot: filament.slot + 1 })}
      {parts.length > 0 && ` · ${parts.join(" · ")}`}
      {fromSlot && ` · ${t.prints.form.fromLoadedSlot}`}
      {mismatch && (
        <span className="ml-1.5 text-amber-600 dark:text-amber-400">
          {t.prints.form.fileTypeMismatch({ type: fileType })}
        </span>
      )}
    </p>
  );
}

/** Bekannte Tags, die noch nicht im Feld stehen, als Knöpfe zum Antippen */
function TagSuggestions({
  known,
  value,
  onPick,
}: {
  known: string[];
  value: string;
  onPick: (tag: string) => void;
}) {
  const current = new Set(parseTagInput(value));
  const open = known.filter(tag => !current.has(tag)).slice(0, 12);
  if (open.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {open.map(tag => (
        <button
          key={tag}
          type="button"
          onClick={() => onPick(tag)}
          className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}

type ProductOption = {
  id: number;
  name: string;
  materialType: string;
  manufacturer: string | null;
  color: string | null;
};

/**
 * Auswahl einer Zeile: zuerst die Gebinde in Gebrauch (wird abgebucht), dann
 * alle Materialien ohne Gebinde (nur vermerkt). Ein aufgebrauchtes Gebinde
 * steht nicht zur Wahl, bleibt aber lesbar, wenn die Zeile es schon trägt.
 */
function MaterialRowPicker({
  row,
  alreadyBooked,
  materials,
  products,
  loaded,
  onChange,
}: {
  row: Row;
  /** Der Druck hat von diesem Gebinde schon abgebucht – dann darf es bleiben */
  alreadyBooked: boolean;
  materials: MaterialOverview[];
  products: ProductOption[];
  /** Geladene Gebinde, der Drucker dieses Drucks zuerst (seit 4.9.0) */
  loaded: LoadedOption[];
  onChange: (patch: Partial<Row>) => void;
}) {
  const t = useT();
  const { formatGrams } = useFormat();
  const [open, setOpen] = useState(false);
  const active = useMemo(
    () => materials.filter(m => m.archivedAt == null),
    [materials]
  );
  const gebinde =
    row.materialId != null
      ? materials.find(m => m.id === row.materialId)
      : undefined;
  const product =
    row.productId != null
      ? products.find(p => p.id === row.productId)
      : undefined;

  const label = gebinde
    ? `${gebinde.name}${gebinde.identifier ? ` · ${gebinde.identifier}` : ""}`
    : product
      ? `${product.name} · ${t.prints.form.withoutGebinde}`
      : null;

  const pick = (patch: Partial<Row>) => {
    onChange(patch);
    setOpen(false);
  };

  return (
    <div className="grid gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full min-w-0 justify-between font-normal"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
              {label ? (
                <span className="truncate">{label}</span>
              ) : (
                <span className="truncate text-muted-foreground">
                  {t.prints.form.pickMaterial}
                </span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-104 max-w-[calc(100vw-2rem)] min-w-(--radix-popover-trigger-width) p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={t.prints.form.searchMaterial} />
            <CommandList>
              <CommandEmpty>{t.common.nothingFound}</CommandEmpty>
              {loaded.length > 0 && (
                <CommandGroup heading={t.prints.form.groupLoaded}>
                  {loaded.map(({ printerName, slot, material: m }) => (
                    <CommandItem
                      key={`l-${m.id}`}
                      value={`l-${m.id} ${[printerName, m.identifier, m.name, m.materialType, m.manufacturer, m.color].filter(Boolean).join(" ")}`}
                      onSelect={() =>
                        pick({ productId: m.productId, materialId: m.id })
                      }
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          row.materialId === m.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{m.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {t.printers.loadedIn({ printer: printerName, slot })}
                          {m.identifier ? ` · ${m.identifier}` : ""}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {active.length > 0 && (
                <CommandGroup heading={t.prints.form.groupGebinde}>
                  {active.map(m => (
                    <CommandItem
                      key={`g-${m.id}`}
                      value={`g-${m.id} ${[m.identifier, m.name, m.materialType, m.manufacturer, m.color].filter(Boolean).join(" ")}`}
                      onSelect={() =>
                        pick({ productId: m.productId, materialId: m.id })
                      }
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          row.materialId === m.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{m.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {m.identifier ? `${m.identifier} · ` : ""}
                          {t.quick.remaining({
                            amount: formatGrams(m.remainingWeight),
                          })}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {products.length > 0 && (
                <CommandGroup heading={t.prints.form.groupProducts}>
                  {products.map(p => (
                    <CommandItem
                      key={`p-${p.id}`}
                      value={`p-${p.id} ${[p.name, p.materialType, p.manufacturer, p.color].filter(Boolean).join(" ")}`}
                      onSelect={() =>
                        pick({ productId: p.id, materialId: null })
                      }
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          row.materialId == null && row.productId === p.id
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <span className="truncate">{p.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {gebinde?.archivedAt != null &&
        !alreadyBooked &&
        Number(row.grams) > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t.prints.form.usedUpGebinde}
          </p>
        )}
    </div>
  );
}
