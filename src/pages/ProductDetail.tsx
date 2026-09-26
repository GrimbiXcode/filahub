import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Combine, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  COMMON_MATERIAL_TYPES,
  COMMON_TEXTURES,
  canonicalMaterialType,
  mergeCandidates,
  normalizeMaterialType,
} from "@contracts/materials";
import { roleAllows } from "@contracts/organizations";
import AuthLayout from "@/components/AuthLayout";
import { AppearanceSwatch } from "@/components/AppearanceSwatch";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { PageHeader } from "@/components/PageHeader";
import { PrintSettingsCard } from "@/components/PrintSettings";
import { ProductGebindeList } from "@/components/ProductGebindeList";
import { RecentPrints } from "@/components/RecentPrints";
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
import { Textarea } from "@/components/ui/textarea";
import { materialPath } from "@/const";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useAppearanceResolver, useSwatchLabel } from "@/lib/appearance";
import { formKeys } from "@/lib/formKeyboard";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@/types";

type ProductDetailData = RouterOutputs["product"]["byId"];
type ProductListItem = RouterOutputs["product"]["list"][number];

/**
 * Ein Material (Produkt) mit allen seinen Gebinden, seit 4.0.0.
 *
 * Hier stehen die Angaben, die für alle Gebinde gelten – Materialart,
 * Hersteller, Farbe, Oberfläche, Dichte –, der Bestand über alle Lager und
 * das Zusammenführen. Wiegen und Abbuchen bleiben am einzelnen Gebinde, denn
 * gewogen wird immer eine bestimmte Rolle.
 */
