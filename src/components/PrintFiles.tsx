import { useRef, useState } from "react";
import {
  Box,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { MAX_3MF_BYTES, MAX_IMAGE_BYTES } from "@contracts/limits";
import { roleAllows } from "@contracts/organizations";
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
  DialogTitle,
} from "@/components/ui/dialog";
import {
  printFileThumbnailUrl,
  printFileUploadUrl,
  printFileUrl,
} from "@/const";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { looksLikeImage, prepareImage, renameForType } from "@/lib/imageUpload";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { PrintJobDetail } from "@/types";

type PrintFile = PrintJobDetail["files"][number];

/** Ob eine gewählte Datei nach 3MF aussieht – geprüft wird auf dem Server */
function looksLike3mf(file: File): boolean {
  return /\.3mf$/i.test(file.name);
}

/**
 * Fotos und 3MF-Dateien eines Drucks (seit 4.3.0): Galerie, Hochladen per
 * Knopf, Kamera oder Ziehen, Titelbild, Löschen.
 *
 * Fotos gehen **nie** unverändert hinaus: `prepareImage` verkleinert sie und
 * kodiert sie neu – das entfernt EXIF samt Aufnahmeort. Hochgeladen wird über
 * eine eigene Route (`api/fileRoutes.ts`), weil tRPC keine Binärdaten kann.
 */
