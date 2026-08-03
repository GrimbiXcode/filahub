import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useFormat } from "@/lib/formatContext";
import { trpc } from "@/lib/trpc";
import type { AdminSystemStatus, LegacyImportStatus } from "@/types";

const IMPORT_STATUS_LABELS: Record<LegacyImportStatus, string> = {
  pending: "Ausstehend",
  running: "Läuft",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
  skipped: "Nicht erforderlich",
};

const IMPORT_STATUS_VARIANT: Record<
  LegacyImportStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "outline",
  running: "default",
  completed: "secondary",
  failed: "destructive",
  skipped: "outline",
};

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
  return (
    <SectionCard title="Datenbank">
      <Row label="System">PostgreSQL {data.version}</Row>
      <Row label="Datenbank">{data.database}</Row>
      <Row label="Verbindung">{data.source}</Row>
      <Row label="Verbindungen im Pool">
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
  const offen = migrations.filter(m => !m.applied).length;

  return (
    <SectionCard
      title="Schema-Migrationen"
      actions={
        <Badge
          variant={offen === 0 ? "secondary" : "destructive"}
          className="font-normal"
        >
          {offen === 0 ? "Aktuell" : `${offen} ausstehend`}
        </Badge>
      }
    >
      {migrations.map(m => (
        // Das Datum ist der Stand der Migrationsdatei, nicht der Zeitpunkt
        // ihrer Anwendung – den hält Drizzle nicht fest.
        <Row key={m.tag} label={`${m.tag} (${formatDate(m.generatedAt)})`}>
          {m.applied ? (
            <span className="text-muted-foreground">angewendet</span>
          ) : (
            <span className="text-destructive">ausstehend</span>
          )}
        </Row>
      ))}
      <Row label="Preset-Startkatalog">
        Revision {seed.revision} · {formatNumber(seed.seededRows)} Einträge aus
        dem Startkatalog
      </Row>
    </SectionCard>
  );
}

function LegacyImportCard({
  data,
  onRetry,
  isRetrying,
}: {
  data: AdminSystemStatus["legacyImport"];
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const { formatDateTime, formatNumber } = useFormat();

  if (!data) {
    return (
      <SectionCard title="Datenübernahme aus MySQL">
        <p className="py-2 text-sm text-muted-foreground">
          Für diese Installation liegt kein Übernahmelauf vor.
        </p>
      </SectionCard>
    );
  }

  const kannWiederholen = data.status === "failed" || data.status === "skipped";

  return (
    <SectionCard
      title="Datenübernahme aus MySQL"
      actions={
        <div className="flex items-center gap-2">
          <Badge
            variant={IMPORT_STATUS_VARIANT[data.status]}
            className="font-normal"
          >
            {IMPORT_STATUS_LABELS[data.status]}
          </Badge>
          {kannWiederholen && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isRetrying}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`}
              />
              Erneut versuchen
            </Button>
          )}
        </div>
      }
    >
      {data.status === "skipped" && (
        <p className="py-2 text-sm text-muted-foreground">
          Es ist keine Altdatenbank hinterlegt. Um Daten aus einer bestehenden
          MySQL-Installation zu übernehmen, <code>LEGACY_MYSQL_URL</code> setzen
          und den Server neu starten.
        </p>
      )}

      {data.source && <Row label="Quelle">{data.source}</Row>}
      {data.startedAt && (
        <Row label="Gestartet">{formatDateTime(data.startedAt)}</Row>
      )}
      {data.finishedAt && (
        <Row label="Beendet">{formatDateTime(data.finishedAt)}</Row>
      )}
      {data.status !== "skipped" && (
        <>
          <Row label="Tabellen">
            {formatNumber(data.tablesDone)} von {formatNumber(data.tablesTotal)}
          </Row>
          <Row label="Übernommene Zeilen">{formatNumber(data.rowsCopied)}</Row>
        </>
      )}

      {data.error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">Fehlermeldung</p>
          <p className="mt-1 break-words font-mono text-xs text-destructive">
            {data.error}
          </p>
        </div>
      )}

      {data.detail.length > 0 && (
        <div className="mt-4">
          {/* Telefon: Karten – die Tabelle hat vier Spalten */}
          <div className="flex flex-col gap-2 sm:hidden">
            {data.detail.map(d => (
              <div key={d.table} className="rounded-lg border p-3">
                <p className="font-mono text-sm">{d.table}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.missing
                    ? "in der Quelle nicht vorhanden"
                    : `${formatNumber(d.copied)} von ${formatNumber(d.sourceRows)} übernommen · ${formatNumber(d.skipped)} bereits vorhanden`}
                </p>
              </div>
            ))}
          </div>

          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tabelle</TableHead>
                  <TableHead className="text-right">In der Quelle</TableHead>
                  <TableHead className="text-right">Übernommen</TableHead>
                  <TableHead className="text-right">
                    Bereits vorhanden
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.detail.map(d => (
                  <TableRow key={d.table}>
                    <TableCell className="font-mono text-xs">
                      {d.table}
                    </TableCell>
                    {d.missing ? (
                      <TableCell
                        colSpan={3}
                        className="text-right text-muted-foreground"
                      >
                        in der Quelle nicht vorhanden
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="text-right">
                          {formatNumber(d.sourceRows)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(d.copied)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatNumber(d.skipped)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function TableCountsCard({ data }: { data: AdminSystemStatus["tableCounts"] }) {
  const { formatNumber } = useFormat();
  return (
    <SectionCard title="Tabellen">
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
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.system.status.useQuery(undefined, {
    // Während der Übernahme mitlaufen, sonst bliebe der Fortschritt stehen.
    refetchInterval: query =>
      query.state.data?.legacyImport?.status === "running" ? 2000 : false,
  });

  const retry = trpc.admin.system.retryLegacyImport.useMutation({
    onSuccess: result => {
      toast.success(
        result.status === "completed"
          ? `Datenübernahme abgeschlossen – ${result.rowsCopied} Zeilen übernommen.`
          : `Datenübernahme: ${IMPORT_STATUS_LABELS[result.status]}`
      );
      void utils.admin.system.status.invalidate();
    },
    onError: error => {
      toast.error(error.message);
      void utils.admin.system.status.invalidate();
    },
  });

  return (
    <AdminLayout
      title="System"
      description="Datenbank, Migrationen und Datenübernahme"
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
          <LegacyImportCard
            data={data.legacyImport}
            onRetry={() => retry.mutate()}
            isRetrying={retry.isPending}
          />
          <MigrationsCard migrations={data.schemaMigrations} seed={data.seed} />
          <TableCountsCard data={data.tableCounts} />
        </div>
      )}
    </AdminLayout>
  );
}
