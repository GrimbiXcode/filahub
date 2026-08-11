import { useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import {
  PRESET_PROPOSAL_STATUSES,
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
import { useT } from "@/lib/i18nContext";
import type { Messages } from "@/messages/de";
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
function payloadRows(
  payload: unknown,
  t: Messages
): { label: string; value: string }[] {
  if (typeof payload !== "object" || payload === null) return [];
  const p = payload as Record<string, unknown>;
  if (p.kind === "new") {
    const manufacturer = p.manufacturer as { name?: string } | undefined;
    const series = p.series as
      { name?: string; materialTypes?: string[] } | undefined;
    const version = p.version as
      { name?: string; containerMaterial?: string } | undefined;
    const variant = (p.variant ?? {}) as Record<string, unknown>;
    return [
      {
        label: t.adminProposals.rowManufacturer,
        value: manufacturer?.name ?? "–",
      },
      { label: t.adminProposals.rowSeries, value: series?.name ?? "–" },
      {
        label: t.adminProposals.rowMaterialTypes,
        value: series?.materialTypes?.length
          ? series.materialTypes.join(", ")
          : "alle",
      },
      { label: t.adminProposals.rowVersion, value: version?.name ?? "–" },
      {
        label: t.adminProposals.rowContainerMaterial,
        value: version?.containerMaterial ?? "–",
      },
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
  const t = useT();
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
      toast.success(t.adminProposals.approved);
      invalidate();
      setDetail(null);
    },
    onError: e => toast.error(e.message),
  });

  const reject = trpc.admin.proposal.reject.useMutation({
    onSuccess: () => {
      toast.success(t.adminProposals.rejected);
      invalidate();
      setRejecting(null);
      setDetail(null);
    },
    onError: e => toast.error(e.message),
  });

  return (
    <AdminLayout
      title={t.adminProposals.title}
      description={t.adminProposals.description}
      actions={
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.adminProposals.allProposals}</SelectItem>
            {PRESET_PROPOSAL_STATUSES.map(s => (
              <SelectItem key={s} value={s}>
                {t.preset.status[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <Card>
        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (proposals ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">{t.adminProposals.emptyTitle}</p>
            </div>
          ) : (
            <>
              {/* Telefon: Karten – die Tabelle hat sechs Spalten */}
              <div className="flex flex-col gap-3 lg:hidden">
                {(proposals ?? []).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDetail(p)}
                    className="rounded-xl border p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {p.kind === "new"
                            ? t.adminProposals.kindNew
                            : t.myProposals.kindChange({
                                scope: t.preset.scope[p.targetType],
                              })}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(p.createdAt)} ·{" "}
                          {p.submittedBy?.name ?? "unbekannt"}
                        </p>
                      </div>
                      <Badge
                        variant={STATUS_VARIANT[p.status]}
                        className="shrink-0 font-normal"
                      >
                        {t.preset.status[p.status]}
                      </Badge>
                    </div>
                    {p.comment && (
                      <p className="mt-2 wrap-break-word text-xs text-muted-foreground">
                        {p.comment}
                      </p>
                    )}
                  </button>
                ))}
              </div>

              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.adminProposals.submitted}</TableHead>
                      <TableHead>{t.adminProposals.from}</TableHead>
                      <TableHead>{t.adminProposals.kind}</TableHead>
                      <TableHead>{t.adminProposals.reason}</TableHead>
                      <TableHead>{t.myProposals.status}</TableHead>
                      <TableHead className="text-right">
                        {t.common.actions}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(proposals ?? []).map(p => (
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
                            ? t.adminProposals.kindNew
                            : t.myProposals.kindChange({
                                scope: t.preset.scope[p.targetType],
                              })}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-muted-foreground">
                          {p.comment ?? "–"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={STATUS_VARIANT[p.status]}
                            className="font-normal"
                          >
                            {t.preset.status[p.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {p.status === "pending" && (
                            <div
                              className="flex justify-end gap-1"
                              onClick={e => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                title={t.adminProposals.approve}
                                disabled={approve.isPending}
                                onClick={() => approve.mutate({ id: p.id })}
                              >
                                <Check className="h-4 w-4 text-emerald-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title={t.adminProposals.reject}
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
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={detail != null} onOpenChange={o => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detail?.kind === "new"
                ? t.adminProposals.detailNew
                : t.adminProposals.detailChange}
            </DialogTitle>
            <DialogDescription>
              {t.adminProposals.submittedBy({
                name: detail?.submittedBy?.name ?? t.adminProposals.unknownUser,
              })}
              {detail?.comment
                ? t.adminProposals.withComment({ comment: detail.comment })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-2 text-sm">
            {payloadRows(detail?.payload, t).map(row => (
              <div key={row.label} className="contents">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
          {detail?.reviewNote && (
            <p className="rounded-md border bg-muted/40 p-3 text-sm">
              {t.adminProposals.moderationNote({ note: detail.reviewNote })}
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
                {t.adminProposals.reject}
              </Button>
              <Button
                disabled={approve.isPending}
                onClick={() => approve.mutate({ id: detail.id })}
              >
                {approve.isPending
                  ? t.adminProposals.approving
                  : t.adminProposals.approve}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejecting != null}
        onOpenChange={o => !o && setRejecting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.adminProposals.rejectTitle}</DialogTitle>
            <DialogDescription>
              Die Begründung sieht die einreichende Person unter „Meine
              Vorschläge“.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="ap-reason">{t.adminProposals.reasonLabel}</Label>
            <Textarea
              id="ap-reason"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={t.adminProposals.reasonPlaceholder}
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
                  return toast.error(t.adminProposals.reasonRequired);
                if (rejecting)
                  reject.mutate({ id: rejecting.id, reason: reason.trim() });
              }}
            >
              {reject.isPending
                ? t.adminProposals.rejecting
                : t.adminProposals.reject}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
