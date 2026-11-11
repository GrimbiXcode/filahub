import { useEffect, useState } from "react";
import {
  Cable,
  Check,
  ChevronDown,
  Copy,
  Download,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Scissors,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  BRIDGE_IMAGE,
  BRIDGE_OFFLINE_AFTER_SECONDS,
  isPrivateAddress,
  normalizePrinterHost,
  type PrusaLinkAuthKind,
} from "@contracts/bridge";
import { roleAllows } from "@contracts/organizations";
import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { Switch } from "@/components/ui/switch";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useFormat } from "@/lib/formatContext";
import { formKeys } from "@/lib/formKeyboard";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { BridgePrinterItem, ConnectionEntry } from "@/types";

/**
 * Verbindungen (seit 4.7.0): API-Schlüssel für das PrusaSlicer-Skript und die
 * Drucker-Brücke. Eine Brücke wird mit **einem** Befehl gestartet; alles
 * Weitere – Drucker, Adressen, Zugang – steht hier, und die Brücke meldet
 * zurück, ob sie die Drucker erreicht (Diagnose je Drucker, Protokoll).
 */

type Kind = "bridge" | "slicer";

/** Der Startbefehl der Brücke – eine Zeile, damit er in jeder Shell läuft */
function bridgeCommand(token: string): string {
  return `docker run -d --name filahub-bridge --restart unless-stopped -v filahub-bridge:/data -e FILAHUB_URL=${window.location.origin} -e FILAHUB_TOKEN=${token} ${BRIDGE_IMAGE}`;
}

