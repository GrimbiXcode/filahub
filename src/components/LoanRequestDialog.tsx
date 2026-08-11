import { useState } from "react";
import { HandHeart } from "lucide-react";
import { toast } from "sonner";
import { LOAN_MESSAGE_MAX_LENGTH } from "@contracts/friends";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { FriendMaterial } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: FriendMaterial | null;
};

/**
 * Fragt ein Material bei einem Freund an.
 *
 * Ein Feld, eine Schaltfläche – der Vorgang selbst entsteht auf dem Server.
 * Wichtig ist allein die Rückmeldung: Ob die Telegram-Nachricht ankam, steht
 * im Ergebnis der Mutation, und der Absender soll es erfahren. Sonst wartet er
 * auf eine Antwort, von der die Gegenseite nichts weiß.
 */
export function LoanRequestDialog({ open, onOpenChange, material }: Props) {
  const utils = trpc.useUtils();
  const t = useT();
  const [message, setMessage] = useState("");

  // Feld beim Öffnen leeren – wie im WeighingDialog bewusst während des
  // Renderns, damit kein Zwischenstand mit der alten Nachricht sichtbar wird.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setMessage("");
  }

  const requestLoan = trpc.friend.requestLoan.useMutation({
    onSuccess: result => {
      // `notified: false` heißt nicht „fehlgeschlagen“: Der Vorgang liegt in
      // der App, nur der Bot konnte nicht schreiben.
      if (result.notified) toast.success(t.loan.sent);
      else toast.warning(t.loan.sentUnreachable);
      utils.friend.loanRequests.invalidate();
      utils.friend.pendingCount.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) return;
    requestLoan.mutate({
      materialId: material.id,
      message: message.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandHeart className="h-4 w-4" />
              {t.loan.askTitle}
            </DialogTitle>
            <DialogDescription>
              {material
                ? t.loan.askDescription({
                    material: material.name,
                    name: material.ownerName,
                  })
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-4">
            <Label htmlFor="loan-message">{t.loan.messageLabel}</Label>
            <Textarea
              id="loan-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t.loan.messagePlaceholder}
              maxLength={LOAN_MESSAGE_MAX_LENGTH}
              rows={3}
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
            <Button type="submit" disabled={requestLoan.isPending || !material}>
              {requestLoan.isPending ? t.loan.sending : t.loan.send}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
