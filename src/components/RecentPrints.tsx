import { Link } from "react-router";
import { Plus } from "lucide-react";
import { roleAllows } from "@contracts/organizations";
import { PrintJobCard } from "@/components/PrintJobCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { printsForPath } from "@/const";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useT } from "@/lib/i18nContext";
import { quickActions } from "@/lib/quickActions";
import { trpc } from "@/lib/trpc";

const RECENT_LIMIT = 5;

/**
 * „Letzte Drucke“ auf der Seite eines Materials oder eines Gebindes – der Weg,
 * einen Druck über das Material wiederzufinden. Mit `materialId` nur die
 * Drucke dieses Gebindes, sonst alle des Materials.
 */
export function RecentPrints({
  productId,
  materialId,
  canLog = true,
}: {
  productId: number;
  materialId?: number;
  /** Ob „Druck erfassen“ angeboten wird – nicht bei aufgebrauchten Gebinden */
  canLog?: boolean;
}) {
  const t = useT();
  const scope = useActiveScope();
  const role = useScopeRole();
  const { data, isLoading } = trpc.print.list.useQuery({
    ...scope,
    ...(materialId != null ? { materialId } : { productId }),
    limit: RECENT_LIMIT,
  });
  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">{t.prints.recentTitle}</CardTitle>
        <div className="flex gap-2">
          {canLog && roleAllows(role, "weigher") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                quickActions.openPrintJobForm({
                  productId,
                  materialId: materialId ?? null,
                })
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> {t.prints.add}
            </Button>
          )}
          {items.length > 0 && (
            <Button size="sm" variant="ghost" asChild>
              <Link
                to={printsForPath(
                  materialId != null ? { materialId } : { productId }
                )}
              >
                {t.prints.showAll}
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isLoading ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {materialId != null
              ? t.prints.recentEmptyGebinde
              : t.prints.recentEmpty}
          </p>
        ) : (
          items.map(job => <PrintJobCard key={job.id} job={job} compact />)
        )}
      </CardContent>
    </Card>
  );
}
