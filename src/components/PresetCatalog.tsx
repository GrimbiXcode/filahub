import { useState } from "react";
import { Copy, Eye, EyeOff, Library, PencilLine } from "lucide-react";
import { toast } from "sonner";
import {
  SPOOL_MATERIAL_LABELS,
  formatNominalWeight,
  type PresetScope,
} from "@contracts/presets";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFormat } from "@/lib/formatContext";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import type { PresetVariantNode, PresetVersionNode } from "@/types";
import { ProposeChangeDialog } from "./ProposeChangeDialog";

/** Ein-/Ausblenden-Schalter für eine Katalogebene */
function HideToggle({
  hidden,
  onToggle,
  label,
}: {
  hidden: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={hidden ? `${label} einblenden` : `${label} ausblenden`}
        >
          {hidden ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {hidden ? "Wieder einblenden" : "Für mich ausblenden"}
      </TooltipContent>
    </Tooltip>
  );
}

function versionSubtitle(
  version: PresetVersionNode,
  formatDate: (value: string | Date | null | undefined) => string,
) {
  const parts: string[] = [];
  if (version.spoolMaterial) parts.push(SPOOL_MATERIAL_LABELS[version.spoolMaterial]);
  if (version.validFrom) parts.push(`ab ${formatDate(version.validFrom)}`);
  if (version.validTo) parts.push(`bis ${formatDate(version.validTo)}`);
  return parts.join(" · ");
}

export function PresetCatalog() {
  const utils = trpc.useUtils();
  const { formatGrams, formatDate } = useFormat();
  const { data: tree, isLoading } = trpc.preset.tree.useQuery();
  const [changeFor, setChangeFor] = useState<PresetVariantNode | null>(null);

  const setHidden = trpc.preset.setHidden.useMutation({
    onSuccess: () => {
      utils.preset.tree.invalidate();
      utils.preset.options.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const copyToOwn = trpc.preset.copyToOwn.useMutation({
    onSuccess: (created) => {
      toast.success(`„${created?.name}“ als eigener Rollentyp übernommen`);
      utils.spoolType.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggle = (scope: PresetScope, refId: number, hidden: boolean) =>
    setHidden.mutate({ scope, refId, hidden: !hidden });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if ((tree ?? []).length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Library className="h-10 w-10 text-muted-foreground/50" />
        <p className="font-medium">Der Preset-Katalog ist noch leer</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Sobald Hersteller und Spulen hinterlegt sind, kannst du sie hier
          auswählen – das Leergewicht wird dann automatisch übernommen.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Vorkonfigurierte Rollen. Was du hier ausblendest, verschwindet aus deiner
        Auswahl beim Material – bereits zugewiesene Rollen bleiben erhalten.
        Über „Übernehmen“ wird aus einem Preset ein eigener, frei
        bearbeitbarer Rollentyp.
      </p>

      <Accordion type="multiple" className="w-full">
        {(tree ?? []).map((manufacturer) => (
          <AccordionItem
            key={manufacturer.id}
            value={`m-${manufacturer.id}`}
            className={cn(manufacturer.hidden && "opacity-50")}
          >
            <div className="flex items-center gap-1">
              <AccordionTrigger className="flex-1">
                <span className="flex items-center gap-2">
                  {manufacturer.name}
                  <span className="text-xs font-normal text-muted-foreground">
                    {manufacturer.series.length} Serie(n)
                  </span>
                  {manufacturer.hidden && (
                    <Badge variant="outline" className="font-normal">
                      ausgeblendet
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>
              <HideToggle
                hidden={manufacturer.hidden}
                label={manufacturer.name}
                onToggle={() =>
                  toggle("manufacturer", manufacturer.id, manufacturer.hidden)
                }
              />
            </div>
            <AccordionContent className="space-y-4 pl-2">
              {manufacturer.series.map((series) => (
                <div
                  key={series.id}
                  className={cn(
                    "rounded-lg border p-3",
                    series.hidden && !manufacturer.hidden && "opacity-50",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{series.name}</span>
                      {series.materialTypes.map((type) => (
                        <Badge key={type} variant="secondary" className="font-normal">
                          {type}
                        </Badge>
                      ))}
                      {series.materialTypes.length === 0 && (
                        <span className="text-xs text-muted-foreground">
                          alle Materialarten
                        </span>
                      )}
                    </div>
                    <HideToggle
                      hidden={series.hidden}
                      label={series.name}
                      onToggle={() => toggle("series", series.id, series.hidden)}
                    />
                  </div>

                  {series.versions.map((version) => (
                    <div key={version.id} className="mt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span>{version.name}</span>
                          {!version.isCurrent && (
                            <Badge variant="outline" className="font-normal">
                              ältere Ausführung
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {versionSubtitle(version, formatDate)}
                          </span>
                        </div>
                        <HideToggle
                          hidden={version.hidden}
                          label={version.name}
                          onToggle={() => toggle("version", version.id, version.hidden)}
                        />
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nenngewicht</TableHead>
                            <TableHead>Leergewicht</TableHead>
                            <TableHead className="hidden sm:table-cell">
                              Abmessungen (Ø × Breite × Bohrung)
                            </TableHead>
                            <TableHead className="text-right">Aktionen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {version.variants.map((variant) => (
                            <TableRow
                              key={variant.id}
                              className={cn(variant.hidden && "opacity-50")}
                            >
                              <TableCell className="font-medium">
                                {formatNominalWeight(variant.nominalWeight)}
                              </TableCell>
                              <TableCell>{formatGrams(variant.tareWeight)}</TableCell>
                              <TableCell className="hidden text-muted-foreground sm:table-cell">
                                {variant.outerDiameterMm
                                  ? `${variant.outerDiameterMm} × ${variant.widthMm ?? "?"} × ${variant.boreDiameterMm ?? "?"} mm`
                                  : "–"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={copyToOwn.isPending}
                                        onClick={() =>
                                          copyToOwn.mutate({ variantId: variant.id })
                                        }
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Als eigenen Rollentyp übernehmen
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setChangeFor(variant)}
                                      >
                                        <PencilLine className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Änderung vorschlagen</TooltipContent>
                                  </Tooltip>
                                  <HideToggle
                                    hidden={variant.hidden}
                                    label={formatNominalWeight(variant.nominalWeight)}
                                    onToggle={() =>
                                      toggle("variant", variant.id, variant.hidden)
                                    }
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {version.variants.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                className="text-sm text-muted-foreground"
                              >
                                Für diese Ausführung ist noch keine Größe hinterlegt.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <ProposeChangeDialog
        key={changeFor?.id ?? "none"}
        variant={changeFor}
        open={changeFor != null}
        onOpenChange={(open) => !open && setChangeFor(null)}
      />
    </>
  );
}
