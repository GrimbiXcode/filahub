import { useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import {
  PRESET_PROPOSAL_STATUSES,
  PRESET_PROPOSAL_STATUS_LABELS,
  PRESET_SCOPE_LABELS,
  type PresetProposalStatus,
} from "@contracts/presets";
import { AdminLayout } from "@/components/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useFormat } from "@/lib/formatContext";
import { trpc } from "@/lib/trpc";
import type { AdminProposalItem } from "@/types";

const ALL = "__all__";

const STATUS_VARIANT: Record<
  PresetProposalStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "default",
  approved: "secondary",
  rejected: "destructive",
  withdrawn: "outline",
};

/** Vorschlagsinhalt als Feld/Wert-Paare für die Gegenüberstellung */
function payloadRows(payload: unknown): { label: string; value: string }[] {
  if (typeof payload !== "object" || payload === null) return [];
  const p = payload as Record<string, unknown>;
  if (p.kind === "new") {
    const manufacturer = p.manufacturer as { name?: string } | undefined;
    const series = p.series as { name?: string; materialTypes?: string[] } | undefined;
    const version = p.version as { name?: string; spoolMaterial?: string } | undefined;
    const variant = (p.variant ?? {}) as Record<string, unknown>;
    return [
      { label: "Hersteller", value: manufacturer?.name ?? "–" },
      { label: "Serie", value: series?.name ?? "–" },
      {
        label: "Materialarten",
        value: series?.materialTypes?.length
          ? series.materialTypes.join(", ")
          : "alle",
      },
      { label: "Ausführung", value: version?.name ?? "–" },
      { label: "Spulenmaterial", value: version?.spoolMaterial ?? "–" },
      ...Object.entries(variant).map(([key, value]) => ({
        label: key,
        value: value == null ? "–" : String(value),
      })),
    ];
  }
  const patch = (p.patch ?? {}) as Record<string, unknown>;
  return Object.entries(patch).map(([key, value]) => ({
    label: key,
    value: value == null ? "–" : String(value),
  }));
}

export default function AdminProposals() {
  const utils = trpc.useUtils();
  const { formatDate } = useFormat();
  const [status, setStatus] = useState<string>("pending");
  const [detail, setDetail] = useState<AdminProposalItem | null>(null);
  const [rejecting, setRejecting] = useState<AdminProposalItem | null>(null);
  const [reason, setReason] = useState("");

  const { data: proposals, isLoading } = trpc.admin.proposal.list.useQuery({
    status: status === ALL ? undefined : (status as PresetProposalStatus),
    limit: 100,
  });

  const invalidate = () => {
    utils.admin.proposal.list.invalidate();
    utils.preset.tree.invalidate();
    utils.preset.options.invalidate();
  };

  const approve = trpc.admin.proposal.approve.useMutation({
    onSuccess: () => {
      toast.success("Vorschlag übernommen");
      invalidate();
      setDetail(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const reject = trpc.admin.proposal.reject.useMutation({
    onSuccess: () => {
      toast.success("Vorschlag abgelehnt");
      invalidate();
      setRejecting(null);
      setDetail(null);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AdminLayout
      title="Vorschläge"
      description="Community-Vorschläge für den Preset-Katalog prüfen"
      actions={
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Vorschläge</SelectItem>
            {PRESET_PROPOSAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PRESET_PROPOSAL_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (proposals ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">Keine Vorschläge in dieser Ansicht</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Eingereicht</TableHead>
                  <TableHead>Von</TableHead>
                  <TableHead>Art</TableHead>
                  <TableHead>Begründung</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(proposals ?? []).map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setDetail(p)}
                  >
                    <TableCell className="whitespace-nowrap">
                      {formatDate(p.createdAt)}
                    </TableCell>
                    <TableCell>{p.submittedBy?.name ?? "–"}</TableCell>
                    <TableCell>
                      {p.kind === "new"
                        ? "Neuer Eintrag"
                        : `Änderung (${PRESET_SCOPE_LABELS[p.targetType]})`}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-muted-foreground">
                      {p.comment ?? "–"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[p.status]}
                        className="font-normal"
                      >
                        {PRESET_PROPOSAL_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status === "pending" && (
                        <div
                          className="flex justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Übernehmen"
                            disabled={approve.isPending}
                            onClick={() => approve.mutate({ id: p.id })}
                          >
                            <Check className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Ablehnen"
                            onClick={() => {
                              setReason("");
                              setRejecting(p);
                            }}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={detail != null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detail?.kind === "new" ? "Neuer Katalogeintrag" : "Änderungsvorschlag"}
            </DialogTitle>
            <DialogDescription>
              Eingereicht von {detail?.submittedBy?.name ?? "unbekannt"}
              {detail?.comment ? ` · „${detail.comment}“` : ""}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-2 text-sm">
            {payloadRows(detail?.payload).map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
          {detail?.reviewNote && (
            <p className="rounded-md border bg-muted/40 p-3 text-sm">
              Begründung der Moderation: {detail.reviewNote}
            </p>
          )}
          {detail?.status === "pending" && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReason("");
                  setRejecting(detail);
                }}
              >
                Ablehnen
              </Button>
              <Button
                disabled={approve.isPending}
                onClick={() => approve.mutate({ id: detail.id })}
              >
                {approve.isPending ? "Wird übernommen …" : "Übernehmen"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejecting != null}
        onOpenChange={(o) => !o && setRejecting(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vorschlag ablehnen</DialogTitle>
            <DialogDescription>
              Die Begründung sieht die einreichende Person unter „Meine
              Vorschläge“.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="ap-reason">Begründung *</Label>
            <Textarea
              id="ap-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="z. B. „Leergewicht weicht von der Herstellerangabe ab“"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={reject.isPending}
              onClick={() => {
                if (!reason.trim())
                  return toast.error("Bitte eine Begründung für die Ablehnung angeben");
                if (rejecting) reject.mutate({ id: rejecting.id, reason: reason.trim() });
              }}
            >
              {reject.isPending ? "Wird abgelehnt …" : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
