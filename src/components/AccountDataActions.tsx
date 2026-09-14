import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletionConfirmationMatches } from "@contracts/account";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LOGIN_PATH } from "@/const";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";

/**
 * Auskunft und Löschung des eigenen Kontos – Art. 15, 20 und 17 DSGVO.
 *
 * Herausgelöst aus `src/pages/Settings.tsx`, weil es seit 2.8.0 einen zweiten
 * Ort gibt: die Sperrseite. Ein Verweis „steht in den Einstellungen“ ginge dort
 * ins Leere, denn die Einstellungen sind für ein gesperrtes Konto selbst
 * verschlossen – und ausgerechnet beim Gesperrten ist das Interesse an beidem
 * am größten. Zwei Abschriften derselben Knöpfe wären die nächste Stelle, an
 * der ein Betroffenenrecht auseinanderläuft.
 *
 * `children` landet zwischen Herunterladen und Löschen: Die Einstellungen haben
 * dort das Abmelden auf allen Geräten stehen, das auf die Sperrseite nicht
 * gehört.
 */
export function AccountDataActions({ children }: { children?: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const exportData = trpc.account.export.useMutation({
    onSuccess: data => {
      /*
        Der Abzug geht direkt in eine Datei und nicht durch den Query-Cache –
        siehe die Begründung an `account.export` im Server. Das Objekt-URL wird
        sofort wieder freigegeben, sonst hinge der Blob bis zum Seitenwechsel
        im Speicher.
      */
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `filahub-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t.settings.exportDone);
    },
    onError: e => toast.error(e.message),
  });

  const deleteAccount = trpc.account.delete.useMutation({
    onSuccess: async () => {
      setDeleteOpen(false);
      // Der Server hat das Cookie schon gelöscht; hier nur noch der Client.
      await utils.invalidate();
      navigate(LOGIN_PATH);
    },
    onError: e => toast.error(e.message),
  });

  const confirmationValid = deletionConfirmationMatches(
    confirmation,
    user?.name ?? null
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t.settings.exportHint}</p>
        <Button
          variant="outline"
          className="sm:self-start"
          disabled={exportData.isPending}
          onClick={() => exportData.mutate()}
        >
          <Download className="mr-2 h-4 w-4" />
          {exportData.isPending
            ? t.settings.exportPending
            : t.settings.exportAction}
        </Button>
      </div>

      {children ? (
        <>
          <Separator />
          {children}
        </>
      ) : null}

      <Separator />

      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t.settings.deleteHint}</p>
        <Button
          variant="outline"
          className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive sm:self-start"
          onClick={() => {
            setConfirmation("");
            setDeleteOpen(true);
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t.settings.deleteAction}
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.settings.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.settings.deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="delete-confirm" className="text-xs">
              {t.settings.deleteConfirmLabel({ name: user?.name ?? "" })}
            </Label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmationValid || deleteAccount.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={e => {
                // Der Dialog schließt sonst, bevor die Mutation durch ist.
                e.preventDefault();
                deleteAccount.mutate({ confirmation });
              }}
            >
              {deleteAccount.isPending
                ? t.settings.deletePending
                : t.settings.deleteConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
