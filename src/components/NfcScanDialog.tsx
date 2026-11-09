import { useEffect, useState } from "react";
import { Nfc } from "lucide-react";
import type { OpenPrintTagMaterial } from "@contracts/openPrintTag";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18nContext";
import { NfcReadError, scanOpenPrintTag } from "@/lib/nfc";

/**
 * „Spule antippen“ (seit 4.7.0): wartet auf ein OpenPrintTag und gibt das
 * gelesene Material zurück. Nur dort eingebunden, wo `nfcSupported()` gilt.
 */
export function NfcScanDialog({
  open,
  onOpenChange,
  onRead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRead: (material: OpenPrintTagMaterial) => void;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    scanOpenPrintTag(controller.signal).then(
      material => {
        onRead(material);
        onOpenChange(false);
      },
      reason => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof NfcReadError
            ? t.nfc.errors[reason.code]
            : t.nfc.errors.unreadable
        );
      }
    );
    return () => controller.abort();
    // `onRead`/`onOpenChange` wechseln je Render – neu gelesen wird je Versuch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt]);

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        if (!value) setError(null);
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.nfc.scanTitle}</DialogTitle>
          <DialogDescription>{t.nfc.scanText}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Nfc
            className={
              error
                ? "h-12 w-12 text-muted-foreground"
                : "h-12 w-12 animate-pulse text-primary"
            }
          />
          {error && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          {error && (
            <Button
              onClick={() => {
                setError(null);
                setAttempt(n => n + 1);
              }}
            >
              {t.nfc.retry}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
