import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Check,
  ChevronsUpDown,
  Pencil,
  Plus,
  Printer as PrinterIcon,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { roleAllows } from "@contracts/organizations";
import { MAX_PRINTER_SLOTS } from "@contracts/printers";
import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
import { Spool } from "@/components/Spool";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { gebindePath } from "@/const";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useAppearanceResolver } from "@/lib/appearance";
import { useFormat } from "@/lib/formatContext";
import { formKeys } from "@/lib/formKeyboard";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { MaterialOverview, PrinterItem } from "@/types";

/** Wo ein Gebinde gerade steckt – für den Hinweis in der Auswahl */
type Location = { printer: PrinterItem; slot: number };

/**
 * Drucker und ihre geladenen Gebinde (seit 4.9.0). Je Platz eine Auswahl;
 * was hier geladen ist, schlagen Druckformular, Eingangsfach und Schnellsuche
 * beim Abbuchen vor (`contracts/printers.ts`).
 */
export default function Printers() {
  const utils = trpc.useUtils();
  const scope = useActiveScope();
  const role = useScopeRole();
  const t = useT();
  const { data: printers, isLoading } = trpc.printer.list.useQuery(scope);
  const { data: materials } = trpc.material.list.useQuery(scope);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PrinterItem | null>(null);
  const [deleting, setDeleting] = useState<PrinterItem | null>(null);
  const [name, setName] = useState("");
  const [slotCount, setSlotCount] = useState("1");

  const openDialog = (printer: PrinterItem | null) => {
    setEditing(printer);
    setName(printer?.name ?? "");
    setSlotCount(String(printer?.slotCount ?? 1));
    setDialogOpen(true);
  };

  const materialById = useMemo(
    () => new Map((materials ?? []).map(m => [m.id, m])),
    [materials]
  );
  const locations = useMemo(() => {
    const map = new Map<number, Location>();
    for (const printer of printers ?? [])
      for (const s of printer.slots)
        map.set(s.materialId, { printer, slot: s.slot });
    return map;
  }, [printers]);

  const createMutation = trpc.printer.create.useMutation({
    onSuccess: () => {
      toast.success(t.printers.created);
      utils.printer.list.invalidate();
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.printer.update.useMutation({
    onSuccess: () => {
      toast.success(t.printers.saved);
      utils.printer.list.invalidate();
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.printer.delete.useMutation({
    onSuccess: () => {
      toast.success(t.printers.deleted);
      utils.printer.list.invalidate();
      setDeleting(null);
    },
    onError: e => toast.error(e.message),
  });
  const loadMutation = trpc.printer.loadSlot.useMutation({
    onSuccess: (_, input) => {
      toast.success(
        input.materialId == null ? t.printers.unloaded : t.printers.loaded
      );
      utils.printer.list.invalidate();
    },
    onError: e => {
      toast.error(e.message);
      utils.printer.list.invalidate();
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const slots = Number(slotCount);
    if (!name.trim()) return toast.error(t.common.nameRequired);
    if (!Number.isInteger(slots) || slots < 1 || slots > MAX_PRINTER_SLOTS)
      return;
    const payload = { name: name.trim(), slotCount: slots };
    if (editing)
      updateMutation.mutate({ ...scope, id: editing.id, ...payload });
    else createMutation.mutate({ ...scope, ...payload });
  };

  const list = printers ?? [];
  const mayLoad = roleAllows(role, "weigher");
  const mayEdit = roleAllows(role, "editor");

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.printers.title}
          description={t.printers.description}
          actions={
            mayEdit && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => openDialog(null)}
              >
                <Plus className="mr-2 h-4 w-4" /> {t.printers.newPrinter}
              </Button>
            )
          }
        />

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <PrinterIcon className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">{t.printers.emptyTitle}</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t.printers.emptyDescription}
              </p>
              {mayEdit && (
                <Button onClick={() => openDialog(null)}>
                  <Plus className="mr-2 h-4 w-4" /> {t.printers.firstPrinter}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid items-start gap-3 md:grid-cols-2">
            {list.map(printer => (
              <Card key={printer.id} className="py-0">
                <CardContent className="grid gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{printer.name}</p>
                      <Badge variant="outline" className="mt-1 font-normal">
                        {t.printers.slotsSummary({
                          loaded: printer.slots.filter(s =>
                            materialById.has(s.materialId)
                          ).length,
                          total: printer.slotCount,
                        })}
                      </Badge>
                    </div>
                    {mayEdit && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t.printers.editPrinter}
                          onClick={() => openDialog(printer)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t.printers.deletePrinter}
                          onClick={() => setDeleting(printer)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2">
                    {Array.from({ length: printer.slotCount }, (_, slot) => {
                      const load = printer.slots.find(s => s.slot === slot);
                      const material = load
                        ? materialById.get(load.materialId)
                        : undefined;
                      return (
                        <SlotRow
                          key={slot}
                          label={
                            printer.slotCount > 1
                              ? t.printers.slotLabel({ slot: slot + 1 })
                              : null
                          }
                          material={material}
                          materials={materials ?? []}
                          locations={locations}
                          disabled={!mayLoad || loadMutation.isPending}
                          onLoad={materialId =>
                            loadMutation.mutate({
                              ...scope,
                              printerId: printer.id,
                              slot,
                              materialId,
                            })
                          }
                        />
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t.printers.editPrinter : t.printers.newPrinter}
            </DialogTitle>
            <DialogDescription>{t.printers.nameHint}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} {...formKeys} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pr-name">{t.common.nameRequiredLabel}</Label>
              <Input
                id="pr-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t.printers.namePlaceholder}
                maxLength={100}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pr-slots">{t.printers.slotCountLabel}</Label>
              <Input
                id="pr-slots"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_PRINTER_SLOTS}
                value={slotCount}
                onChange={e => setSlotCount(e.target.value)}
                className="w-24 font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">
                {t.printers.slotCountHint}
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? t.common.saving
                  : editing
                    ? t.common.save
                    : t.common.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting != null}
        onOpenChange={o => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.printers.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.printers.deleteDescription({ name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleting && deleteMutation.mutate({ ...scope, id: deleting.id })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthLayout>
  );
}

/** Ein Platz: das geladene Gebinde samt Spule, Auswahl und „Entladen“ */
function SlotRow({
  label,
  material,
  materials,
  locations,
  disabled,
  onLoad,
}: {
  label: string | null;
  material: MaterialOverview | undefined;
  materials: MaterialOverview[];
  locations: Map<number, Location>;
  disabled: boolean;
  onLoad: (materialId: number | null) => void;
}) {
  const t = useT();
  const { formatGrams } = useFormat();
  const resolveAppearance = useAppearanceResolver();
  const [open, setOpen] = useState(false);
  const active = useMemo(
    () => materials.filter(m => m.archivedAt == null),
    [materials]
  );
  const appearance = material
    ? resolveAppearance(material.color, material.texture)
    : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border p-2">
      {material && appearance ? (
        <Spool
          size={40}
          hex={appearance.hex}
          kind={appearance.kind}
          percent={material.remainingPercent}
          label={material.color ?? material.name}
        />
      ) : (
        <div
          aria-hidden
          className="size-10 shrink-0 rounded-full border border-dashed"
        />
      )}
      <div className="min-w-0 flex-1">
        {label && (
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
        )}
        {material ? (
          <Link
            to={gebindePath(material.id)}
            className="block truncate text-sm hover:underline"
          >
            {material.name}
            {material.identifier && (
              <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                {material.identifier}
              </span>
            )}
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">{t.printers.empty}</p>
        )}
        {material && (
          <p className="font-mono text-xs text-muted-foreground">
            {t.quick.remaining({
              amount: formatGrams(material.remainingWeight),
            })}
          </p>
        )}
      </div>
      {!disabled && (
        <div className="flex shrink-0 gap-1">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                role="combobox"
                aria-expanded={open}
                aria-label={t.printers.pickGebinde}
              >
                <span className="hidden sm:inline">
                  {t.printers.pickGebinde}
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50 sm:ml-1.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-96 max-w-[calc(100vw-2rem)] p-0"
              align="end"
            >
              <Command>
                <CommandInput placeholder={t.printers.searchGebinde} />
                <CommandList>
                  <CommandEmpty>{t.common.nothingFound}</CommandEmpty>
                  <CommandGroup>
                    {active.map(m => {
                      const where = locations.get(m.id);
                      return (
                        <CommandItem
                          key={m.id}
                          value={`${m.id} ${[m.identifier, m.name, m.materialType, m.manufacturer, m.color].filter(Boolean).join(" ")}`}
                          onSelect={() => {
                            setOpen(false);
                            if (m.id !== material?.id) onLoad(m.id);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4 shrink-0",
                              material?.id === m.id
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{m.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {m.identifier ? `${m.identifier} · ` : ""}
                              {t.quick.remaining({
                                amount: formatGrams(m.remainingWeight),
                              })}
                              {where &&
                                m.id !== material?.id &&
                                ` · ${t.printers.loadedElsewhere({
                                  printer: where.printer.name,
                                  slot: where.slot + 1,
                                })}`}
                            </span>
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {material && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.printers.unload}
              onClick={() => onLoad(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
