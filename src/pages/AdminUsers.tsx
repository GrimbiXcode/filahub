import { useState } from "react";
import { Ban, Check, Inbox, ShieldCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { BLOCK_REASONS, type BlockReason } from "@contracts/limits";
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
import { Input } from "@/components/ui/input";
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
import { trpc } from "@/lib/trpc";
import type { AdminUnblockRequest, AdminUserEntry } from "@/types";

/**
 * Konten sperren und entsperren, Entsperr-Anträge bescheiden.
 *
 * Aufbau wie `AdminProposals`: eine Liste mit Kartenansicht fürs Telefon und
 * Tabelle ab `lg`, Dialoge am Ende, Rückmeldung über `toast`.
 *
 * Die Telegram-ID steht bewusst nirgends: Die Liste soll zeigen, wer da ist und
 * wie es um ihn steht – die Kennung, mit der er sich anmeldet, gehört nicht
 * dazu (siehe `findUsersForAdmin` in `api/queries/blocking.ts`).
 */
export default function AdminUsers() {
  const t = useT();
  const { formatDateTime } = useFormat();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [blockTarget, setBlockTarget] = useState<AdminUserEntry | null>(null);
  const [blockReason, setBlockReason] = useState<BlockReason>("abuse");
  const [rejectTarget, setRejectTarget] = useState<AdminUnblockRequest | null>(
    null
  );
  const [rejectNote, setRejectNote] = useState("");

  const users = trpc.admin.user.list.useQuery({
    search: search.trim() || undefined,
    limit: 100,
  });
  const requests = trpc.admin.user.unblockRequests.useQuery({
    status: "pending",
    limit: 100,
  });

  /*
    Beide Listen zusammen auffrischen: Eine Sperre ändert die Kontoliste, eine
    angenommene Entsperrung beides – getrennt gedacht bliebe je nach Aktion die
    eine Hälfte der Seite veraltet stehen.
  */
  const invalidate = () => {
    void utils.admin.user.list.invalidate();
    void utils.admin.user.unblockRequests.invalidate();
    void utils.admin.abuse.invalidate();
  };

  const block = trpc.admin.user.block.useMutation({
    onSuccess: () => {
      toast.success(t.adminUsers.blocked);
      setBlockTarget(null);
      invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const unblock = trpc.admin.user.unblock.useMutation({
    onSuccess: () => {
      toast.success(t.adminUsers.unblocked);
      invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const review = trpc.admin.user.reviewUnblockRequest.useMutation({
    onSuccess: () => {
      toast.success(t.adminUsers.reviewed);
      setRejectTarget(null);
      setRejectNote("");
      invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const entries = users.data?.entries ?? [];
  const busy = block.isPending || unblock.isPending || review.isPending;

  return (
    <AdminLayout
      title={t.adminUsers.title}
      description={t.adminUsers.description}
      actions={
        <Badge variant="secondary">
          {t.adminUsers.blockedCount({ count: users.data?.blocked ?? 0 })}
        </Badge>
      }
    >
      <div className="flex flex-col gap-4 sm:gap-6">
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t.adminUsers.searchPlaceholder}
              className="sm:max-w-sm"
            />

            {users.isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {t.adminUsers.empty}
                </p>
              </div>
            ) : (
              <>
                {/* Sechs Spalten sind auf dem Telefon unbedienbar – dort Karten. */}
                <div className="flex flex-col gap-3 lg:hidden">
                  {entries.map(entry => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-2 rounded-md border p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{entry.name ?? "—"}</span>
                        {entry.role === "admin" ? (
                          <Badge variant="outline">
                            {t.adminUsers.roleAdmin}
                          </Badge>
                        ) : null}
                        <StateBadge entry={entry} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {entry.telegramUsername
                          ? `@${entry.telegramUsername}`
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.adminUsers.colCreated}:{" "}
                        {formatDateTime(entry.createdAt)}
                      </p>
                      <BlockButton
                        entry={entry}
                        busy={busy}
                        onBlock={() => setBlockTarget(entry)}
                        onUnblock={() => unblock.mutate({ userId: entry.id })}
                      />
                    </div>
                  ))}
                </div>

                <div className="hidden lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.adminUsers.colName}</TableHead>
                        <TableHead>{t.adminUsers.colTelegram}</TableHead>
                        <TableHead>{t.adminUsers.colRole}</TableHead>
                        <TableHead>{t.adminUsers.colCreated}</TableHead>
                        <TableHead>{t.adminUsers.colLastSignIn}</TableHead>
                        <TableHead>{t.adminUsers.colState}</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">
                            {entry.name ?? "—"}
                          </TableCell>
                          <TableCell>
                            {entry.telegramUsername
                              ? `@${entry.telegramUsername}`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {entry.role === "admin"
                              ? t.adminUsers.roleAdmin
                              : t.adminUsers.roleUser}
                          </TableCell>
                          <TableCell>
                            {formatDateTime(entry.createdAt)}
                          </TableCell>
                          <TableCell>
                            {formatDateTime(entry.lastSignInAt)}
                          </TableCell>
                          <TableCell>
                            <StateBadge entry={entry} />
                          </TableCell>
                          <TableCell className="text-right">
                            <BlockButton
                              entry={entry}
                              busy={busy}
                              onBlock={() => setBlockTarget(entry)}
                              onUnblock={() =>
                                unblock.mutate({ userId: entry.id })
                              }
                            />
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

        <Card>
          <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
            <h2 className="text-base font-medium">
              {t.adminUsers.requestsTitle}
            </h2>
            {requests.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (requests.data?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {t.adminUsers.requestsEmpty}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {requests.data?.map(request => (
                  <div
                    key={request.id}
                    className="flex flex-col gap-3 rounded-md border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {request.userName ?? "—"}
                      </span>
                      {request.userTelegramUsername ? (
                        <span className="text-sm text-muted-foreground">
                          @{request.userTelegramUsername}
                        </span>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(request.createdAt)}
                      </span>
                    </div>
                    {/*
                      `whitespace-pre-wrap`: Der Text ist die Schilderung des
                      Betroffenen und oft mehrzeilig – ohne das stünde sie als
                      ein Block da, in dem niemand die Absätze wiederfindet.
                    */}
                    <p className="whitespace-pre-wrap text-sm">
                      {request.message}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          review.mutate({
                            id: request.id,
                            decision: "approved",
                          })
                        }
                      >
                        <Check className="h-4 w-4" />
                        {t.adminUsers.approve}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setRejectTarget(request)}
                      >
                        <X className="h-4 w-4" />
                        {t.adminUsers.reject}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={blockTarget !== null}
        onOpenChange={open => !open && setBlockTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t.adminUsers.blockTitle({ name: blockTarget?.name ?? "—" })}
            </DialogTitle>
            <DialogDescription>
              {t.adminUsers.blockDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label>{t.adminUsers.blockReasonLabel}</Label>
            <Select
              value={blockReason}
              onValueChange={value => setBlockReason(value as BlockReason)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLOCK_REASONS.map(reason => (
                  <SelectItem key={reason} value={reason}>
                    {t.blocked.reasons[reason]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                blockTarget &&
                block.mutate({ userId: blockTarget.id, reason: blockReason })
              }
            >
              <Ban className="h-4 w-4" />
              {t.adminUsers.blockConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={open => !open && setRejectTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.adminUsers.rejectTitle}</DialogTitle>
            <DialogDescription>{t.adminUsers.rejectHint}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={event => setRejectNote(event.target.value)}
            placeholder={t.adminUsers.rejectPlaceholder}
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={busy || rejectNote.trim() === ""}
              onClick={() =>
                rejectTarget &&
                review.mutate({
                  id: rejectTarget.id,
                  decision: "rejected",
                  note: rejectNote.trim(),
                })
              }
            >
              {t.adminUsers.reject}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function StateBadge({ entry }: { entry: AdminUserEntry }) {
  const t = useT();
  return entry.blockedAt ? (
    <Badge variant="destructive">{t.adminUsers.stateBlocked}</Badge>
  ) : (
    <Badge variant="secondary">{t.adminUsers.stateActive}</Badge>
  );
}

/**
 * Der Knopf fehlt bei Administratoren ganz, statt abgeblendet dazustehen: Der
 * Server lehnt es ohnehin ab (`api/adminRouter.ts`), und ein Knopf, der
 * verlässlich in eine Fehlermeldung läuft, verspricht etwas, das es nicht gibt.
 */
function BlockButton({
  entry,
  busy,
  onBlock,
  onUnblock,
}: {
  entry: AdminUserEntry;
  busy: boolean;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const t = useT();
  if (entry.role === "admin") return null;
  return entry.blockedAt ? (
    <Button size="sm" variant="outline" disabled={busy} onClick={onUnblock}>
      <ShieldCheck className="h-4 w-4" />
      {t.adminUsers.unblock}
    </Button>
  ) : (
    <Button size="sm" variant="outline" disabled={busy} onClick={onBlock}>
      <Ban className="h-4 w-4" />
      {t.adminUsers.block}
    </Button>
  );
}