export function PrintFiles({ job }: { job: PrintJobDetail }) {
  const t = useT();
  const scope = useActiveScope();
  const role = useScopeRole();
  const utils = trpc.useUtils();
  const { formatBytes } = useFormat();
  const [pending, setPending] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<PrintFile | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const modelInput = useRef<HTMLInputElement>(null);

  const canUpload = roleAllows(role, "weigher");
  const photos = job.files.filter(f => f.kind === "image");
  const models = job.files.filter(f => f.kind === "model_3mf");

  const refresh = () => {
    utils.print.byId.invalidate();
    utils.print.list.invalidate();
  };

  const remove = trpc.print.deleteFile.useMutation({
    onSuccess: () => {
      toast.success(t.prints.files.deleted);
      setDeleting(null);
      setViewing(null);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const setCover = trpc.print.setCover.useMutation({
    onSuccess: () => {
      toast.success(t.prints.files.coverSet);
      refresh();
    },
    onError: e => toast.error(e.message),
  });

  /** Eine Datei vorbereiten und hochladen; wirft mit lesbarer Meldung */
  const uploadOne = async (file: File) => {
    const form = new FormData();
    if (looksLikeImage(file)) {
      let prepared;
      try {
        prepared = await prepareImage(file);
      } catch {
        throw new Error(t.prints.files.imageFailed({ name: file.name }));
      }
      if (prepared.file.size > MAX_IMAGE_BYTES)
        throw new Error(
          t.prints.files.tooLarge({
            name: file.name,
            max: formatBytes(MAX_IMAGE_BYTES),
          })
        );
      form.append(
        "file",
        new File([prepared.file], renameForType(file.name, prepared.file.type))
      );
      form.append("thumbnail", new File([prepared.thumbnail], "vorschau"));
    } else if (looksLike3mf(file)) {
      if (file.size > MAX_3MF_BYTES)
        throw new Error(
          t.prints.files.tooLarge({
            name: file.name,
            max: formatBytes(MAX_3MF_BYTES),
          })
        );
      form.append("file", file);
    } else {
      throw new Error(t.prints.files.unsupported({ name: file.name }));
    }
    const response = await fetch(
      printFileUploadUrl(job.id, scope.organizationId),
      { method: "POST", body: form, credentials: "same-origin" }
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? t.common.unknownError);
    }
  };

  const uploadAll = async (files: FileList | File[] | null) => {
    const list = [...(files ?? [])];
    if (list.length === 0) return;
    let done = 0;
    // Nacheinander: Die Obergrenze je Druck zählt der Server je Anfrage, und
    // ein Dutzend gleichzeitig verkleinerter Fotos brächte das Telefon ins
    // Schwitzen.
    for (const file of list) {
      setPending(current => [...current, file.name]);
      try {
        await uploadOne(file);
        done++;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t.common.unknownError
        );
      } finally {
        setPending(current => {
          const index = current.indexOf(file.name);
          return index < 0
            ? current
            : [...current.slice(0, index), ...current.slice(index + 1)];
        });
      }
    }
    if (done > 0) {
      toast.success(t.prints.files.uploaded({ count: done }));
      refresh();
    }
  };

  const viewed = viewing != null ? photos[viewing] : null;

  return (
    <Card
      onDragOver={
        canUpload
          ? e => {
              e.preventDefault();
              setDragging(true);
            }
          : undefined
      }
      onDragLeave={() => setDragging(false)}
      onDrop={
        canUpload
          ? e => {
              e.preventDefault();
              setDragging(false);
              void uploadAll(e.dataTransfer.files);
            }
          : undefined
      }
      className={cn(dragging && "ring-2 ring-primary")}
    >
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">{t.prints.files.title}</CardTitle>
        {canUpload && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => photoInput.current?.click()}
            >
              <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
              {t.prints.files.addPhotos}
            </Button>
            {/* Auf dem Telefon öffnet `capture` direkt die Kamera */}
            <Button
              size="sm"
              variant="outline"
              className="sm:hidden"
              onClick={() => cameraInput.current?.click()}
            >
              <Camera className="mr-1.5 h-3.5 w-3.5" />
              {t.prints.files.takePhoto}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => modelInput.current?.click()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {t.prints.files.add3mf}
            </Button>
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              hidden
              onChange={e => {
                void uploadAll(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={e => {
                void uploadAll(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={modelInput}
              type="file"
              accept=".3mf,model/3mf"
              multiple
              hidden
              onChange={e => {
                void uploadAll(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {job.files.length === 0 && pending.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t.prints.files.empty}
          </p>
        )}
        {canUpload && (
          <p className="hidden text-xs text-muted-foreground sm:block">
            {t.prints.files.dropHint}
          </p>
        )}

        {(photos.length > 0 || pending.length > 0) && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setViewing(index)}
                className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <img
                  src={printFileThumbnailUrl(photo.id)}
                  alt={t.prints.files.photoAlt({
                    title: job.title,
                    index: index + 1,
                  })}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                {job.coverFileId === photo.id && (
                  <Badge className="absolute left-1 top-1 gap-1 px-1.5 text-[10px]">
                    <Star className="h-3 w-3" /> {t.prints.files.cover}
                  </Badge>
                )}
              </button>
            ))}
            {pending.map((name, i) => (
              <div
                key={`${name}-${i}`}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-2 text-center text-[11px] text-muted-foreground"
                title={t.prints.files.uploading({ name })}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="line-clamp-2 break-all">{name}</span>
              </div>
            ))}
          </div>
        )}

        {models.length > 0 && (
          <ul className="flex flex-col divide-y rounded-lg border">
            {models.map(model => (
              <li key={model.id} className="flex items-center gap-3 p-2">
                <Box className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {model.originalName}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {t.prints.files.modelLabel} · {formatBytes(model.sizeBytes)}
                  </span>
                </div>
                <Button variant="ghost" size="icon" asChild>
                  <a
                    href={printFileUrl(model.id)}
                    download
                    aria-label={t.prints.files.download}
                    title={t.prints.files.download}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                {model.canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.common.delete}
                    onClick={() => setDeleting(model)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={viewed != null}
        onOpenChange={open => !open && setViewing(null)}
      >
        <DialogContent className="max-h-[95vh] gap-3 sm:max-w-4xl">
          {viewed && viewing != null && (
            <>
              <DialogTitle className="truncate pr-8 text-base">
                {job.title}
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {viewing + 1} / {photos.length}
                {viewed.width && viewed.height
                  ? ` · ${viewed.width} × ${viewed.height}`
                  : ""}
                {` · ${formatBytes(viewed.sizeBytes)}`}
              </DialogDescription>
              <div className="relative flex items-center justify-center overflow-hidden rounded-lg bg-muted">
                <img
                  src={printFileUrl(viewed.id)}
                  alt={t.prints.files.photoAlt({
                    title: job.title,
                    index: viewing + 1,
                  })}
                  className="max-h-[70vh] w-auto object-contain"
                />
                {photos.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full"
                      aria-label={t.prints.files.previous}
                      onClick={() =>
                        setViewing(
                          (viewing - 1 + photos.length) % photos.length
                        )
                      }
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
                      aria-label={t.prints.files.next}
                      onClick={() => setViewing((viewing + 1) % photos.length)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {canUpload && job.coverFileId !== viewed.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setCover.isPending}
                    onClick={() =>
                      setCover.mutate({
                        ...scope,
                        printJobId: job.id,
                        fileId: viewed.id,
                      })
                    }
                  >
                    <Star className="mr-1.5 h-3.5 w-3.5" />
                    {t.prints.files.setCover}
                  </Button>
                )}
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={printFileUrl(viewed.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    {t.prints.files.openOriginal}
                  </a>
                </Button>
                {viewed.canDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleting(viewed)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {t.common.delete}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting != null}
        onOpenChange={open => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.prints.files.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.prints.files.deleteDescription({
                name: deleting?.originalName ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={e => {
                e.preventDefault();
                if (deleting) remove.mutate({ ...scope, id: deleting.id });
              }}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
