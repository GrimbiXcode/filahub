import { useState } from "react";
import { Languages, Library, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatNominalWeight } from "@contracts/presets";
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
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { usePresetNames } from "@/lib/presetNames";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@contracts/i18n";
import { missingTranslations, type NameI18n } from "@contracts/presets";
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

/** Sprachcodes und ihre Autonyme – für die Lücken-Abzeichen */
const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map(
  l => l.code
) as readonly LanguageCode[];
const LANGUAGE_LABELS = Object.fromEntries(
  SUPPORTED_LANGUAGES.map(l => [l.code, l.label])
) as Record<LanguageCode, string>;

export default function AdminPresets() {
  const utils = trpc.useUtils();
  const { formatGrams } = useFormat();
  const t = useT();
  const presetNames = usePresetNames();
  const [onlyMissing, setOnlyMissing] = useState(false);

  /**
   * Bei aktivem Filter bleiben nur Serien übrig, denen selbst oder deren
   * Ausführungen eine Übersetzung fehlt – sonst müsste man den ganzen Katalog
   * aufklappen, um die Lücken zu finden.
   */
  const hasGap = (entry: { name: string; nameI18n?: NameI18n | null }) =>
    missingTranslations(entry, LANGUAGE_CODES).length > 0;

  const visibleSeries = (manufacturer: PresetManufacturerNode) =>
    onlyMissing
      ? manufacturer.series.filter(
          series => hasGap(series) || series.versions.some(hasGap)
        )
      : manufacturer.series;
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
      toast.success(t.adminPresets.deleted);
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
        {t.adminPresets.disabled}
      </Badge>
    ) : null;

  /**
   * Abzeichen für jede Sprache ohne Übersetzung. Der Grundname greift zwar als
   * Rückfallebene, aber ohne Hinweis findet man die Lücken nie.
   */
  const translationGaps = (entry: {
    name: string;
    nameI18n?: NameI18n | null;
  }) =>
    missingTranslations(entry, LANGUAGE_CODES).map(code => {
      const label = LANGUAGE_LABELS[code];
      return (
        <Badge
          key={code}
          variant="outline"
          className="border-dashed font-normal text-muted-foreground"
          title={t.adminPresets.missingTranslationTitle({ language: label })}
        >
          <Languages className="mr-1 h-3 w-3" />
          {t.adminPresets.missingTranslation({ language: label })}
        </Badge>
      );
    });

  const renderVariants = (
    version: PresetVersionNode,
    path: { manufacturer: PresetManufacturerNode; series: PresetSeriesNode }
  ) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.adminPresets.nominalWeight}</TableHead>
          <TableHead>{t.common.tare}</TableHead>
          <TableHead className="hidden sm:table-cell">
            {t.adminPresets.dimensions}
          </TableHead>
          <TableHead>{t.adminPresets.origin}</TableHead>
          <TableHead className="text-right">{t.common.actions}</TableHead>
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
            <TableCell className="text-muted-foreground">
              {variant.source}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title={t.common.edit}
                  onClick={() =>
                    setEditor({
                      level: "variant",
                      variant,
                      parentForm: version.form,
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={t.common.delete}
                  onClick={() =>
                    setDeleting({
                      level: "variant",
                      id: variant.id,
                      label: presetNames.variantLabel({
                        manufacturer: path.manufacturer,
                        series: path.series,
                        version,
                        nominalWeight: variant.nominalWeight,
                      }),
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
              {t.adminPresets.noVariants}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  const renderVersion = (
    version: PresetVersionNode,
    path: { manufacturer: PresetManufacturerNode; series: PresetSeriesNode }
  ) => (
    <div key={version.id} className="mt-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{presetNames.name(version)}</span>
          {translationGaps(version)}
          {version.containerMaterial && (
            <Badge variant="secondary" className="font-normal">
              {t.preset.containerMaterial[version.containerMaterial]}
            </Badge>
          )}
          {!version.isCurrent && (
            <Badge variant="outline" className="font-normal">
              {t.adminPresets.discontinued}
            </Badge>
          )}
          {inactive(version.active)}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setEditor({
                level: "variant",
                versionId: version.id,
                parentForm: version.form,
              })
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> {t.adminPresets.addSize}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t.common.edit}
            onClick={() => setEditor({ level: "version", version })}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t.common.delete}
            onClick={() =>
              setDeleting({
                level: "version",
                id: version.id,
                label: presetNames.name(version),
              })
            }
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
      {renderVariants(version, path)}
    </div>
  );

  const renderSeries = (
    series: PresetSeriesNode,
    manufacturer: PresetManufacturerNode
  ) => (
    <div key={series.id} className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{presetNames.name(series)}</span>
          {translationGaps(series)}
          {series.materialTypes.map(type => (
            <Badge key={type} variant="secondary" className="font-normal">
              {type}
            </Badge>
          ))}
          {series.materialTypes.length === 0 && (
            <span className="text-xs text-muted-foreground">
              alle Materialarten
            </span>
          )}
          {inactive(series.active)}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditor({ level: "version", seriesId: series.id })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> {t.adminPresets.addVersion}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t.common.edit}
            onClick={() => setEditor({ level: "series", series })}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t.common.delete}
            onClick={() =>
              setDeleting({
                level: "series",
                id: series.id,
                label: presetNames.name(series),
              })
            }
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
      {series.versions.map(version =>
        renderVersion(version, { manufacturer, series })
      )}
    </div>
  );

  const renderManufacturer = (manufacturer: PresetManufacturerNode) => (
    <AccordionItem key={manufacturer.id} value={`m-${manufacturer.id}`}>
      <div className="flex items-center gap-1">
        <AccordionTrigger className="flex-1">
          <span className="flex items-center gap-2">
            {manufacturer.name}
            <span className="text-xs font-normal text-muted-foreground">
              {t.presetCatalog.seriesCount({
                count: manufacturer.series.length,
              })}
            </span>
            {inactive(manufacturer.active)}
          </span>
        </AccordionTrigger>
        <Button
          variant="ghost"
          size="icon"
          title={t.common.edit}
          onClick={() => setEditor({ level: "manufacturer", manufacturer })}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={t.common.delete}
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
          <Plus className="mr-1 h-3.5 w-3.5" /> {t.adminPresets.newSeries}
        </Button>
        {visibleSeries(manufacturer).map(series =>
          renderSeries(series, manufacturer)
        )}
      </AccordionContent>
    </AccordionItem>
  );

  return (
    <AdminLayout
      title={t.adminPresets.title}
      description={t.adminPresets.description}
      actions={
        <>
          <Button
            variant={onlyMissing ? "secondary" : "outline"}
            className="w-full sm:w-auto"
            aria-pressed={onlyMissing}
            onClick={() => setOnlyMissing(v => !v)}
          >
            <Languages className="mr-2 h-4 w-4" /> {t.adminPresets.onlyMissing}
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => setEditor({ level: "manufacturer" })}
          >
            <Plus className="mr-2 h-4 w-4" /> {t.adminPresets.newManufacturer}
          </Button>
        </>
      }
    >
      <Card>
        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (tree ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Library className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">{t.adminPresets.emptyTitle}</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t.adminPresets.emptyDescription}
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
        onOpenChange={o => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.adminPresets.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.adminPresets.deleteDescription({
                label: deleting?.label ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
