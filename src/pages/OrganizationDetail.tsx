import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Copy, LogOut, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  JOINABLE_ROLES,
  ORGANIZATION_ROLES,
  roleAllows,
  type JoinRole,
  type OrganizationRole,
} from "@contracts/organizations";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ORGANIZATIONS_PATH } from "@/const";
import { setActiveOrganizationId } from "@/lib/activeScope";
import { useT } from "@/lib/i18nContext";
import { roleHint, roleLabel } from "@/lib/organizationRole";
import { trpc } from "@/lib/trpc";

/**
 * Eine Organisation: Mitglieder, Rollen, Beitrittscode.
 *
 * Das Gegenstück zu `src/pages/Friends.tsx` – dort eine Stufe je Freund und
 * Lager, hier eine Stufe je Mitglied. Wer nicht verwaltet, sieht die Liste,
 * aber keine Knöpfe: Ausgeblendet statt deaktiviert, wie überall.
 */
export default function OrganizationDetail() {
  const t = useT();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const params = useParams<{ id: string }>();
  const organizationId = Number(params.id);

  const { data, isLoading, error } = trpc.organization.get.useQuery(
    { organizationId },
    { enabled: Number.isFinite(organizationId), retry: false }
  );

  const [inviteCode, setInviteCode] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("editor");
  const [removing, setRemoving] = useState<{
    userId: number;
    name: string;
  } | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const refresh = () => {
    utils.organization.get.invalidate({ organizationId });
    utils.organization.list.invalidate();
  };

  const inviteMutation = trpc.organization.invite.useMutation({
    onSuccess: result => {
      /*
        Der Bot erreicht nicht jeden: Telegram lässt ihn nur schreiben, wenn der
        Empfänger den Chat einmal geöffnet hat. Das zu verschweigen hieße, den
        Einladenden auf eine Antwort warten zu lassen, von der die andere Seite
        nichts weiß.
      */
      toast.success(
        result.notified
          ? t.organizations.invited({ name: result.name ?? "" })
          : t.organizations.inviteNotNotified
      );
      setInviteCode("");
      setInviteUsername("");
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const revokeMutation = trpc.organization.revokeInvitation.useMutation({
    onSuccess: () => {
      toast.success(t.organizations.invitationRevoked);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const roleMutation = trpc.organization.setMemberRole.useMutation({
    onSuccess: () => {
      toast.success(t.organizations.roleChanged);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const removeMutation = trpc.organization.removeMember.useMutation({
    onSuccess: () => {
      toast.success(t.organizations.memberRemoved);
      setRemoving(null);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const joinCodeMutation = trpc.organization.setJoinCode.useMutation({
    onSuccess: () => refresh(),
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.organization.update.useMutation({
    onSuccess: () => {
      toast.success(t.organizations.saved);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const leaveMutation = trpc.organization.leave.useMutation({
    onSuccess: () => {
      toast.success(t.organizations.left);
      /*
        Zurück in den persönlichen Bereich, **bevor** navigiert wird: Sonst
        stünde der Umschalter auf einer Organisation, in der man nicht mehr ist,
        und die nächste Abfrage liefe in ein `NOT_FOUND`. Der Abgleich in
        `useActiveScope` finge das zwar ab – aber erst, nachdem die Liste neu
        geladen ist.
      */
      setActiveOrganizationId(null);
      utils.organization.list.invalidate();
      navigate(ORGANIZATIONS_PATH);
    },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.organization.delete.useMutation({
    onSuccess: () => {
      toast.success(t.organizations.deleted);
      setActiveOrganizationId(null);
      utils.organization.list.invalidate();
      navigate(ORGANIZATIONS_PATH);
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </AuthLayout>
    );
  }

  if (error || !data) {
    return (
      <AuthLayout>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {error?.message ?? t.common.nothingFound}
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  const isAdmin = roleAllows(data.role, "admin");

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={data.name}
          description={t.organizations.memberCount({
            count: data.members.length,
          })}
          actions={
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setLeaveOpen(true)}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t.organizations.leave}
            </Button>
          }
        />

        {/* Mitglieder */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t.organizations.membersTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.members.map(member => (
              <div
                key={member.userId}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {member.name ?? t.common.none}
                  </p>
                  {member.telegramUsername && (
                    <p className="truncate text-xs text-muted-foreground">
                      @{member.telegramUsername}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <Select
                      value={member.role}
                      onValueChange={value =>
                        roleMutation.mutate({
                          organizationId,
                          userId: member.userId,
                          role: value as OrganizationRole,
                        })
                      }
                    >
                      <SelectTrigger
                        className="h-9 w-40"
                        aria-label={t.organizations.inviteRoleLabel}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORGANIZATION_ROLES.map(role => (
                          <SelectItem key={role} value={role}>
                            {roleLabel(role, t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {roleLabel(member.role, t)}
                    </span>
                  )}
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t.organizations.removeMember}
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setRemoving({
                          userId: member.userId,
                          name: member.name ?? "",
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/*
          Offene Einladungen – nur für Administratoren, wie der Beitrittscode.
          Ohne diese Liste wäre eine ausgesprochene Einladung unsichtbar: Wer
          sich vertippt hat, könnte sie nicht zurücknehmen, und die übrigen
          Administratoren erführen von ihr erst, wenn jemand Neues in der
          Mitgliederliste steht.
        */}
        {isAdmin && data.invitations.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t.organizations.pendingInvitationsTitle}
              </CardTitle>
              <CardDescription>
                {t.organizations.pendingInvitationsHint}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.invitations.map(invitation => (
                <div
                  key={invitation.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {invitation.name ?? t.common.none}
                    </p>
                    {invitation.telegramUsername && (
                      <p className="truncate text-xs text-muted-foreground">
                        @{invitation.telegramUsername}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {roleLabel(invitation.role, t)}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t.organizations.revokeInvitation}
                      title={t.organizations.revokeInvitation}
                      className="text-destructive hover:text-destructive"
                      disabled={revokeMutation.isPending}
                      onClick={() =>
                        revokeMutation.mutate({
                          organizationId,
                          id: invitation.id,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <>
            {/* Einladen */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t.organizations.inviteTitle}
                </CardTitle>
                <CardDescription>{t.organizations.inviteHint}</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="flex flex-col gap-3"
                  onSubmit={e => {
                    e.preventDefault();
                    inviteMutation.mutate({
                      organizationId,
                      code: inviteCode.trim() || undefined,
                      telegramUsername: inviteUsername.trim() || undefined,
                      role: inviteRole,
                    });
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="invite-code">{t.friends.codeLabel}</Label>
                      <Input
                        id="invite-code"
                        value={inviteCode}
                        onChange={e => setInviteCode(e.target.value)}
                        placeholder={t.friends.codePlaceholder}
                        autoComplete="off"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="invite-username">
                        {t.friends.usernameLabel}
                      </Label>
                      <Input
                        id="invite-username"
                        value={inviteUsername}
                        onChange={e => setInviteUsername(e.target.value)}
                        placeholder={t.friends.usernamePlaceholder}
                        autoComplete="off"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="invite-role">
                        {t.organizations.inviteRoleLabel}
                      </Label>
                      <Select
                        value={inviteRole}
                        onValueChange={v =>
                          setInviteRole(v as OrganizationRole)
                        }
                      >
                        <SelectTrigger id="invite-role" className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORGANIZATION_ROLES.map(role => (
                            <SelectItem key={role} value={role}>
                              {roleLabel(role, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {roleHint(inviteRole, t)}
                  </p>
                  <Button
                    type="submit"
                    className="w-full sm:w-auto sm:self-start"
                    disabled={inviteMutation.isPending}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t.organizations.invite}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Offener Beitritt */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t.organizations.joinCodeTitle}
                </CardTitle>
                <CardDescription>
                  {t.organizations.joinCodeHint}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {data.joinCode ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                      {data.joinCode}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(data.joinCode ?? "");
                        toast.success(t.organizations.joinCodeCopied);
                      }}
                    >
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      {t.organizations.copyJoinCode}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t.organizations.joinCodeOff}
                  </p>
                )}

                <div className="flex flex-col gap-1.5 sm:max-w-xs">
                  <Label htmlFor="join-role">
                    {t.organizations.joinRoleLabel}
                  </Label>
                  <Select
                    value={data.joinRole}
                    onValueChange={value =>
                      updateMutation.mutate({
                        organizationId,
                        joinRole: value as JoinRole,
                      })
                    }
                  >
                    <SelectTrigger id="join-role" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOINABLE_ROLES.map(role => (
                        <SelectItem key={role} value={role}>
                          {roleLabel(role, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t.organizations.joinRoleHint}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={joinCodeMutation.isPending}
                    onClick={() =>
                      joinCodeMutation.mutate({ organizationId, enabled: true })
                    }
                  >
                    {data.joinCode
                      ? t.organizations.rotateJoinCode
                      : t.organizations.enableJoinCode}
                  </Button>
                  {data.joinCode && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={joinCodeMutation.isPending}
                      onClick={() =>
                        joinCodeMutation.mutate({
                          organizationId,
                          enabled: false,
                        })
                      }
                    >
                      {t.organizations.disableJoinCode}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Löschen */}
            <Card>
              <CardContent className="py-4">
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t.organizations.deleteOrganization}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <AlertDialog
        open={removing != null}
        onOpenChange={open => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.organizations.removeMemberTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.organizations.removeMemberDescription({
                name: removing?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                removing &&
                removeMutation.mutate({
                  organizationId,
                  userId: removing.userId,
                })
              }
            >
              {t.organizations.removeMember}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.organizations.leaveTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.organizations.leaveDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => leaveMutation.mutate({ organizationId })}
            >
              {t.organizations.leave}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.organizations.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.organizations.deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ organizationId })}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthLayout>
  );
}
