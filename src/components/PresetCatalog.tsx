import { useState } from "react";
import { Copy, Eye, EyeOff, Library, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { formatNominalWeight, type PresetScope } from "@contracts/presets";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveScope } from "@/lib/activeScope";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import type { Messages } from "@/messages/de";
import { usePresetNames } from "@/lib/presetNames";
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
  const t = useT();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={e => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={
            hidden
              ? t.presetCatalog.showAria({ label })
              : t.presetCatalog.hideAria({ label })
          }
        >
          {hidden ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {hidden ? t.presetCatalog.show : t.presetCatalog.hide}
      </TooltipContent>
    </Tooltip>
  );
}

function versionSubtitle(
  version: PresetVersionNode,
  formatDate: (value: string | Date | null | undefined) => string,
  t: Messages
) {
  const parts: string[] = [];
  if (version.containerMaterial)
    parts.push(t.preset.containerMaterial[version.containerMaterial]);
  if (version.validFrom)
    parts.push(
      t.presetCatalog.validFrom({ date: formatDate(version.validFrom) })
    );
  if (version.validTo)
    parts.push(t.presetCatalog.validTo({ date: formatDate(version.validTo) }));
  return parts.join(" · ");
}

export function PresetCatalog() {
  const utils = trpc.useUtils();
  const { formatGrams, formatDate } = useFormat();
  /*
    Der Katalog selbst ist global und persönlich – was jemand darin ausblendet,
    geht die Organisation nichts an. **Die Kopie** ist es nicht: Sie wird zu
    einer Gebindeart, und die gehört dem aktiven Bereich. Ohne diesen Wert
    landete sie im Org-Kontext still im privaten Bestand.
  */
  const scope = useActiveScope();
  const t = useT();
  const presetNames = usePresetNames();
  const { data: tree, isLoading } = trpc.preset.tree.useQuery();
  // Der Dialog braucht den fertigen Anzeigenamen; zusammensetzen lässt er
  // sich nur hier, wo Hersteller, Serie und Ausführung im Zugriff sind.
  const [changeFor, setChangeFor] = useState<{
    variant: PresetVariantNode;
    label: string;
  } | null>(null);

  const setHidden = trpc.preset.setHidden.useMutation({
    onSuccess: () => {
      utils.preset.tree.invalidate();
      utils.preset.options.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const copyToOwn = trpc.preset.copyToOwn.useMutation({
    onSuccess: created => {
      toast.success(t.presetCatalog.adopted({ name: created?.name ?? "" }));
      utils.containerType.list.invalidate();
    },
    onError: e => toast.error(e.message),
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
        <p className="font-medium">{t.presetCatalog.emptyTitle}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {t.presetCatalog.emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        {t.presetCatalog.intro}
      </p>

      <Accordion type="multiple" className="w-full">
        {(tree ?? []).map(manufacturer => (
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
                    {t.presetCatalog.seriesCount({
                      count: manufacturer.series.length,
                    })}
                  </span>
                  {manufacturer.hidden && (
                    <Badge variant="outline" className="font-normal">
                      {t.presetCatalog.hidden}
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
              {manufacturer.series.map(series => (
                <div
                  key={series.id}
                  className={cn(
                    "rounded-lg border p-3",
                    series.hidden && !manufacturer.hidden && "opacity-50"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {presetNames.name(series)}
                      </span>
                      {series.materialTypes.map(type => (
                        <Badge
                          key={type}
                          variant="secondary"
                          className="font-normal"
                        >
                          {type}
                        </Badge>
                      ))}
                      {series.materialTypes.length === 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t.presetCatalog.allMaterialTypes}
                        </span>
                      )}
                    </div>
                    <HideToggle
                      hidden={series.hidden}
                      label={presetNames.name(series)}
                      onToggle={() =>
                        toggle("series", series.id, series.hidden)
                      }
                    />
                  </div>

                  {series.versions.map(version => (
                    <div key={version.id} className="mt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span>{presetNames.name(version)}</span>
                          {!version.isCurrent && (
                            <Badge variant="outline" className="font-normal">
                              {t.presetCatalog.olderVersion}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {versionSubtitle(version, formatDate, t)}
                          </span>
                        </div>
                        <HideToggle
                          hidden={version.hidden}
                          label={presetNames.name(version)}
                          onToggle={() =>
                            toggle("version", version.id, version.hidden)
                          }
                        />
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              {t.presetCatalog.nominalWeight}
                            </TableHead>
                            <TableHead>{t.common.tare}</TableHead>
                            <TableHead className="hidden sm:table-cell">
                              {t.presetCatalog.dimensions}
                            </TableHead>
                            <TableHead className="text-right">
                              {t.common.actions}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {version.variants.map(variant => (
                            <TableRow
                              key={variant.id}
                              className={cn(variant.hidden && "opacity-50")}
                            >
                              <TableCell className="font-medium">
                                {formatNominalWeight(variant.nominalWeight)}
                              </TableCell>
                              <TableCell>
                                {formatGrams(variant.tareWeight)}
                              </TableCell>
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
                                          copyToOwn.mutate({
                                            variantId: variant.id,
                                            ...scope,
                                          })
                                        }
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {t.presetCatalog.adopt}
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          setChangeFor({
                                            variant,
                                            label: presetNames.variantLabel({
                                              manufacturer,
                                              series,
                                              version,
                                              nominalWeight:
                                                variant.nominalWeight,
                                            }),
                                          })
                                        }
                                      >
                                        <PencilLine className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {t.proposeChange.title}
                                    </TooltipContent>
                                  </Tooltip>
                                  <HideToggle
                                    hidden={variant.hidden}
                                    label={formatNominalWeight(
                                      variant.nominalWeight
                                    )}
                                    onToggle={() =>
                                      toggle(
                                        "variant",
                                        variant.id,
                                        variant.hidden
                                      )
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
                                {t.presetCatalog.noVariants}
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
        key={changeFor?.variant.id ?? "none"}
        variant={changeFor?.variant ?? null}
        label={changeFor?.label ?? ""}
        open={changeFor != null}
        onOpenChange={open => !open && setChangeFor(null)}
      />
    </>
  );
}
