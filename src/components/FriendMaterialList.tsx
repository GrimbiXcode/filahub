import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import type { FriendMaterial } from "@/types";

/** Restmenge in Gramm und Prozent, mit Balken. */
function RemainingBar({ material }: { material: FriendMaterial }) {
  const { formatGrams, formatPercent } = useFormat();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {formatGrams(material.remainingWeight)}
        </span>
        {material.remainingPercent != null && (
          <span className="text-muted-foreground">
            {formatPercent(material.remainingPercent)}
          </span>
        )}
      </div>
      {material.remainingPercent != null && (
        <Progress value={material.remainingPercent} className="h-1.5" />
      )}
    </div>
  );
}

type Props = {
  materials: FriendMaterial[];
  onAsk: (material: FriendMaterial) => void;
  /** Besitzer je Zeile anzeigen – in der Suche ja, im Lager eines Freundes nein */
  showOwner?: boolean;
};

/**
 * Material eines Freundes als Liste.
 *
 * Bewusst eine eigene Komponente und keine Erweiterung der Materialliste auf
 * `Home.tsx`: Die Felder sind andere (`FriendMaterial` kennt keinen Preis, kein
 * Kaufdatum, keine Box und keine Wägungen), und die Aktion ist eine andere –
 * „Anfragen“ statt „Wiegen“. Beides in eine Komponente zu zwingen hieße, in
 * jeder Zeile zu prüfen, wem das Material gehört.
 *
 * Karten auf dem Telefon, Tabelle ab `md` – wie in `Home.tsx`, weil eine
 * Tabelle mit vier Spalten auf dem Telefon unbedienbar ist.
 */
export function FriendMaterialList({
  materials,
  onAsk,
  showOwner = false,
}: Props) {
  const t = useT();

  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        {materials.map(material => (
          <Card key={material.id}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{material.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {material.materialType}
                    {material.manufacturer ? ` · ${material.manufacturer}` : ""}
                    {material.color ? ` · ${material.color}` : ""}
                  </span>
                  {showOwner && (
                    <span className="truncate text-xs text-muted-foreground">
                      {t.friends.ownerLabel({ name: material.ownerName })}
                    </span>
                  )}
                </div>
                {material.identifier && (
                  <Badge
                    variant="outline"
                    className="shrink-0 font-mono text-xs"
                  >
                    {material.identifier}
                  </Badge>
                )}
              </div>

              <RemainingBar material={material} />

              <Button
                size="sm"
                variant="secondary"
                className="mt-1 self-start"
                onClick={() => onAsk(material)}
              >
                {t.loan.ask}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.home.colMaterial}</TableHead>
                {showOwner && <TableHead>{t.friends.ownerColumn}</TableHead>}
                <TableHead className="hidden lg:table-cell">
                  {t.common.manufacturer}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t.common.color}
                </TableHead>
                <TableHead>{t.home.colRemaining}</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map(material => (
                <TableRow key={material.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{material.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {material.materialType}
                        {material.identifier ? ` · ${material.identifier}` : ""}
                      </span>
                    </div>
                  </TableCell>
                  {showOwner && (
                    <TableCell className="text-muted-foreground">
                      {material.ownerName}
                    </TableCell>
                  )}
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {material.manufacturer ?? t.common.none}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {material.color ?? t.common.none}
                  </TableCell>
                  <TableCell className="min-w-40">
                    <RemainingBar material={material} />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onAsk(material)}
                    >
                      {t.loan.ask}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
