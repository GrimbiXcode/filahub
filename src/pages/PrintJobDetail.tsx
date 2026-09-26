import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, ExternalLink, History, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { linkHost } from "@contracts/printJobs";
import { roleAllows } from "@contracts/organizations";
import AuthLayout from "@/components/AuthLayout";
import { MarkdownContent } from "@/components/MarkdownContent";
import { PageHeader } from "@/components/PageHeader";
import {
  PrintMaterialSwatch,
  PrintStatusBadge,
} from "@/components/PrintJobCard";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PRINTS_PATH, gebindePath, materialPath, printsForPath } from "@/const";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useFormat } from "@/lib/formatContext";
import { useI18n } from "@/lib/i18nContext";
import { quickActions } from "@/lib/quickActions";
import { trpc } from "@/lib/trpc";

/** Ein Druck: Materialien, Links, Notizen – und Bearbeiten, Löschen */
export default function PrintJobDetail() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const scope = useActiveScope();
  const role = useScopeRole();
  const { formatDateTime, formatGrams } = useFormat();
  const utils = trpc.useUtils();
  const [deleting, setDeleting] = useState(false);
  const [revert, setRevert] = useState(true);

  const { data: job, isLoading } = trpc.print.byId.useQuery(
    { ...scope, id: jobId },
    { enabled: Number.isInteger(jobId) && jobId > 0, retry: false }
  );

  const remove = trpc.print.delete.useMutation({
    onSuccess: () => {
      toast.success(t.prints.deleted);
      utils.print.invalidate();
      utils.material.list.invalidate();
      utils.material.byId.invalidate();
      utils.product.invalidate();
      navigate(PRINTS_PATH);
    },
    onError: e => toast.error(e.message),
  });

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

  if (!job) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-lg font-medium">{t.prints.notFound}</p>
          <Button variant="outline" onClick={() => navigate(PRINTS_PATH)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t.prints.toList}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const booked = job.materials.some(m => m.booked);
  const duration = job.durationMinutes;

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          backTo={PRINTS_PATH}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="wrap-break-word">{job.title}</span>
              <PrintStatusBadge status={job.status} />
            </span>
          }
          description={
            <span className="font-mono">{formatDateTime(job.printedAt)}</span>
          }
          actions={
            <>
              {roleAllows(role, "editor") && (
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => quickActions.editPrintJob(job)}
                >
                  <Pencil className="mr-2 h-4 w-4" /> {t.common.edit}
                </Button>
              )}
              {job.canDelete && (
                <Button
                  variant="outline"
                  className="flex-1 text-destructive sm:flex-none"
                  onClick={() => {
                    setRevert(true);
                    setDeleting(true);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> {t.common.delete}
                </Button>
              )}
            </>
          }
        />

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t.prints.materialsTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {job.materials.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t.prints.materialsEmpty}
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {job.materials.map(material => (
                    <li
                      key={material.id}
                      className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <PrintMaterialSwatch material={material} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        {material.productId != null ? (
                          <Link
                            to={materialPath(material.productId)}
                            className="truncate text-sm font-medium hover:underline"
                          >
                            {material.name}
                          </Link>
                        ) : (
                          <span className="truncate text-sm font-medium">
                            {material.name}
                          </span>
                        )}
                        <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          {material.materialId != null ? (
                            <Link
                              to={gebindePath(material.materialId)}
                              className="font-mono hover:underline"
                            >
                              {material.identifier ?? `#${material.materialId}`}
                            </Link>
                          ) : (
                            <span>{t.prints.form.withoutGebinde}</span>
                          )}
                          {material.gebindeArchived && (
                            <span>{t.prints.gebindeUsedUp}</span>
                          )}
                          {material.productId == null && (
                            <span>{t.prints.materialGone}</span>
                          )}
                        </span>
                      </div>
                      {material.productId != null && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground"
                          asChild
                        >
                          <Link
                            to={printsForPath({
                              productId: material.productId,
                            })}
                            aria-label={t.prints.printsWithMaterial}
                            title={t.prints.printsWithMaterial}
                          >
                            <History className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                      <div className="flex shrink-0 flex-col items-end">
                        <span className="font-mono text-sm">
                          {formatGrams(material.grams)}
                        </span>
                        {material.grams > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {material.booked
                              ? t.prints.booked
                              : t.prints.notBooked}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t.prints.detailsTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">{t.prints.printedAt}</dt>
                <dd className="font-mono">{formatDateTime(job.printedAt)}</dd>
                {duration != null && (
                  <>
                    <dt className="text-muted-foreground">
                      {t.prints.duration}
                    </dt>
                    <dd className="font-mono">
                      {t.prints.durationValue({
                        hours: Math.floor(duration / 60),
                        minutes: duration % 60,
                      })}
                    </dd>
                  </>
                )}
                {job.printer && (
                  <>
                    <dt className="text-muted-foreground">
                      {t.prints.printer}
                    </dt>
                    <dd>
                      <Link
                        to={`${PRINTS_PATH}?drucker=${encodeURIComponent(job.printer)}`}
                        className="hover:underline"
                      >
                        {job.printer}
                      </Link>
                    </dd>
                  </>
                )}
                {job.tags.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">{t.prints.tags}</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {job.tags.map(tag => (
                        <Badge key={tag} variant="outline" asChild>
                          <Link
                            to={`${PRINTS_PATH}?tag=${encodeURIComponent(tag)}`}
                          >
                            #{tag}
                          </Link>
                        </Badge>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
              {job.links.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t.prints.linksTitle}
                  </span>
                  <ul className="flex flex-col gap-1.5">
                    {job.links.map(link => (
                      <li key={link.id}>
                        {/* `noopener noreferrer`: Die Modellseite erfährt
                            weder, woher der Besuch kommt, noch bekommt sie
                            Zugriff auf dieses Fenster. */}
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {link.label || linkHost(link.url)}
                          </span>
                          {link.label && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {linkHost(link.url)}
                            </span>
                          )}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {job.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t.prints.notesTitle}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <MarkdownContent lang={language}>{job.notes}</MarkdownContent>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.prints.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.prints.deleteDescription({ title: job.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {booked && (
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="pj-revert"
                checked={revert}
                onCheckedChange={value => setRevert(value === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="pj-revert">{t.prints.revertConsumptions}</Label>
                <p className="text-xs text-muted-foreground">
                  {t.prints.revertHint}
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={e => {
                e.preventDefault();
                remove.mutate({
                  ...scope,
                  id: job.id,
                  revertConsumptions: booked && revert,
                });
              }}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthLayout>
  );
}
