import { useState } from "react";
import { roleAllows } from "@contracts/organizations";
import {
  layeredTextureKinds,
  TEXTURE_KIND_CHOICES,
  TEXTURE_LAYER,
  toResolvedSpec,
  type TextureKind,
} from "@contracts/appearance";
import { Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
import { AppearanceSwatch } from "@/components/AppearanceSwatch";
import { ColorSpecEditor } from "@/components/ColorSpecEditor";
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
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useTextureKindLabel, useTextureKindsLabel } from "@/lib/appearance";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { CustomColorItem, CustomTextureItem } from "@/types";
import { formKeys } from "@/lib/formKeyboard";
import {
  editorValueFrom,
  editorValueToInput,
  type ColorEditorValue,
} from "@/lib/colorSpecEditor";

/** Die Auswahl je Ebene, in der Reihenfolge von `TEXTURE_KIND_CHOICES` */
const FINISH_CHOICES = TEXTURE_KIND_CHOICES.filter(
  kind => TEXTURE_LAYER[kind] === "finish"
);
const STRUCTURE_CHOICES = TEXTURE_KIND_CHOICES.filter(
  kind => TEXTURE_LAYER[kind] === "structure"
);

/** Wert des Struktur-Felds, wenn keine gewählt ist – Radix erlaubt keinen leeren */
const NO_STRUCTURE = "none";

/** Die gespeicherten Arten einer Oberfläche, Struktur vor Glanz */
function kindsOf(texture: CustomTextureItem) {
  return layeredTextureKinds([texture.kind, texture.secondKind]);
}

/**
 * Eigene Farben und Oberflächen verwalten.
 *
 * Zwei Abschnitte auf einer Seite und nicht zwei Seiten: Beide beantworten
 * dieselbe Frage – wie sieht mein Material in der Übersicht aus –, und das Feld
 * zeigt ohnehin beides zusammen.
 *
 * Was mitgeliefert ist (`BUILTIN_COLORS`, `BUILTIN_TEXTURES` in
 * `contracts/appearance.ts`), steht hier **nicht**: Es gilt für alle, ist nicht
 * änderbar, und eine Liste aus fünfundzwanzig unveränderlichen Zeilen würde die
 * eigenen Einträge verdecken. Wer einen davon anders will, legt ihn unter
 * demselben Namen an – der eigene Eintrag schlägt den mitgelieferten.
 */
