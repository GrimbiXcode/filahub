import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Check, Copy, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { FRIEND_VISIBILITIES, type FriendVisibility } from "@contracts/friends";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { friendInventoryPath } from "@/const";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { FriendshipItem, LoanRequestItem } from "@/types";

/**
 * Freunde, Sichtbarkeit und Ausleih-Vorgänge.
 *
 * Reihenfolge der Karten mit Absicht: erst der eigene Code (den man verteilt),
 * dann das Hinzufügen (wofür man einen fremden braucht), dann was Antwort
 * erwartet, und zuletzt die Liste. Wer die Seite öffnet, will meistens eines
 * der ersten drei.
 */
export default function Friends() {
  const t = useT();
  const utils = trpc.useUtils();

  const { data: friends, isLoading } = trpc.friend.list.useQuery();
  const { data: loans } = trpc.friend.loanRequests.useQuery();

  const [removing, setRemoving] = useState<FriendshipItem | null>(null);

  const invalidate = () => {
    utils.friend.list.invalidate();
    utils.friend.loanRequests.invalidate();
    utils.friend.pendingCount.invalidate();
  };

  const respond = trpc.friend.respond.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(variables.accept ? t.friends.accepted : t.friends.declined);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const remove = trpc.friend.remove.useMutation({
    onSuccess: () => {
      toast.success(t.friends.removed);
      invalidate();
      setRemoving(null);
    },
    onError: e => toast.error(e.message),
  });

  const accepted = (friends ?? []).filter(f => f.status === "accepted");
  const incoming = (friends ?? []).filter(
    f => f.status === "pending" && !f.outgoing
  );
  const outgoing = (friends ?? []).filter(
    f => f.status === "pending" && f.outgoing
  );

  const incomingLoans = (loans ?? []).filter(
    l => !l.outgoing && l.status === "open"
  );
  const outgoingLoans = (loans ?? []).filter(l => l.outgoing);

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.friends.title}
          description={t.friends.description}
        />

        <FriendCodeCard />
        <AddFriendCard onAdded={invalidate} />

        {incoming.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t.friends.incomingTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {incoming.map(friend => (
                <div
                  key={friend.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <FriendName friend={friend} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={respond.isPending}
                      onClick={() =>
                        respond.mutate({ id: friend.id, accept: true })
                      }
                    >
                      <Check className="mr-1 h-4 w-4" />
                      {t.friends.accept}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={respond.isPending}
                      onClick={() =>
                        respond.mutate({ id: friend.id, accept: false })
                      }
                    >
                      <X className="mr-1 h-4 w-4" />
                      {t.friends.decline}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {incomingLoans.length > 0 && <IncomingLoans loans={incomingLoans} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.friends.listTitle}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isLoading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : accepted.length === 0 ? (
              <div className="flex flex-col gap-1 py-4 text-center">
                <p className="font-medium">{t.friends.emptyTitle}</p>
                <p className="text-sm text-muted-foreground">
                  {t.friends.emptyDescription}
                </p>
              </div>
            ) : (
              accepted.map((friend, index) => (
                <div key={friend.id} className="flex flex-col gap-3">
                  {index > 0 && <Separator />}
                  <FriendRow friend={friend} onRemove={setRemoving} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {outgoing.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t.friends.outgoingTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {outgoing.map(friend => (
                <div
                  key={friend.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <FriendName friend={friend} />
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{t.friends.pendingBadge}</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t.friends.removeFriend}
                      onClick={() => setRemoving(friend)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {outgoingLoans.length > 0 && <OutgoingLoans loans={outgoingLoans} />}
      </div>

      <AlertDialog
        open={removing != null}
        onOpenChange={open => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.friends.removeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {removing
                ? t.friends.removeDescription({
                    name: friendLabel(removing),
                  })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removing && remove.mutate({ id: removing.id })}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthLayout>
  );
}

/** `users.name` ist nullable – dann bleibt der Telegram-Name als Rückfall. */
function friendLabel(friend: FriendshipItem): string {
  const name = friend.friendName.trim();
  if (name !== "") return name;
  return friend.friendUsername
    ? `@${friend.friendUsername}`
    : `#${friend.friendId}`;
}

function FriendName({ friend }: { friend: FriendshipItem }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{friendLabel(friend)}</span>
      {friend.friendUsername && friend.friendName.trim() !== "" && (
        <span className="truncate text-xs text-muted-foreground">
          @{friend.friendUsername}
        </span>
      )}
    </div>
  );
}

/**
 * Eine Freundschaft mit **beiden** Richtungen.
 *
 * Getrennt dargestellt, weil sie getrennt entschieden werden: Links steht, was
 * ich zeige – das kann ich ändern. Rechts steht, was ich sehe – das ist die
 * Entscheidung des Freundes und deshalb nur Text, keine Auswahl. Eine einzige
 * Stufe für beide wäre einfacher zu bauen und falsch: Sie ließe den einen über
 * das Lager des anderen bestimmen.
 */
function FriendRow({
  friend,
  onRemove,
}: {
  friend: FriendshipItem;
  onRemove: (friend: FriendshipItem) => void;
}) {
  const t = useT();
  const utils = trpc.useUtils();

  const setVisibility = trpc.friend.setVisibility.useMutation({
    onSuccess: () => {
      toast.success(t.friends.visibilitySaved);
      utils.friend.list.invalidate();
      // Die Freigabe steuert, was in der Suche auftaucht – der zwischengespeicherte
      // Stand wäre sonst bis zum Neuladen falsch.
      utils.friend.searchMaterials.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <FriendName friend={friend} />
        <div className="flex items-center gap-1">
          {friend.sharedWithMe === "full" && (
            <Button size="sm" variant="outline" asChild>
              <Link to={friendInventoryPath(friend.friendId)}>
                {t.friends.openInventory}
              </Link>
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label={t.friends.removeFriend}
            onClick={() => onRemove(friend)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`vis-${friend.id}`}>{t.friends.sharedByMe}</Label>
          <Select
            value={friend.sharedByMe}
            disabled={setVisibility.isPending}
            onValueChange={value =>
              setVisibility.mutate({
                id: friend.id,
                visibility: value as FriendVisibility,
              })
            }
          >
            <SelectTrigger id={`vis-${friend.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FRIEND_VISIBILITIES.map(level => (
                <SelectItem key={level} value={level}>
                  {visibilityLabel(t, level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {visibilityHint(t, friend.sharedByMe)}
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label>{t.friends.sharedWithMe}</Label>
          <div className="flex h-9 items-center">
            <Badge variant="secondary">
              {visibilityLabel(t, friend.sharedWithMe)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.friends.theirChoice}
          </p>
        </div>
      </div>
    </div>
  );
}

type Texts = ReturnType<typeof useT>;

function visibilityLabel(t: Texts, level: FriendVisibility): string {
  if (level === "full") return t.friends.visibilityFull;
  if (level === "search") return t.friends.visibilitySearch;
  return t.friends.visibilityNone;
}

function visibilityHint(t: Texts, level: FriendVisibility): string {
  if (level === "full") return t.friends.visibilityFullHint;
  if (level === "search") return t.friends.visibilitySearchHint;
  return t.friends.visibilityNoneHint;
}

/**
 * Eigener Freundescode.
 *
 * `myCode` ist eine Mutation, weil der erste Aufruf den Code anlegt – der Code
 * entsteht erst, wenn jemand die Seite öffnet. Deshalb wird sie hier beim
 * Aufbau der Karte einmal ausgelöst, nicht per `useQuery`.
 */
function FriendCodeCard() {
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const myCode = trpc.friend.myCode.useMutation({
    onSuccess: data => setCode(data.code),
    onError: e => toast.error(e.message),
  });
  const rotate = trpc.friend.rotateCode.useMutation({
    onSuccess: data => {
      setCode(data.code);
      toast.success(t.friends.codeRotated);
      setConfirmRotate(false);
    },
    onError: e => toast.error(e.message),
  });

  /*
    Einmal beim Betreten der Seite anfordern.

    Im Effekt und nicht während des Renderns: Ein Mutationsaufruf ist eine
    Nebenwirkung, die React beim Verwerfen eines Renders nicht zurücknehmen
    kann. Der Ref hält den Aufruf bei doppelt ausgeführten Effekten
    (`StrictMode`) bei einem – dasselbe Muster wie `markSeenOnMount` in
    `useReleaseNotes`.
  */
  const requested = useRef(false);
  const { mutate: requestCode } = myCode;
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    requestCode();
  }, [requestCode]);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t.friends.codeCopied);
    } catch {
      // Ohne Berechtigung für die Zwischenablage bleibt der Code lesbar auf
      // dem Bildschirm – eine Fehlermeldung hülfe hier nicht weiter.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.friends.myCodeTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {code ? (
            <code className="rounded-md bg-muted px-3 py-2 font-mono text-lg tracking-wider">
              {code}
            </code>
          ) : (
            <Skeleton className="h-11 w-44" />
          )}
          <Button variant="outline" onClick={copy} disabled={!code}>
            <Copy className="mr-1 h-4 w-4" />
            {t.friends.copyCode}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirmRotate(true)}
            disabled={!code}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            {t.friends.rotateCode}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t.friends.myCodeHint}</p>
      </CardContent>

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.friends.rotateCodeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.friends.rotateCodeDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => rotate.mutate()}>
              {t.friends.rotateCode}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AddFriendCard({ onAdded }: { onAdded: () => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");

  const request = trpc.friend.request.useMutation({
    onSuccess: result => {
      if (result.notified) toast.success(t.friends.requestSent);
      else toast.warning(t.friends.requestSentUnreachable);
      setCode("");
      setUsername("");
      onAdded();
    },
    onError: e => toast.error(e.message),
  });

  /*
    Der Server verlangt genau eines von beiden. Welches gewinnt, entscheidet
    hier die Eingabe: Wer einen Code eingetippt hat, meint den Code.
  */
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) request.mutate({ code: code.trim() });
    else if (username.trim()) request.mutate({ username: username.trim() });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.friends.addTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="friend-code">{t.friends.codeLabel}</Label>
              <Input
                id="friend-code"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder={t.friends.codePlaceholder}
                autoComplete="off"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="friend-username">{t.friends.usernameLabel}</Label>
              <Input
                id="friend-username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={t.friends.usernamePlaceholder}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={request.isPending || (!code.trim() && !username.trim())}
            >
              <UserPlus className="mr-1 h-4 w-4" />
              {t.friends.sendRequest}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t.friends.addHint}</p>
        </form>
      </CardContent>
    </Card>
  );
}

function IncomingLoans({ loans }: { loans: LoanRequestItem[] }) {
  const t = useT();
  const utils = trpc.useUtils();

  const respond = trpc.friend.respondLoan.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(variables.accept ? t.loan.accepted : t.loan.declined);
      utils.friend.loanRequests.invalidate();
      utils.friend.pendingCount.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.loan.incomingTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loans.map(loan => (
          <div key={loan.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {loan.materialName}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {t.loan.fromLabel({ name: loan.counterpartName })}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ id: loan.id, accept: true })}
                >
                  {t.loan.accept}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ id: loan.id, accept: false })}
                >
                  {t.loan.decline}
                </Button>
              </div>
            </div>
            {loan.message && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                {loan.message}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OutgoingLoans({ loans }: { loans: LoanRequestItem[] }) {
  const t = useT();
  const utils = trpc.useUtils();

  const withdraw = trpc.friend.withdrawLoan.useMutation({
    onSuccess: () => {
      toast.success(t.loan.withdrawn);
      utils.friend.loanRequests.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const statusLabel = (status: LoanRequestItem["status"]) => {
    if (status === "accepted") return t.loan.statusAccepted;
    if (status === "declined") return t.loan.statusDeclined;
    if (status === "withdrawn") return t.loan.statusWithdrawn;
    return t.loan.statusOpen;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.loan.outgoingTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loans.map(loan => (
          <div
            key={loan.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{loan.materialName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {t.loan.toLabel({ name: loan.counterpartName })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={loan.status === "accepted" ? "default" : "secondary"}
              >
                {statusLabel(loan.status)}
              </Badge>
              {loan.status === "open" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={withdraw.isPending}
                  onClick={() => withdraw.mutate({ id: loan.id })}
                >
                  {t.loan.withdraw}
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