export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const navigate = useNavigate();
  const t = useT();
  const scope = useActiveScope();
  const role = useScopeRole();
  const resolveAppearance = useAppearanceResolver();
  const swatchLabel = useSwatchLabel();
  const [editOpen, setEditOpen] = useState(false);

  const { data: product, isLoading } = trpc.product.byId.useQuery(
    { ...scope, id: productId },
    { enabled: Number.isFinite(productId) }
  );

  if (isLoading) {
    return (
      <AuthLayout>
        <div className="space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </AuthLayout>
    );
  }

  if (!product) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-lg font-medium">{t.product.notFound}</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t.materialDetail.toOverview}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const appearance = resolveAppearance(product.color, product.texture);
  const canEdit = roleAllows(role, "editor");

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          backTo="/"
          title={
            <span className="flex flex-wrap items-center gap-2">
              <AppearanceSwatch
                hex={appearance.hex}
                kind={appearance.kind}
                label={swatchLabel(
                  product.color,
                  product.texture,
                  appearance.hex
                )}
                size="md"
              />
              <span className="wrap-break-word">{product.name}</span>
              <Badge variant="secondary">{product.materialType}</Badge>
            </span>
          }
          description={
            [product.manufacturer, product.color, product.texture]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          actions={
            canEdit && (
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="mr-2 h-4 w-4" /> {t.common.edit}
              </Button>
            )
          }
        />

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {product.kind === "filament"
                  ? t.product.spoolsTitle
                  : t.product.gebindeTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProductGebindeList
                productId={product.id}
                showMaterialLink={false}
                showPrintSummary={false}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t.materialDetail.masterData}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">
                  {t.materialDetail.materialType}
                </dt>
                <dd>{product.materialType}</dd>
                <dt className="text-muted-foreground">
                  {t.common.manufacturer}
                </dt>
                <dd>{product.manufacturer ?? "–"}</dd>
                <dt className="text-muted-foreground">{t.common.color}</dt>
                <dd>{product.color ?? "–"}</dd>
                <dt className="text-muted-foreground">
                  {t.materialDetail.texture}
                </dt>
                <dd>{product.texture ?? "–"}</dd>
                {product.kind !== "powder" && (
                  <>
                    <dt className="text-muted-foreground">
                      {t.lager.densityLabel}
                    </dt>
                    <dd
                      className={
                        product.densityGramsPerLiter != null
                          ? "font-mono"
                          : undefined
                      }
                    >
                      {product.densityGramsPerLiter != null
                        ? `${product.densityGramsPerLiter} g/l`
                        : t.product.densityDefault}
                    </dd>
                  </>
                )}
                {product.notes && (
                  <>
                    <dt className="text-muted-foreground">{t.common.notes}</dt>
                    <dd className="whitespace-pre-wrap wrap-break-word">
                      {product.notes}
                    </dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>

        <PrintSettingsCard
          productId={product.id}
          kind={product.kind}
          stored={product.printSettings}
        />

        <RecentPrints productId={product.id} />

        {canEdit && <MergeCard product={product} />}
      </div>

      {canEdit && (
        <ProductFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          product={product}
        />
      )}
    </AuthLayout>
  );
}

/**
 * Andere Materialien in dieses hier zusammenführen. Oben die Vorschläge
 * (`mergeCandidates` – dieselbe Vergleichsform wie die Migration 0022), darunter
 * die freie Auswahl unter allen Materialien derselben Art und Stärke.
 */
function MergeCard({ product }: { product: ProductDetailData }) {
  const t = useT();
  const scope = useActiveScope();
  const utils = trpc.useUtils();
  const { data: products } = trpc.product.list.useQuery(scope);
  const [chosen, setChosen] = useState<string>("");
  const [confirming, setConfirming] = useState<ProductListItem | null>(null);

  const compatible = useMemo(
    () =>
      (products ?? []).filter(
        p =>
          p.id !== product.id &&
          (p.kind == null ||
            product.kind == null ||
            (p.kind === product.kind &&
              (p.diameterUm ?? null) === (product.diameterUm ?? null)))
      ),
    [products, product]
  );
  const suggestions = useMemo(() => {
    const group = mergeCandidates(products ?? []).find(ids =>
      ids.includes(product.id)
    );
    return compatible.filter(p => group?.includes(p.id));
  }, [products, compatible, product.id]);

  const merge = trpc.product.merge.useMutation({
    onSuccess: ({ moved }) => {
      toast.success(t.product.merged({ count: moved }));
      utils.product.invalidate();
      utils.print.invalidate();
      utils.material.list.invalidate();
      utils.material.byId.invalidate();
      setConfirming(null);
      setChosen("");
    },
    onError: e => toast.error(e.message),
  });

  if (compatible.length === 0) return null;
  const picked = compatible.find(p => String(p.id) === chosen) ?? null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t.product.mergeTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t.product.mergeHint}</p>
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {t.product.mergeSuggestions}
            </span>
            {suggestions.map(p => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
              >
                <Link
                  to={materialPath(p.id)}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                >
                  {p.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {t.materialForm.productGebindeCount({
                    count: p.gebindeCount,
                  })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(p)}
                >
                  <Combine className="mr-1.5 h-3.5 w-3.5" />
                  {t.product.mergeHere}
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="grid min-w-0 flex-1 gap-2">
            <Label htmlFor="merge-other">{t.product.mergeOther}</Label>
            <Select value={chosen} onValueChange={setChosen}>
              <SelectTrigger id="merge-other" className="w-full min-w-0">
                <SelectValue placeholder={t.product.mergeChoose} />
              </SelectTrigger>
              <SelectContent>
                {compatible.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={!picked}
            onClick={() => picked && setConfirming(picked)}
          >
            <Combine className="mr-1.5 h-4 w-4" />
            {t.product.mergeHere}
          </Button>
        </div>
      </CardContent>

      <AlertDialog
        open={confirming != null}
        onOpenChange={open => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.product.mergeConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming &&
                t.product.mergeConfirmDescription({
                  source: confirming.name,
                  target: product.name,
                  count: confirming.gebindeCount,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={merge.isPending}
              onClick={() =>
                confirming &&
                merge.mutate({
                  ...scope,
                  sourceId: confirming.id,
                  targetId: product.id,
                })
              }
            >
              {t.product.mergeHere}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** Die Angaben des Materials bearbeiten – sie gelten für alle Gebinde. */
function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetailData;
}) {
  const t = useT();
  const scope = useActiveScope();
  const utils = trpc.useUtils();
  const { data: products } = trpc.product.list.useQuery(scope);
  const [name, setName] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [color, setColor] = useState("");
  const [texture, setTexture] = useState("");
  const [density, setDensity] = useState("");
  const [notes, setNotes] = useState("");

  /* Beim Öffnen befüllen – während des Renderns, wie im Materialformular. */
  const formKey = open ? String(product.id) : null;
  const [applied, setApplied] = useState<string | null>(null);
  if (formKey !== applied) {
    setApplied(formKey);
    if (formKey !== null) {
      setName(product.name);
      setMaterialType(product.materialType);
      setManufacturer(product.manufacturer ?? "");
      setColor(product.color ?? "");
      setTexture(product.texture ?? "");
      setDensity(
        product.densityGramsPerLiter != null
          ? String(product.densityGramsPerLiter)
          : ""
      );
      setNotes(product.notes ?? "");
    }
  }

  /* Dieselbe Rangfolge wie im Materialformular und auf dem Server */
  const typeSuggestions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const type of [
      ...COMMON_MATERIAL_TYPES,
      ...(products ?? []).map(p => p.materialType),
    ]) {
      const key = normalizeMaterialType(type);
      if (key && !byKey.has(key)) byKey.set(key, type);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  }, [products]);
  const suggestionsOf = (pick: (p: ProductListItem) => string | null) => {
    const set = new Set<string>();
    (products ?? []).forEach(p => {
      const value = pick(p);
      if (value) set.add(value);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  };

  const update = trpc.product.update.useMutation({
    onSuccess: () => {
      toast.success(t.product.saved);
      utils.product.invalidate();
      utils.material.list.invalidate();
      utils.material.byId.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error(t.materialForm.nameRequired);
    const type = canonicalMaterialType(materialType, typeSuggestions);
    if (!type) return toast.error(t.materialForm.typeRequired);
    const densityValue = density.trim() ? parseInt(density, 10) : null;
    if (
      densityValue != null &&
      (!Number.isFinite(densityValue) || densityValue <= 0)
    )
      return toast.error(t.lager.densityLabel);
    update.mutate({
      ...scope,
      id: product.id,
      name: name.trim(),
      materialType: type,
      manufacturer: manufacturer.trim() || null,
      color: color.trim() || null,
      texture: texture.trim() || null,
      densityGramsPerLiter: densityValue,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={event => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.product.editTitle}</DialogTitle>
          <DialogDescription>
            {t.materialForm.productSharedHint({
              count: product.stock.count,
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} {...formKeys} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="p-name">{t.materialForm.nameLabel}</Label>
            <Input
              id="p-name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="p-type">{t.materialForm.materialTypeLabel}</Label>
              <AutocompleteInput
                id="p-type"
                value={materialType}
                onChange={setMaterialType}
                suggestions={typeSuggestions}
                onBlur={() =>
                  setMaterialType(v =>
                    canonicalMaterialType(v, typeSuggestions)
                  )
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-manufacturer">{t.common.manufacturer}</Label>
              <AutocompleteInput
                id="p-manufacturer"
                value={manufacturer}
                onChange={setManufacturer}
                suggestions={suggestionsOf(p => p.manufacturer)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-color">{t.common.color}</Label>
              <AutocompleteInput
                id="p-color"
                value={color}
                onChange={setColor}
                suggestions={suggestionsOf(p => p.color)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-texture">{t.materialForm.textureLabel}</Label>
              <AutocompleteInput
                id="p-texture"
                value={texture}
                onChange={setTexture}
                suggestions={[
                  ...new Set([
                    ...COMMON_TEXTURES,
                    ...suggestionsOf(p => p.texture),
                  ]),
                ]}
              />
            </div>
            {product.kind !== "powder" && (
              <div className="grid gap-2">
                <Label htmlFor="p-density">{t.lager.densityLabel}</Label>
                <Input
                  id="p-density"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={density}
                  onChange={e => setDensity(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-notes">{t.common.notes}</Label>
            <Textarea
              id="p-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
