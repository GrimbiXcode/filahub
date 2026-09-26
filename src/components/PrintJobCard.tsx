import { Link } from "react-router";
import { Link2 } from "lucide-react";
import { linkHost, type PrintJobStatus } from "@contracts/printJobs";
import { AppearanceSwatch } from "@/components/AppearanceSwatch";
import { Badge } from "@/components/ui/badge";
import { printFileThumbnailUrl, printJobPath } from "@/const";
import { useAppearanceResolver, useSwatchLabel } from "@/lib/appearance";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { cn } from "@/lib/utils";
import type { PrintJobItem } from "@/types";

/** Status als Plakette – gelungen neutral, alles andere fällt auf */
export function PrintStatusBadge({ status }: { status: PrintJobStatus }) {
  const t = useT();
  return (
    <Badge
      variant={status === "success" ? "secondary" : "outline"}
      className={cn(
        status === "failed" && "border-destructive/50 text-destructive",
        status === "cancelled" && "text-muted-foreground"
      )}
    >
      {t.prints.status[status]}
    </Badge>
  );
}

/** Das kleine Farbfeld eines Materials im Druck */
export function PrintMaterialSwatch({
  material,
}: {
  material: PrintJobItem["materials"][number];
}) {
  const resolve = useAppearanceResolver();
  const swatchLabel = useSwatchLabel();
  const appearance = resolve(material.color, material.texture);
  return (
    <AppearanceSwatch
      hex={appearance.hex}
      kind={appearance.kind}
      label={swatchLabel(material.color, material.texture, appearance.hex)}
    />
  );
}

/**
 * Ein Druck als Karte: Titel, Datum, Status, Materialien mit Gramm, Tags und
 * die Hosts der Links. Die ganze Karte ist der Link auf die Detailseite –
 * die Modell-Links stehen erst dort, damit kein Klick versehentlich
 * hinausführt.
 */
export function PrintJobCard({
  job,
  compact = false,
}: {
  job: PrintJobItem;
  /** Für „Letzte Drucke“: ohne Tags und Links */
  compact?: boolean;
}) {
  const t = useT();
  const { formatDate, formatGrams } = useFormat();
  const total = job.materials.reduce((sum, m) => sum + m.grams, 0);
  const hosts = [...new Set(job.links.map(link => linkHost(link.url)))];

  return (
    <Link
      to={printJobPath(job.id)}
      className="flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40"
    >
      {/* Titelbild (seit 4.3.0) – die kleine Vorschau, nicht das Foto */}
      {!compact && job.coverFileId != null && (
        <img
          src={printFileThumbnailUrl(job.coverFileId)}
          alt=""
          loading="lazy"
          className="-mx-3 -mt-3 mb-1 aspect-[4/3] w-[calc(100%+1.5rem)] max-w-none rounded-t-lg object-cover"
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium wrap-break-word">{job.title}</span>
        <PrintStatusBadge status={job.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">{formatDate(job.printedAt)}</span>
        {job.printer && <span>{job.printer}</span>}
        {total > 0 && (
          <span className="font-mono">
            {t.prints.totalGrams({ amount: formatGrams(total) })}
          </span>
        )}
      </div>
      {job.materials.length > 0 && (
        <ul className="flex flex-col gap-1">
          {job.materials.map(material => (
            <li
              key={material.id}
              className="flex min-w-0 items-center gap-2 text-sm"
            >
              <PrintMaterialSwatch material={material} />
              <span className="min-w-0 flex-1 truncate">
                {material.name}
                {material.identifier && (
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                    {material.identifier}
                  </span>
                )}
              </span>
              {material.grams > 0 && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatGrams(material.grams)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!compact && (job.tags.length > 0 || hosts.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {job.tags.map(tag => (
            <Badge key={tag} variant="outline" className="text-xs">
              #{tag}
            </Badge>
          ))}
          {hosts.map(host => (
            <span
              key={host}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            >
              <Link2 className="h-3 w-3" /> {host}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
