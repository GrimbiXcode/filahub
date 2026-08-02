import { useState } from "react";
import { Library, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SPOOL_MATERIAL_LABELS, formatNominalWeight } from "@contracts/presets";
import { AdminLayout } from "@/components/AdminLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatGrams } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type {
  PresetManufacturerNode,
  PresetSeriesNode,
  PresetVariantNode,
  PresetVersionNode,
} from "@/types";
import {
  CatalogEditorDialog,
  type EditorTarget,
} from "@/components/CatalogEditorDialog";

type DeleteTarget = {
  level: "manufacturer" | "series" | "version" | "variant";
  id: number;
  label: string;
};

export default function AdminPresets() {
  const utils = trpc.useUtils();
  const { data: tree, isLoading } = trpc.admin.preset.tree.useQuery(undefined, {
    retry: false,
  });
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  const invalidate = () => {
    utils.admin.preset.tree.invalidate();
    utils.preset.tree.invalidate();
    utils.preset.options.invalidate();
  };

  const onDeleted = {
    onSuccess: () => {
      toast.success("Eintrag gelöscht");
      invalidate();
      setDeleting(null);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const deleteManufacturer =
    trpc.admin.preset.deleteManufacturer.useMutation(onDeleted);
  const deleteSeries = trpc.admin.preset.deleteSeries.useMutation(onDeleted);
  const deleteVersion = trpc.admin.preset.deleteVersion.useMutation(onDeleted);
  const deleteVariant = trpc.admin.preset.deleteVariant.useMutation(onDeleted);

  const confirmDelete = () => {
    if (!deleting) return;
    const input = { id: deleting.id };
    if (deleting.level === "manufacturer") deleteManufacturer.mutate(input);
    else if (deleting.level === "series") deleteSeries.mutate(input);
    else if (deleting.level === "version") deleteVersion.mutate(input);
    else deleteVariant.mutate(input);
  };

  const inactive = (active: boolean) =>
    !active ? (
      <Badge variant="outline" className="font-normal">
        deaktiviert
      </Badge>
    ) : null;

  const renderVariants = (version: PresetVersionNode) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nenngewicht</TableHead>
          <TableHead>Leergewicht</TableHead>
          <TableHead className="hidden sm:table-cell">
            Ø × Breite × Bohrung
          </TableHead>
          <TableHead>Herkunft</TableHead>
          <TableHead className="text-right">Aktionen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {version.variants.map((variant: PresetVariantNode) => (
          <TableRow key={variant.id}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                {formatNominalWeight(variant.nominalWeight)}
                {inactive(variant.active)}
              </div>
            </TableCell>
            <TableCell>{formatGrams(variant.tareWeight)}</TableCell>
            <TableCell className="hidden text-muted-foreground sm:table-cell">
              {variant.outerDiameterMm
                ? `${variant.outerDiameterMm} × ${variant.widthMm ?? "?"} × ${variant.boreDiameterMm ?? "?"} mm`
                : "–"}
            </TableCell>
            <TableCell className="text-muted-foreground">{variant.source}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Bearbeiten"
                  onClick={() => setEditor({ level: "variant", variant })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Löschen"
                  onClick={() =>
                    setDeleting({
                      level: "variant",
                      id: variant.id,
                      label: variant.displayName,
                    })
                  }
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {version.variants.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-sm text-muted-foreground">
              Noch keine Größe hinterlegt.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  const renderVersion = (version: PresetVersionNode) => (
    <div key={version.id} className="mt-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{version.name}</span>
          {version.spoolMaterial && (
            <Badge variant="secondary" className="font-normal">
              {SPOOL_MATERIAL_LABELS[version.spoolMaterial]}
            </Badge>
          )}
          {!version.isCurrent && (
            <Badge variant="outline" className="font-normal">
              ausgelaufen
            </Badge>
          )}
          {inactive(version.active)}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditor({ level: "variant", versionId: version.id })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Größe
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Bearbeiten"
            onClick={() => setEditor({ level: "version", version })}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Löschen"
            onClick={() =>
              setDeleting({ level: "version", id: version.id, label: version.name })
            }
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
      {renderVariants(version)}
    </div>
  );

  const renderSeries = (series: PresetSeriesNode) => (
    <div key={series.id} className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{series.name}</span>
          {series.materialTypes.map((type) => (
            <Badge key={type} variant="secondary" className="font-normal">
              {type}
            </Badge>
          ))}
          {series.materialTypes.length === 0 && (
            <span className="text-xs text-muted-foreground">alle Materialarten</span>
          )}
          {inactive(series.active)}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditor({ level: "version", seriesId: series.id })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Ausführung
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Bearbeiten"
            onClick={() => setEditor({ level: "series", series })}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Löschen"
            onClick={() =>
              setDeleting({ level: "series", id: series.id, label: series.name })
            }
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
      {series.versions.map(renderVersion)}
    </div>
  );

  const renderManufacturer = (manufacturer: PresetManufacturerNode) => (
    <AccordionItem key={manufacturer.id} value={`m-${manufacturer.id}`}>
      <div className="flex items-center gap-1">
        <AccordionTrigger className="flex-1">
          <span className="flex items-center gap-2">
            {manufacturer.name}
            <span className="text-xs font-normal text-muted-foreground">
              {manufacturer.series.length} Serie(n)
            </span>
            {inactive(manufacturer.active)}
          </span>
        </AccordionTrigger>
        <Button
          variant="ghost"
          size="icon"
          title="Bearbeiten"
          onClick={() => setEditor({ level: "manufacturer", manufacturer })}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Löschen"
          onClick={() =>
            setDeleting({
              level: "manufacturer",
              id: manufacturer.id,
              label: manufacturer.name,
            })
          }
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
      <AccordionContent className="space-y-3 pl-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setEditor({ level: "series", manufacturerId: manufacturer.id })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Neue Serie
        </Button>
        {manufacturer.series.map(renderSeries)}
      </AccordionContent>
    </AccordionItem>
  );

  return (
    <AdminLayout
      title="Preset-Katalog"
      description="Hersteller, Serien, Ausführungen und Größen für alle Benutzer pflegen"
      actions={
        <Button onClick={() => setEditor({ level: "manufacturer" })}>
          <Plus className="mr-2 h-4 w-4" /> Neuer Hersteller
        </Button>
      }
    >
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (tree ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Library className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">Noch keine Presets im Katalog</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Lege einen Hersteller an, darunter eine Serie, eine Ausführung
                und schließlich die Größen mit ihrem Leergewicht.
              </p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {(tree ?? []).map(renderManufacturer)}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <CatalogEditorDialog
        key={editor ? JSON.stringify(editor) : "none"}
        target={editor}
        onClose={() => setEditor(null)}
        onSaved={invalidate}
      />

      <AlertDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleting?.label}“ wird endgültig entfernt. Einträge mit
              Untereinträgen oder mit Materialien, die sie verwenden, lassen
              sich nicht löschen – deaktiviere sie in dem Fall stattdessen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
