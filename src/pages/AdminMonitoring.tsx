import { ShieldAlert, TriangleAlert } from "lucide-react";
import type { AbuseAlertKey } from "@contracts/limits";
import { AdminLayout } from "@/components/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { AdminAbuseOverview } from "@/types";

/**
 * Was die Abwehr abgewiesen hat.
 *
 * Read-only wie `AdminSystem` und nach demselben Muster gebaut: lokale Helfer,
 * eine Query, `Skeleton` beim Laden. Gehandelt wird nebenan unter „Nutzer“.
 *
 * **Jede Zahl hier ist eine Abweisung, nie normaler Betrieb.** Das Protokoll
 * schreibt nur das Zuschlagen mit (`contracts/audit.ts`) – deshalb ist eine
 * leere Seite die gute Nachricht und keine fehlende Erhebung.
 */
export default function AdminMonitoring() {
  const t = useT();
  const { data, isLoading } = trpc.admin.abuse.overview.useQuery();

  return (
    <AdminLayout
      title={t.adminAbuse.title}
      description={t.adminAbuse.description}
      actions={
        data ? (
          <Badge variant={data.alerts.length > 0 ? "destructive" : "secondary"}>
            {data.alerts.length > 0
              ? t.adminAbuse.alertsTitle
              : t.adminAbuse.alertsNone}
          </Badge>
        ) : undefined
      }
    >
      {isLoading || !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-6">
          <AlertsCard data={data} />
          <CountsCard data={data} />

          <HitsCard
            title={t.adminAbuse.bucketsTitle}
            column={t.adminAbuse.colBucket}
            rows={data.buckets}
          />
          <HitsCard
            title={t.adminAbuse.quotasTitle}
            column={t.adminAbuse.colQuota}
            rows={data.quotas}
          />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t.adminAbuse.registrationsTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {data.registrations.length === 0 ? (
                <Empty />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.adminAbuse.colDay}</TableHead>
                      <TableHead className="text-right">
                        {t.adminAbuse.colCount}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.registrations.map(row => (
                      <TableRow key={row.day}>
                        <TableCell>{row.day}</TableCell>
                        <TableCell className="text-right">
                          {row.registrations}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t.adminAbuse.noisiestTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {data.noisiest.length === 0 ? (
                <Empty />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.adminAbuse.colAccount}</TableHead>
                      <TableHead className="text-right">
                        {t.adminAbuse.colHits}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.noisiest.map(row => (
                      <TableRow key={row.userId ?? "unbekannt"}>
                        <TableCell>
                          {row.name ?? t.adminAbuse.unknownAccount}
                        </TableCell>
                        <TableCell className="text-right">{row.hits}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}

function Empty() {
  const t = useT();
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      {t.adminAbuse.empty}
    </p>
  );
}

function AlertsCard({ data }: { data: AdminAbuseOverview }) {
  const t = useT();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {data.alerts.length > 0 ? (
            <TriangleAlert className="h-4 w-4 text-destructive" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          )}
          {t.adminAbuse.alertsTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        {data.alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.adminAbuse.alertsNone}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.alerts.map(alert => (
              <li key={alert.key} className="text-sm">
                {t.adminAbuse.alertLine({
                  label: t.adminAbuse.counts[alert.key],
                  count: alert.count,
                  threshold: alert.threshold,
                  window: alert.window,
                })}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Die vier Zählstände als Kacheln, jeder mit seiner Schwelle daneben.
 *
 * Die Schwelle steht dabei, weil eine nackte Zahl nichts sagt: „87 abgewiesene
 * Zugriffe“ ist erst dann eine Auskunft, wenn danebensteht, dass ab 100
 * gemeldet wird.
 */
function CountsCard({ data }: { data: AdminAbuseOverview }) {
  const t = useT();
  const keys = Object.keys(data.counts) as AbuseAlertKey[];
  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        {keys.map(key => (
          <div key={key} className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {t.adminAbuse.counts[key]}
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {data.counts[key]}
            </span>
            <span className="text-xs text-muted-foreground">
              {[data.thresholds[key].window, data.thresholds[key].threshold]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            {t.adminAbuse.blockedUsers}
          </span>
          <span className="text-2xl font-semibold tabular-nums">
            {data.blockedUsers}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function HitsCard({
  title,
  column,
  rows,
}: {
  title: string;
  column: string;
  rows: { bucket: string; hits: number }[];
}) {
  const t = useT();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        {rows.length === 0 ? (
          <Empty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{column}</TableHead>
                <TableHead className="text-right">
                  {t.adminAbuse.colHits}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.bucket}>
                  {/* Der Eimername ist eine technische Kennung und bleibt es:
                      Eine Übersetzung je Prozedur wäre ein Katalog, der bei der
                      nächsten Grenze vergessen wird. */}
                  <TableCell className="font-mono text-xs">
                    {row.bucket}
                  </TableCell>
                  <TableCell className="text-right">{row.hits}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
