import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { FriendMaterialList } from "@/components/FriendMaterialList";
import { LoanRequestDialog } from "@/components/LoanRequestDialog";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { FriendMaterial } from "@/types";

/**
 * Das ganze Lager eines Freundes – nur bei Stufe `full`.
 *
 * Eine eigene Seite und kein Aufklapper in der Freundesliste: Sie ist
 * verlinkbar, und die Materialliste braucht die ganze Breite. Reicht die Stufe
 * nicht, antwortet der Server mit `NOT_FOUND` – hier wird das als Hinweis
 * angezeigt, nicht als Fehler: Der häufigste Grund ist, dass der Freund seine
 * Freigabe geändert hat, und das ist sein gutes Recht.
 */
export default function FriendInventory() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const friendId = Number(params.id);

  const [asking, setAsking] = useState<FriendMaterial | null>(null);

  const { data, isLoading, error } = trpc.friend.inventory.useQuery(
    { friendId },
    { enabled: Number.isInteger(friendId) && friendId > 0, retry: false }
  );

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={
            data
              ? t.friends.inventoryTitle({ name: data.ownerName })
              : t.friends.title
          }
          description={t.friends.inventoryDescription}
          actions={
            <Button variant="outline" asChild>
              <Link to="/freunde">
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t.common.back}
              </Link>
            </Button>
          }
        />

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error || !data ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t.friends.inventoryDenied}
            </CardContent>
          </Card>
        ) : data.materials.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t.friends.inventoryEmpty}
            </CardContent>
          </Card>
        ) : (
          <FriendMaterialList materials={data.materials} onAsk={setAsking} />
        )}
      </div>

      <LoanRequestDialog
        open={asking != null}
        onOpenChange={open => !open && setAsking(null)}
        material={asking}
      />
    </AuthLayout>
  );
}
