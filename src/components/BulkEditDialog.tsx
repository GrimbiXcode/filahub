import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { hasBulkChanges, type BulkGebindePatch } from "@contracts/bulkEdit";
import { DateInput } from "@/components/DateInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useActiveScope } from "@/lib/activeScope";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";

const NONE = "none";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Die ausgewählten Gebinde */
  ids: number[];
  /** Nach dem Speichern – die Übersicht hebt dann die Auswahl auf */
  onDone: () => void;
};

/**
 * Sammelbearbeitung aus der Übersicht (seit 4.6.0).
 *
 * Jedes Feld hat einen eigenen Haken „ändern“: Ein leeres Preisfeld heißt
 * sonst entweder „nicht anfassen“ oder „Preis entfernen“, und welches gemeint
 * ist, ließe sich nicht unterscheiden. Ohne Haken geht das Feld nicht in den
 * Änderungssatz (`undefined`), mit Haken und leer wird es geleert (`null`).
 * Wer in ein Feld tippt, setzt den Haken mit – der Haken ist dann nur noch
 * nötig, um ein Feld bewusst zu leeren.
 * Welche Felder es gibt und warum nur diese, steht an
 * `bulkGebindePatchSchema` (`contracts/bulkEdit.ts`).
 */
export function BulkEditDialog({ open, onOpenChange, ids, onDone }: Props) {
  const t = useT();
  const utils = trpc.useUtils();
  const scope = useActiveScope();
  const { centsToInput, currencySymbol, formatGrams, parseMoney } = useFormat();
  const { data: storageBoxes } = trpc.storageBox.list.useQuery(scope, {
    enabled: open,
  });

  const [changePrice, setChangePrice] = useState(false);
  const [price, setPrice] = useState("");
  const [changeDate, setChangeDate] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [changeNominal, setChangeNominal] = useState(false);
  const [nominalWeight, setNominalWeight] = useState("");
  const [changeBox, setChangeBox] = useState(false);
  const [storageBoxId, setStorageBoxId] = useState(NONE);
  const [error, setError] = useState<string | null>(null);

  // Beim Öffnen leeren – während des Renderns, wie im `WeighingDialog`.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChangePrice(false);
      setPrice("");
      setChangeDate(false);
      setPurchaseDate("");
      setChangeNominal(false);
      setNominalWeight("");
      setChangeBox(false);
      setStorageBoxId(NONE);
      setError(null);
    }
  }

  const updateMany = trpc.material.updateMany.useMutation({
    onSuccess: ({ updated }) => {
      toast.success(t.bulkEdit.saved({ count: updated }));
      utils.material.list.invalidate();
      utils.material.byId.invalidate();
      utils.product.invalidate();
      // Die Belegung der Dryboxen hängt an den Gebinden
      utils.storageBox.invalidate();
      onOpenChange(false);
      onDone();
    },
    onError: e => toast.error(e.message),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const patch: BulkGebindePatch = {};
    if (changePrice) {
      const trimmed = price.trim();
      const cents = trimmed ? parseMoney(trimmed) : null;
      if (trimmed && cents == null) {
        setError(t.bulkEdit.invalidPrice);
        return;
      }
      patch.priceCents = cents;
    }
    if (changeDate) patch.purchaseDate = purchaseDate || null;
    if (changeNominal) {
      const grams = Number(nominalWeight);
      if (!Number.isInteger(grams) || grams <= 0) {
        setError(t.materialForm.nominalRequired);
        return;
      }
      patch.nominalWeight = grams;
    }
    if (changeBox) {
      patch.storageBoxId = storageBoxId === NONE ? null : Number(storageBoxId);
    }
    if (!hasBulkChanges(patch)) {
      setError(t.bulkEdit.nothingChecked);
      return;
    }
    setError(null);
    updateMany.mutate({ ...scope, ids, patch });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.bulkEdit.title({ count: ids.length })}</DialogTitle>
          <DialogDescription>{t.bulkEdit.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
          <BulkField
            id="bulk-price"
            label={t.materialForm.priceLabel({ symbol: currencySymbol })}
            checked={changePrice}
            onCheckedChange={setChangePrice}
            hint={t.bulkEdit.priceHint}
          >
            <Input
              id="bulk-price"
              inputMode="decimal"
              value={price}
              onChange={e => {
                setPrice(e.target.value);
                setChangePrice(true);
              }}
              placeholder={t.materialForm.pricePlaceholder({
                example: centsToInput(2499),
              })}
            />
          </BulkField>
          <BulkField
            id="bulk-date"
            label={t.materialForm.purchaseDate}
            checked={changeDate}
            onCheckedChange={setChangeDate}
            hint={t.bulkEdit.purchaseDateHint}
          >
            <DateInput
              id="bulk-date"
              value={purchaseDate}
              onChange={value => {
                setPurchaseDate(value);
                setChangeDate(true);
              }}
            />
          </BulkField>
          <BulkField
            id="bulk-nominal"
            label={t.bulkEdit.nominalLabel}
            checked={changeNominal}
            onCheckedChange={setChangeNominal}
          >
            <Input
              id="bulk-nominal"
              type="number"
              inputMode="numeric"
              min={1}
              value={nominalWeight}
              onChange={e => {
                setNominalWeight(e.target.value);
                setChangeNominal(true);
              }}
              placeholder={t.materialForm.nominalPlaceholder}
            />
          </BulkField>
          <BulkField
            id="bulk-box"
            label={t.materialForm.storageBox}
            checked={changeBox}
            onCheckedChange={setChangeBox}
          >
            <Select
              value={storageBoxId}
              onValueChange={value => {
                setStorageBoxId(value);
                setChangeBox(true);
              }}
            >
              <SelectTrigger id="bulk-box" className="w-full min-w-0">
                <SelectValue placeholder={t.materialForm.chooseBox} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t.materialForm.noBox}</SelectItem>
                {storageBoxes?.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name} ({formatGrams(b.tareWeight)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </BulkField>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMany.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={updateMany.isPending}>
              {updateMany.isPending
                ? t.common.saving
                : t.bulkEdit.save({ count: ids.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Ein Feld mit seinem Haken „ändern“ davor */
function BulkField({
  id,
  label,
  checked,
  onCheckedChange,
  hint,
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={value => onCheckedChange(value === true)}
          aria-label={t.bulkEdit.changeField({ field: label })}
        />
        {/* Die Beschriftung gehört zum Feld; der Haken trägt „… ändern“
            als eigenen Namen. */}
        <Label htmlFor={id}>{label}</Label>
      </div>
      {children}
      {hint && checked && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