export default function Appearance() {
  const utils = trpc.useUtils();
  const scope = useActiveScope();
  const role = useScopeRole();
  const t = useT();
  const kindLabel = useTextureKindLabel();
  const kindsLabel = useTextureKindsLabel();
  const { data, isLoading } = trpc.appearance.list.useQuery(scope);
  const mayEdit = roleAllows(role, "editor");

  const [colorDialogOpen, setColorDialogOpen] = useState(false);
  const [editingColor, setEditingColor] = useState<CustomColorItem | null>(
    null
  );
  const [deletingColor, setDeletingColor] = useState<CustomColorItem | null>(
    null
  );
  const [colorName, setColorName] = useState("");
  const [colorValue, setColorValue] = useState<ColorEditorValue>(() =>
    editorValueFrom(null)
  );

  const [textureDialogOpen, setTextureDialogOpen] = useState(false);
  const [editingTexture, setEditingTexture] =
    useState<CustomTextureItem | null>(null);
  const [deletingTexture, setDeletingTexture] =
    useState<CustomTextureItem | null>(null);
  const [textureName, setTextureName] = useState("");
  /*
    Zwei Felder statt einer Liste (seit 4.9.0): Glanz ist Pflicht (`plain` =
    ohne), Struktur nicht. Wer bis 4.8.0 nur „Glitzernd“ gewählt hat, sieht
    hier Glitzernd und „Ohne Muster“ – dieselbe Oberfläche.
  */
  const [finish, setFinish] = useState<TextureKind>("matte");
  const [structure, setStructure] = useState<TextureKind | null>(null);
  const dialogKinds = layeredTextureKinds([structure, finish]);

  /*
    Nach jeder Änderung auch die Materiallisten auffrischen: Die Darstellung
    hängt am Katalog, und eine gerade hinterlegte Farbe soll in der Übersicht
    stehen, wenn man zurückgeht – nicht erst nach fünf Minuten, wenn der
    `staleTime` des Katalogs abgelaufen ist.
  */
  const invalidate = () => {
    utils.appearance.list.invalidate();
    utils.material.list.invalidate();
    utils.product.invalidate();
    utils.material.byId.invalidate();
  };

  const openColorDialog = (color: CustomColorItem | null) => {
    setEditingColor(color);
    setColorName(color?.name ?? "");
    setColorValue(editorValueFrom(color?.hex, color?.spec));
    setColorDialogOpen(true);
  };

  const openTextureDialog = (texture: CustomTextureItem | null) => {
    setEditingTexture(texture);
    setTextureName(texture?.name ?? "");
    const kinds = texture ? kindsOf(texture) : [];
    setFinish(
      texture
        ? (kinds.find(kind => TEXTURE_LAYER[kind] === "finish") ?? "plain")
        : "matte"
    );
    setStructure(
      kinds.find(kind => TEXTURE_LAYER[kind] === "structure") ?? null
    );
    setTextureDialogOpen(true);
  };

  const createColor = trpc.appearance.createColor.useMutation({
    onSuccess: () => {
      toast.success(t.appearance.colorCreated);
      invalidate();
      setColorDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateColor = trpc.appearance.updateColor.useMutation({
    onSuccess: () => {
      toast.success(t.appearance.colorSaved);
      invalidate();
      setColorDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const removeColor = trpc.appearance.deleteColor.useMutation({
    onSuccess: () => {
      toast.success(t.appearance.colorDeleted);
      invalidate();
      setDeletingColor(null);
    },
    onError: e => toast.error(e.message),
  });

  const createTexture = trpc.appearance.createTexture.useMutation({
    onSuccess: () => {
      toast.success(t.appearance.textureCreated);
      invalidate();
      setTextureDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateTexture = trpc.appearance.updateTexture.useMutation({
    onSuccess: () => {
      toast.success(t.appearance.textureSaved);
      invalidate();
      setTextureDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const removeTexture = trpc.appearance.deleteTexture.useMutation({
    onSuccess: () => {
      toast.success(t.appearance.textureDeleted);
      invalidate();
      setDeletingTexture(null);
    },
    onError: e => toast.error(e.message),
  });

  const savingColor = createColor.isPending || updateColor.isPending;
  const savingTexture = createTexture.isPending || updateTexture.isPending;

  const submitColor = (e: React.FormEvent) => {
    e.preventDefault();
    const name = colorName.trim();
    if (!name) return toast.error(t.appearance.nameRequired);
    const input = editorValueToInput(colorValue);
    if (!input) return toast.error(t.appearance.invalidHex);
    if (editingColor)
      updateColor.mutate({ ...scope, id: editingColor.id, name, ...input });
    else createColor.mutate({ ...scope, name, ...input });
  };

  const submitTexture = (e: React.FormEvent) => {
    e.preventDefault();
    const name = textureName.trim();
    if (!name) return toast.error(t.appearance.nameRequired);
    const kinds = { kind: finish, secondKind: structure };
    if (editingTexture)
      updateTexture.mutate({ ...scope, id: editingTexture.id, name, ...kinds });
    else createTexture.mutate({ ...scope, name, ...kinds });
  };

  const colors = data?.colors ?? [];
  const textures = data?.textures ?? [];

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.appearance.title}
          description={t.appearance.description}
        />

        <p className="text-sm text-muted-foreground">{t.appearance.hint}</p>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">
                  {t.appearance.colorsTitle}
                </CardTitle>
                {mayEdit && (
                  <Button size="sm" onClick={() => openColorDialog(null)}>
                    <Plus className="mr-2 h-4 w-4" /> {t.appearance.newColor}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {colors.length === 0 ? (
                  <EmptyHint text={t.appearance.emptyColors} />
                ) : (
                  <ul className="flex flex-col divide-y">
                    {colors.map(color => (
                      <li
                        key={color.id}
                        className="flex items-center gap-3 py-2"
                      >
                        <AppearanceSwatch
                          hex={color.hex}
                          kinds={[]}
                          spec={color.spec && toResolvedSpec(color.spec)}
                          label={color.name}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {color.name}
                        </span>
                        {color.spec ? (
                          <span className="text-xs text-muted-foreground">
                            {t.appearance.specSummary({
                              count: color.spec.colors.length,
                              layout: t.appearance.layouts[color.spec.layout],
                            })}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {color.hex}
                          </span>
                        )}
                        {mayEdit && (
                          <RowActions
                            editLabel={t.appearance.editColor}
                            deleteLabel={t.appearance.deleteColor}
                            onEdit={() => openColorDialog(color)}
                            onDelete={() => setDeletingColor(color)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">
                  {t.appearance.texturesTitle}
                </CardTitle>
                {mayEdit && (
                  <Button size="sm" onClick={() => openTextureDialog(null)}>
                    <Plus className="mr-2 h-4 w-4" /> {t.appearance.newTexture}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {textures.length === 0 ? (
                  <EmptyHint text={t.appearance.emptyTextures} />
                ) : (
                  <ul className="flex flex-col divide-y">
                    {textures.map(texture => (
                      <li
                        key={texture.id}
                        className="flex items-center gap-3 py-2"
                      >
                        {/*
                          Das Muster braucht eine Farbe, um sichtbar zu sein –
                          hier eine mittlere, damit die Vorschau nicht behauptet,
                          die Oberfläche hänge an einem bestimmten Ton.
                        */}
                        <AppearanceSwatch
                          hex="#8a8a8f"
                          kinds={kindsOf(texture)}
                          label={texture.name}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {texture.name}
                        </span>
                        <span className="text-right text-xs text-muted-foreground">
                          {kindsLabel(kindsOf(texture))}
                        </span>
                        {mayEdit && (
                          <RowActions
                            editLabel={t.appearance.editTexture}
                            deleteLabel={t.appearance.deleteTexture}
                            onEdit={() => openTextureDialog(texture)}
                            onDelete={() => setDeletingTexture(texture)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={colorDialogOpen} onOpenChange={setColorDialogOpen}>
        {/* Mit vier Farben und Partikeln länger als ein Telefon hoch ist */}
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingColor ? t.appearance.editColor : t.appearance.newColor}
            </DialogTitle>
            <DialogDescription>{t.appearance.nameHint}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitColor} {...formKeys} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="a-color-name">{t.appearance.nameLabel}</Label>
              <Input
                id="a-color-name"
                value={colorName}
                onChange={e => setColorName(e.target.value)}
                placeholder={t.appearance.colorNamePlaceholder}
              />
            </div>
            <ColorSpecEditor
              idPrefix="a-color"
              value={colorValue}
              onChange={setColorValue}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setColorDialogOpen(false)}
                disabled={savingColor}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={savingColor}>
                {savingColor
                  ? t.common.saving
                  : editingColor
                    ? t.common.save
                    : t.common.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={textureDialogOpen} onOpenChange={setTextureDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTexture
                ? t.appearance.editTexture
                : t.appearance.newTexture}
            </DialogTitle>
            <DialogDescription>{t.appearance.kindHint}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitTexture} {...formKeys} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="a-texture-name">{t.appearance.nameLabel}</Label>
              <Input
                id="a-texture-name"
                value={textureName}
                onChange={e => setTextureName(e.target.value)}
                placeholder={t.appearance.textureNamePlaceholder}
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="grid min-w-0 flex-1 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="a-texture-finish">
                    {t.appearance.finishLabel}
                  </Label>
                  <Select
                    value={finish}
                    onValueChange={value => setFinish(value as TextureKind)}
                  >
                    <SelectTrigger id="a-texture-finish" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FINISH_CHOICES.map(value => (
                        <SelectItem key={value} value={value}>
                          {kindLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="a-texture-structure">
                    {t.appearance.structureLabel}
                  </Label>
                  <Select
                    value={structure ?? NO_STRUCTURE}
                    onValueChange={value =>
                      setStructure(
                        value === NO_STRUCTURE ? null : (value as TextureKind)
                      )
                    }
                  >
                    <SelectTrigger
                      id="a-texture-structure"
                      className="w-full"
                      aria-describedby="a-texture-structure-hint"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_STRUCTURE}>
                        {t.appearance.structureNone}
                      </SelectItem>
                      {STRUCTURE_CHOICES.map(value => (
                        <SelectItem key={value} value={value}>
                          {kindLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <AppearanceSwatch
                hex="#8a8a8f"
                kinds={dialogKinds}
                label={t.appearance.preview}
                size="md"
                className="mb-1"
              />
            </div>
            <p
              id="a-texture-structure-hint"
              className="-mt-2 text-xs text-muted-foreground"
            >
              {t.appearance.structureHint}
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTextureDialogOpen(false)}
                disabled={savingTexture}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={savingTexture}>
                {savingTexture
                  ? t.common.saving
                  : editingTexture
                    ? t.common.save
                    : t.common.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={deletingColor != null}
        title={t.appearance.deleteColorTitle}
        name={deletingColor?.name ?? ""}
        column="color"
        onCancel={() => setDeletingColor(null)}
        onConfirm={() =>
          deletingColor &&
          removeColor.mutate({ ...scope, id: deletingColor.id })
        }
      />
      <DeleteDialog
        open={deletingTexture != null}
        title={t.appearance.deleteTextureTitle}
        name={deletingTexture?.name ?? ""}
        column="texture"
        onCancel={() => setDeletingTexture(null)}
        onConfirm={() =>
          deletingTexture &&
          removeTexture.mutate({ ...scope, id: deletingTexture.id })
        }
      />
    </AuthLayout>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Palette className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function RowActions({
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}: {
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={editLabel}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={deleteLabel}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </span>
  );
}

/**
 * Rückfrage vor dem Löschen – mit der Zahl der betroffenen Materialien, aber
 * **ohne** Sperre.
 *
 * Anders als bei einer Gebindeart hängt hier nichts am Eintrag: Der Name steht
 * als Freitext im Material und bleibt lesbar, nur die Darstellung fällt auf das
 * Rückfallfeld zurück. Die Zahl ist deshalb eine Auskunft und kein Hindernis.
 */
function DeleteDialog({
  open,
  title,
  name,
  column,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  name: string;
  column: "color" | "texture";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const scope = useActiveScope();
  const { data } = trpc.appearance.usage.useQuery(
    { ...scope, column, name },
    { enabled: open && name.length > 0 }
  );

  return (
    <AlertDialog open={open} onOpenChange={o => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.appearance.deleteDescription({ name })}
            {data && data.count > 0
              ? ` ${t.appearance.deleteUsage({ count: data.count })}`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
