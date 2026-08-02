import { Inbox, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  PRESET_PROPOSAL_STATUS_LABELS,
  PRESET_SCOPE_LABELS,
  type PresetProposalStatus,
} from "@contracts/presets";
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
import { useFormat } from "@/lib/formatContext";
import { trpc } from "@/lib/trpc";

const STATUS_VARIANT: Record<
  PresetProposalStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "default",
  approved: "secondary",
  rejected: "destructive",
  withdrawn: "outline",
};

/** Kurzfassung des Vorschlags für die Übersicht */
function describePayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "–";
  const p = payload as Record<string, unknown>;
  if (p.kind === "new") {
    const manufacturer = (p.manufacturer as { name?: string })?.name ?? "";
    const series = (p.series as { name?: string })?.name ?? "";
    const version = (p.version as { name?: string })?.name ?? "";
    return [manufacturer, series, version].filter(Boolean).join(" · ");
  }
  const patch = (p.patch ?? {}) as Record<string, unknown>;
  return Object.entries(patch)
    .map(([key, value]) => `${key}: ${value ?? "–"}`)
    .join(", ");
}

export function MyPresetProposals() {
  const utils = trpc.useUtils();
  const { formatDate } = useFormat();
  const { data: proposals, isLoading } = trpc.preset.proposals.mine.useQuery();

  const withdraw = trpc.preset.proposals.withdraw.useMutation({
    onSuccess: () => {
      toast.success("Vorschlag zurückgezogen");
      utils.preset.proposals.mine.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if ((proposals ?? []).length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Inbox className="h-10 w-10 text-muted-foreground/50" />
        <p className="font-medium">Noch keine Vorschläge eingereicht</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Über „Als Preset vorschlagen“ bei einem eigenen Rollentyp oder
          „Änderung vorschlagen“ im Katalog kannst du den gemeinsamen Katalog
          verbessern.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Eingereicht</TableHead>
          <TableHead>Art</TableHead>
          <TableHead>Inhalt</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Aktionen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(proposals ?? []).map((p) => (
          <TableRow key={p.id}>
            <TableCell className="whitespace-nowrap">
              {formatDate(p.createdAt)}
            </TableCell>
            <TableCell>
              {p.kind === "new"
                ? "Neuer Eintrag"
                : `Änderung (${PRESET_SCOPE_LABELS[p.targetType]})`}
            </TableCell>
            <TableCell className="max-w-[320px] truncate text-muted-foreground">
              {describePayload(p.payload)}
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <Badge variant={STATUS_VARIANT[p.status]} className="w-fit font-normal">
                  {PRESET_PROPOSAL_STATUS_LABELS[p.status]}
                </Badge>
                {p.reviewNote && (
                  <span className="text-xs text-muted-foreground">{p.reviewNote}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              {p.status === "pending" && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Zurückziehen"
                  onClick={() => withdraw.mutate({ id: p.id })}
                  disabled={withdraw.isPending}
                >
                  <Undo2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
