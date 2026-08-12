import { useState } from "react";
import { Building2, LogIn, Plus, Users2 } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { organizationPath } from "@/const";
import { setActiveOrganizationId } from "@/lib/activeScope";
import { useT } from "@/lib/i18nContext";
import { roleLabel } from "@/lib/organizationRole";
import { trpc } from "@/lib/trpc";

/**
 * Übersicht der eigenen Organisationen.
 *
 * Muster: `src/pages/Friends.tsx` – Karten je Eintrag, offene Vorgänge oben,
 * Anlegen und Beitreten in Dialogen.
 */
export default function Organizations() {
  const t = useT();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: memberships, isLoading } = trpc.organization.list.useQuery();
  const { data: invitations } = trpc.organization.listInvitations.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  /*
    Nach jeder Änderung an den Mitgliedschaften muss auch der Umschalter neu
    laden – er liest dieselbe Abfrage. Ein `invalidate` reicht dafür; der
    Bereich selbst bleibt, wo er ist.
  */
  const refresh = () => {
    utils.organization.list.invalidate();
    utils.organization.listInvitations.invalidate();
    utils.organization.pendingCount.invalidate();
  };

  const createMutation = trpc.organization.create.useMutation({
    onSuccess: org => {
      toast.success(t.organizations.created);
      refresh();
      setCreateOpen(false);
      setName("");
      // Direkt in die neue Organisation wechseln – wer sie anlegt, will hinein.
      setActiveOrganizationId(org.id);
      navigate(organizationPath(org.id));
    },
    onError: e => toast.error(e.message),
  });

  const joinMutation = trpc.organization.joinByCode.useMutation({
    onSuccess: joined => {
      toast.success(t.organizations.joined({ name: joined.name }));
      refresh();
      setJoinOpen(false);
      setCode("");
      setActiveOrganizationId(joined.organizationId);
    },
    onError: e => toast.error(e.message),
  });

  const respondMutation = trpc.organization.respondToInvitation.useMutation({
    onSuccess: result => {
      toast.success(
        result.joined
          ? t.organizations.invitationAccepted
          : t.organizations.invitationDeclined
      );
      refresh();
      if (result.joined && result.organizationId != null) {
        setActiveOrganizationId(result.organizationId);
      }
    },
    onError: e => toast.error(e.message),
  });

  const list = memberships ?? [];
  const open = invitations ?? [];

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.organizations.title}
          description={t.organizations.description}
          actions={
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => setJoinOpen(true)}
              >
                <LogIn className="mr-2 h-4 w-4" />
                {t.organizations.join}
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t.organizations.newOrganization}
              </Button>
            </div>
          }
        />

        {open.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t.organizations.invitationsTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {open.map(invitation => (
                <div
                  key={invitation.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm">
                    {t.organizations.invitationFrom({
                      name: invitation.organizationName,
                      role: roleLabel(invitation.role, t),
                    })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={respondMutation.isPending}
                      onClick={() =>
                        respondMutation.mutate({
                          id: invitation.id,
                          accept: true,
                        })
                      }
                    >
                      {t.organizations.accept}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={respondMutation.isPending}
                      onClick={() =>
                        respondMutation.mutate({
                          id: invitation.id,
                          accept: false,
                        })
                      }
                    >
                      {t.organizations.decline}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">{t.organizations.emptyTitle}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t.organizations.emptyDescription}
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t.organizations.newOrganization}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map(entry => (
              <Card
                key={entry.organizationId}
                className="cursor-pointer transition-colors hover:bg-accent/40"
                onClick={() => navigate(organizationPath(entry.organizationId))}
              >
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-3">
                    <Users2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {roleLabel(entry.role, t)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">{roleLabel(entry.role, t)}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.organizations.newOrganization}</DialogTitle>
            <DialogDescription>{t.organizations.description}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={e => {
              e.preventDefault();
              const trimmed = name.trim();
              if (!trimmed) return toast.error(t.common.nameRequired);
              createMutation.mutate({ name: trimmed });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-name">{t.organizations.nameLabel}</Label>
              <Input
                id="org-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t.organizations.namePlaceholder}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t.common.saving : t.common.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.organizations.joinTitle}</DialogTitle>
            <DialogDescription>{t.organizations.joinHint}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={e => {
              e.preventDefault();
              const trimmed = code.trim();
              if (!trimmed) return;
              joinMutation.mutate({ code: trimmed });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="join-code">{t.organizations.joinCodeLabel}</Label>
              <Input
                id="join-code"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder={t.organizations.joinCodePlaceholder}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setJoinOpen(false)}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={joinMutation.isPending}>
                {joinMutation.isPending
                  ? t.common.saving
                  : t.organizations.join}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AuthLayout>
  );
}
