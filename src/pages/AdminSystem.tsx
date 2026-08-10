import { AdminLayout } from "@/components/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { AdminSystemStatus } from "@/types";

/** Beschriftung, Wert – die Grundform aller Angaben auf dieser Seite. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-sm font-medium">
        {children}
      </span>
    </div>
  );
}

function SectionCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">{children}</CardContent>
    </Card>
  );
}

function DatabaseCard({ data }: { data: AdminSystemStatus["database"] }) {
  const t = useT();
  return (
    <SectionCard title={t.adminSystem.database}>
      <Row label={t.adminSystem.system}>PostgreSQL {data.version}</Row>
      <Row label={t.adminSystem.databaseName}>{data.database}</Row>
      <Row label={t.adminSystem.connection}>{data.source}</Row>
      <Row label={t.adminSystem.poolConnections}>
        {data.pool.total} gesamt · {data.pool.idle} frei · {data.pool.waiting}{" "}
        wartend
      </Row>
    </SectionCard>
  );
}

function MigrationsCard({
  migrations,
  seed,
}: {
  migrations: AdminSystemStatus["schemaMigrations"];
  seed: AdminSystemStatus["seed"];
}) {
  const { formatDate, formatNumber } = useFormat();
  const t = useT();
  const offen = migrations.filter(m => !m.applied).length;

  return (
    <SectionCard
      title={t.adminSystem.migrations}
      actions={
        <Badge
          variant={offen === 0 ? "secondary" : "destructive"}
          className="font-normal"
        >
          {offen === 0
            ? t.adminSystem.upToDate
            : t.adminSystem.pendingCount({ count: offen })}
        </Badge>
      }
    >
      {migrations.map(m => (
        // Das Datum ist der Stand der Migrationsdatei, nicht der Zeitpunkt
        // ihrer Anwendung – den hält Drizzle nicht fest.
        <Row key={m.tag} label={`${m.tag} (${formatDate(m.generatedAt)})`}>
          {m.applied ? (
            <span className="text-muted-foreground">
              {t.adminSystem.applied}
            </span>
          ) : (
            <span className="text-destructive">{t.adminSystem.pending}</span>
          )}
        </Row>
      ))}
      <Row label={t.adminSystem.seedCatalog}>
        {t.adminSystem.seedRevision({
          revision: seed.revision,
          rows: formatNumber(seed.seededRows),
        })}
      </Row>
    </SectionCard>
  );
}

function TableCountsCard({ data }: { data: AdminSystemStatus["tableCounts"] }) {
  const t = useT();
  const { formatNumber } = useFormat();
  return (
    <SectionCard title={t.adminSystem.tables}>
      <div className="grid gap-x-8 sm:grid-cols-2">
        {data.map(t => (
          <Row key={t.table} label={t.table}>
            {formatNumber(t.rows)}
          </Row>
        ))}
      </div>
    </SectionCard>
  );
}

export default function AdminSystem() {
  const t = useT();
  const { data, isLoading } = trpc.admin.system.status.useQuery();

  return (
    <AdminLayout
      title={t.adminSystem.title}
      description={t.adminSystem.description}
    >
      {isLoading || !data ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-6">
          <DatabaseCard data={data.database} />
          <MigrationsCard migrations={data.schemaMigrations} seed={data.seed} />
          <TableCountsCard data={data.tableCounts} />
        </div>
      )}
    </AdminLayout>
  );
}