/** Sekündlich genug für „online“ und „vor x Minuten“ */
function useNow(intervalMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function Connections() {
  const t = useT();
  const scope = useActiveScope();
  const role = useScopeRole();
  const canCreate = roleAllows(role, "weigher");
  const { data, isLoading } = trpc.connection.list.useQuery(scope, {
    // Die Brücke meldet alle paar Sekunden – die Diagnose soll mitlaufen
    refetchInterval: 5_000,
  });
  const [createOpen, setCreateOpen] = useState(false);

  const bridges = (data ?? []).filter(c => c.kind === "bridge");
  const slicers = (data ?? []).filter(c => c.kind === "slicer");

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.connections.title}
          description={t.connections.description}
          actions={
            canCreate && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t.connections.add}
              </Button>
            )
          }
        />

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (data ?? []).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Cable className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">{t.connections.empty}</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t.connections.emptyHint}
              </p>
              {canCreate && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t.connections.add}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {bridges.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {t.connections.sectionBridges}
                </h2>
                {bridges.map(bridge => (
                  <BridgeCard key={bridge.id} bridge={bridge} />
                ))}
              </section>
            )}
            {slicers.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {t.connections.sectionSlicer}
                </h2>
                <Card>
                  <CardContent className="divide-y p-0">
                    {slicers.map(slicer => (
                      <SlicerRow key={slicer.id} token={slicer} />
                    ))}
                  </CardContent>
                </Card>
              </section>
            )}
          </>
        )}
      </div>
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------
// Anlegen
// ---------------------------------------------------------------------------

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const scope = useActiveScope();
  const utils = trpc.useUtils();
  const [kind, setKind] = useState<Kind>("bridge");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ kind: Kind; token: string } | null>(
    null
  );

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind("bridge");
      setName("");
      setCreated(null);
    }
  }

  const create = trpc.connection.create.useMutation({
    onSuccess: ({ token }) => {
      setCreated({ kind, token });
      utils.connection.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{t.connections.createdTitle}</DialogTitle>
              <DialogDescription className="text-amber-600 dark:text-amber-400">
                {t.connections.once}
              </DialogDescription>
            </DialogHeader>
            {created.kind === "bridge" ? (
              <BridgeInstructions token={created.token} />
            ) : (
              <SlicerInstructions token={created.token} />
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                {t.connections.done}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            {...formKeys}
            onSubmit={e => {
              e.preventDefault();
              if (!name.trim()) return;
              create.mutate({ ...scope, kind, name: name.trim() });
            }}
          >
            <DialogHeader>
              <DialogTitle>{t.connections.add}</DialogTitle>
              <DialogDescription>{t.connections.kindLabel}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["bridge", "slicer"] as const).map(option => {
                const Icon = option === "bridge" ? Printer : Scissors;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    aria-pressed={kind === option}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                      kind === option && "border-primary ring-1 ring-primary"
                    )}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4" />
                      {t.connections.kinds[option].title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.connections.kinds[option].text}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="conn-name">{t.connections.nameLabel}</Label>
              <Input
                id="conn-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t.connections.namePlaceholder[kind]}
                maxLength={100}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={create.isPending || !name.trim()}>
                {t.connections.create}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CopyBlock({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-md border bg-muted/50">
      <pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
        {text}
      </pre>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="absolute top-1.5 right-1.5 h-8 w-8"
        aria-label={copied ? t.connections.copied : t.connections.copy}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2_000);
            },
            () => undefined
          );
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function BridgeInstructions({ token }: { token: string }) {
  const t = useT();
  return (
    <div className="grid gap-3 text-sm">
      <p>1. {t.connections.bridgeStep1}</p>
      <CopyBlock text={bridgeCommand(token)} />
      <p>2. {t.connections.bridgeStep2}</p>
    </div>
  );
}

function SlicerInstructions({ token }: { token: string }) {
  const t = useT();
  const config = JSON.stringify(
    { url: window.location.origin, token },
    null,
    2
  );
  return (
    <div className="grid gap-3 text-sm">
      <p>1. {t.connections.slicerStep1}</p>
      <Button asChild variant="outline" className="justify-self-start">
        <a href="/tools/filahub-import.py" download="filahub-import.py">
          <Download className="mr-1.5 h-4 w-4" />
          {t.connections.downloadScript}
        </a>
      </Button>
      <p>2. {t.connections.slicerStep2}</p>
      <ul className="text-xs text-muted-foreground">
        <li className="font-mono">{t.connections.slicerPathUnix}</li>
        <li className="font-mono">{t.connections.slicerPathWindows}</li>
      </ul>
      <CopyBlock text={config} />
      <p>3. {t.connections.slicerStep3}</p>
      <CopyBlock text="/usr/bin/env python3 /home/USER/filahub-import.py" />
      <CopyBlock
        text={
          '"C:\\Program Files\\Python313\\python.exe" "C:\\Users\\USER\\filahub-import.py"'
        }
      />
      <p className="text-xs text-muted-foreground">
        {t.connections.slicerNote}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brücke
// ---------------------------------------------------------------------------

function BridgeCard({ bridge }: { bridge: ConnectionEntry }) {
  const t = useT();
  const role = useScopeRole();
  const now = useNow();
  const { formatDateTime } = useFormat();
  const canManage = bridge.mine || roleAllows(role, "admin");
  const [printerDialog, setPrinterDialog] = useState<
    { mode: "add" } | { mode: "edit"; printer: BridgePrinterItem } | null
  >(null);
  const seenAt = bridge.bridgeStatusAt ? new Date(bridge.bridgeStatusAt) : null;
  const online =
    seenAt != null &&
    now - seenAt.getTime() < BRIDGE_OFFLINE_AFTER_SECONDS * 1000;
  const status = bridge.bridgeStatus;

  return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="px-4 sm:px-6">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Printer className="h-4 w-4 text-muted-foreground" />
            <span className="wrap-anywhere">{bridge.name}</span>
            <Badge
              variant={online ? "default" : "outline"}
              className={cn(
                online && "bg-emerald-600 text-white hover:bg-emerald-600"
              )}
            >
              {seenAt == null
                ? t.connections.bridge.never
                : online
                  ? t.connections.bridge.online
                  : t.connections.bridge.offline}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {[
              status
                ? t.connections.bridge.version({ version: status.version })
                : null,
              seenAt
                ? t.connections.bridge.lastSeen({
                    when: formatDateTime(seenAt),
                  })
                : null,
              !bridge.mine && bridge.ownerName
                ? t.connections.owner({ name: bridge.ownerName })
                : null,
              <span key="prefix" className="font-mono">
                {bridge.prefix}…
              </span>,
            ]
              .filter(Boolean)
              .flatMap((part, i) => (i === 0 ? [part] : [" · ", part]))}
          </p>
          {status && status.queued > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t.connections.bridge.queued({ count: status.queued })}
            </p>
          )}
        </div>
        {canManage && (
          <CardAction className="flex gap-1 max-sm:-mr-1.5">
            <RenameButton token={bridge} />
            <RevokeButton token={bridge} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4 sm:px-6">
        {seenAt == null && (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {t.connections.bridge.neverHint}
          </p>
        )}
        {seenAt != null && !online && (
          <p className="rounded-md border border-amber-500/40 p-3 text-sm text-amber-700 dark:text-amber-300">
            {t.connections.bridge.offlineHint}
          </p>
        )}

        {bridge.printers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.connections.bridge.noPrinters}
          </p>
        ) : (
          <div className="flex flex-col divide-y rounded-md border">
            {bridge.printers.map(printer => (
              <PrinterRow
                key={printer.id}
                bridge={bridge}
                printer={printer}
                canManage={canManage}
                onEdit={() => setPrinterDialog({ mode: "edit", printer })}
              />
            ))}
          </div>
        )}

        {canManage && (
          <Button
            variant="outline"
            size="sm"
            className="self-stretch sm:self-start"
            onClick={() => setPrinterDialog({ mode: "add" })}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t.connections.bridge.addPrinter}
          </Button>
        )}

        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
            {t.connections.bridge.log}
          </CollapsibleTrigger>
          <CollapsibleContent>
            {status && status.log.length > 0 ? (
              <ol className="mt-2 max-h-64 overflow-y-auto rounded-md border bg-muted/50 p-2 font-mono text-[11px] leading-relaxed">
                {[...status.log].reverse().map((line, i) => (
                  <li
                    key={`${line.at}-${i}`}
                    className={cn(
                      "wrap-anywhere",
                      line.level === "error" && "text-destructive",
                      line.level === "warn" &&
                        "text-amber-700 dark:text-amber-300"
                    )}
                  >
                    {formatDateTime(new Date(line.at))} {line.message}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {t.connections.bridge.logEmpty}
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
      {printerDialog && (
        <PrinterDialog
          bridge={bridge}
          printer={printerDialog.mode === "edit" ? printerDialog.printer : null}
          onClose={() => setPrinterDialog(null)}
        />
      )}
    </Card>
  );
}

/** Auf dem Telefon nur das Symbol: die Beschriftung nähme dem Namen die Zeile. */
const COMPACT_BUTTON = "max-sm:size-8 max-sm:px-0";

const STATE_TONE: Record<string, string> = {
  ok: "bg-emerald-600 text-white hover:bg-emerald-600",
  pending: "",
};

function PrinterRow({
  bridge,
  printer,
  canManage,
  onEdit,
}: {
  bridge: ConnectionEntry;
  printer: BridgePrinterItem;
  canManage: boolean;
  onEdit: () => void;
}) {
  const t = useT();
  const scope = useActiveScope();
  const utils = trpc.useUtils();
  const { formatDateTime, formatPercent } = useFormat();
  const status = printer.status;
  const state = !printer.enabled ? null : (status?.state ?? "pending");
  const help =
    state === "unauthorized"
      ? t.connections.printer.unauthorizedHelp[printer.authKind]
      : state
        ? t.connections.printer.help[state]
        : "";
  const test = trpc.connection.testPrinter.useMutation({
    onSuccess: () => {
      toast.success(t.connections.printer.testQueued);
      utils.connection.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const remove = trpc.connection.removePrinter.useMutation({
    onSuccess: () => {
      toast.success(t.connections.printer.removed);
      utils.connection.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const testing = printer.testRequestedAt != null;
  const info = status?.info;
  const job = status?.job;

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-2">
        <span className="font-medium wrap-anywhere">{printer.name}</span>
        <span className="font-mono text-xs text-muted-foreground wrap-anywhere">
          {printer.host}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {state ? (
          <Badge
            variant={state === "ok" ? "default" : "outline"}
            className={cn(
              STATE_TONE[state] ??
                "border-destructive/50 text-destructive dark:text-red-400"
            )}
          >
            {t.connections.printer.state[state]}
          </Badge>
        ) : (
          <Badge variant="outline">{t.connections.printer.paused}</Badge>
        )}
        {state === "ok" && status?.printerState && (
          <Badge variant="secondary">
            {t.connections.printer.printerState[status.printerState]}
          </Badge>
        )}
        {status?.httpStatus != null && state !== "ok" && (
          <span className="font-mono text-xs text-muted-foreground">
            {t.connections.printer.httpStatus({ status: status.httpStatus })}
          </span>
        )}
      </div>

      {job?.fileName && (
        <p className="text-xs wrap-anywhere">
          {t.connections.printer.job({
            file: job.fileName,
            percent: formatPercent(Math.round(job.progressPercent ?? 0)),
          })}
        </p>
      )}
      {printer.secretUnreadable && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t.connections.printer.secretUnreadable}
        </p>
      )}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {status?.detail && state !== "ok" && (
        <p className="font-mono text-[11px] text-muted-foreground wrap-anywhere">
          {status.detail}
        </p>
      )}
      {status?.metaWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {status.metaWarning}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground wrap-anywhere">
        {[
          info?.model,
          info?.firmware
            ? t.connections.printer.firmware({ firmware: info.firmware })
            : null,
          info?.serial
            ? t.connections.printer.serial({ serial: info.serial })
            : null,
          printer.statusAt
            ? t.connections.printer.checked({
                when: formatDateTime(new Date(printer.statusAt)),
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {canManage && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={testing || test.isPending || !printer.enabled}
            onClick={() =>
              test.mutate({ ...scope, tokenId: bridge.id, id: printer.id })
            }
          >
            <RefreshCw
              className={cn("mr-1.5 h-3.5 w-3.5", testing && "animate-spin")}
            />
            {testing
              ? t.connections.printer.testing
              : t.connections.printer.test}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={COMPACT_BUTTON}
            aria-label={t.connections.printer.edit}
            title={t.connections.printer.edit}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {t.connections.printer.edit}
            </span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={COMPACT_BUTTON}
            aria-label={t.connections.printer.remove}
            title={t.connections.printer.remove}
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  t.connections.printer.removeConfirm({ name: printer.name })
                )
              )
                remove.mutate({ ...scope, tokenId: bridge.id, id: printer.id });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {t.connections.printer.remove}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

function PrinterDialog({
  bridge,
  printer,
  onClose,
}: {
  bridge: ConnectionEntry;
  printer: BridgePrinterItem | null;
  onClose: () => void;
}) {
  const t = useT();
  const scope = useActiveScope();
  const utils = trpc.useUtils();
  const [name, setName] = useState(printer?.name ?? "");
  const [host, setHost] = useState(
    printer?.host.replace(/^http:\/\//, "") ?? ""
  );
  const [authKind, setAuthKind] = useState<PrusaLinkAuthKind>(
    printer?.authKind ?? "api_key"
  );
  const [username, setUsername] = useState(printer?.username ?? "maker");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(printer?.enabled ?? true);

  const normalized = host.trim() ? normalizePrinterHost(host) : null;
  const publicHost =
    normalized != null && !isPrivateAddress(new URL(normalized).hostname);

  const onSuccess = () => {
    toast.success(t.connections.printer.saved);
    utils.connection.list.invalidate();
    onClose();
  };
  const add = trpc.connection.addPrinter.useMutation({
    onSuccess,
    onError: e => toast.error(e.message),
  });
  const update = trpc.connection.updatePrinter.useMutation({
    onSuccess,
    onError: e => toast.error(e.message),
  });
  const pending = add.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalized) return toast.error(t.connections.printer.hostInvalid);
    const data = {
      ...scope,
      tokenId: bridge.id,
      name: name.trim(),
      host: normalized,
      authKind,
      username: authKind === "digest" ? username.trim() || "maker" : null,
      enabled,
    };
    if (printer)
      update.mutate({
        ...data,
        id: printer.id,
        ...(secret ? { secret } : {}),
      });
    else add.mutate({ ...data, secret: secret || null });
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {printer
              ? t.connections.printer.editTitle
              : t.connections.printer.addTitle}
          </DialogTitle>
          <DialogDescription>
            {t.connections.printer.description}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" {...formKeys}>
          <div className="grid gap-2">
            <Label htmlFor="pr-name">{t.connections.printer.nameLabel}</Label>
            <Input
              id="pr-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.connections.printer.namePlaceholder}
              maxLength={100}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pr-host">{t.connections.printer.hostLabel}</Label>
            <Input
              id="pr-host"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder={t.connections.printer.hostPlaceholder}
              className="font-mono"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
            />
            <p
              className={cn(
                "text-xs",
                host.trim() && !normalized
                  ? "text-destructive"
                  : publicHost
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
              )}
            >
              {host.trim() && !normalized
                ? t.connections.printer.hostInvalid
                : publicHost
                  ? t.connections.printer.hostPublic
                  : t.connections.printer.hostHint}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pr-auth">{t.connections.printer.authLabel}</Label>
            <Select
              value={authKind}
              onValueChange={value => setAuthKind(value as PrusaLinkAuthKind)}
            >
              <SelectTrigger id="pr-auth" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="api_key">
                  {t.connections.printer.auth.api_key}
                </SelectItem>
                <SelectItem value="digest">
                  {t.connections.printer.auth.digest}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t.connections.printer.authHint[authKind]}
            </p>
          </div>
          {authKind === "digest" && (
            <div className="grid gap-2">
              <Label htmlFor="pr-user">
                {t.connections.printer.usernameLabel}
              </Label>
              <Input
                id="pr-user"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoCapitalize="off"
                autoComplete="off"
                maxLength={100}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="pr-secret">
              {t.connections.printer.secretLabel[authKind]}
            </Label>
            <Input
              id="pr-secret"
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder={
                printer?.hasSecret ? t.connections.printer.secretKeep : ""
              }
              autoComplete="new-password"
              className="font-mono"
              maxLength={200}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            {t.connections.printer.enabledLabel}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// PrusaSlicer und Entziehen
// ---------------------------------------------------------------------------

function SlicerRow({ token }: { token: ConnectionEntry }) {
  const t = useT();
  const role = useScopeRole();
  const { formatDateTime } = useFormat();
  const canManage = token.mine || roleAllows(role, "admin");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-medium">
          <Scissors className="h-4 w-4 text-muted-foreground" />
          <span className="wrap-anywhere">{token.name}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          <span className="font-mono">{token.prefix}…</span> ·{" "}
          {token.lastUsedAt
            ? t.connections.lastUsed({
                when: formatDateTime(new Date(token.lastUsedAt)),
              })
            : t.connections.neverUsed}
          {!token.mine && token.ownerName
            ? ` · ${t.connections.owner({ name: token.ownerName })}`
            : ""}
        </span>
      </div>
      {canManage && (
        <div className="flex gap-1">
          <RenameButton token={token} />
          <RevokeButton token={token} />
        </div>
      )}
    </div>
  );
}

function RenameButton({ token }: { token: ConnectionEntry }) {
  const t = useT();
  const scope = useActiveScope();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(token.name);
  const rename = trpc.connection.rename.useMutation({
    onSuccess: () => {
      toast.success(t.connections.renamed);
      utils.connection.list.invalidate();
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={COMPACT_BUTTON}
        aria-label={t.connections.rename}
        title={t.connections.rename}
        onClick={() => {
          setName(token.name);
          setOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t.connections.rename}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={e => {
              e.preventDefault();
              if (!name.trim() || rename.isPending) return;
              rename.mutate({ ...scope, id: token.id, name: name.trim() });
            }}
          >
            <DialogHeader>
              <DialogTitle>{t.connections.renameTitle}</DialogTitle>
              <DialogDescription>{t.connections.renameText}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`rename-${token.id}`}>
                {t.connections.nameLabel}
              </Label>
              <Input
                id={`rename-${token.id}`}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t.connections.namePlaceholder[token.kind]}
                maxLength={100}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={rename.isPending || !name.trim()}>
                {rename.isPending ? t.common.saving : t.common.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RevokeButton({ token }: { token: ConnectionEntry }) {
  const t = useT();
  const scope = useActiveScope();
  const utils = trpc.useUtils();
  const revoke = trpc.connection.revoke.useMutation({
    onSuccess: () => {
      toast.success(t.connections.revoked);
      utils.connection.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <Button asChild size="sm" variant="ghost" className={COMPACT_BUTTON}>
        <AlertDialogTrigger
          aria-label={t.connections.revoke}
          title={t.connections.revoke}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t.connections.revoke}</span>
        </AlertDialogTrigger>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.connections.revokeTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.connections.revokeText}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => revoke.mutate({ ...scope, id: token.id })}
          >
            {t.connections.revoke}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
