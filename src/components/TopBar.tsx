import type { ReactNode } from "react";
import { Boxes, Plus, Printer, Scale } from "lucide-react";
import { useNavigate } from "react-router";
import { roleAllows } from "@contracts/organizations";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LAGER_PATH } from "@/const";
import { setActiveLagerId, useActiveLagerId } from "@/lib/activeLager";
import {
  setActiveOrganizationId,
  useActiveScope,
  useScopeRole,
} from "@/lib/activeScope";
import { useT } from "@/lib/i18nContext";
import { useQuickActions } from "@/lib/quickActions";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { IdentifierLookup } from "./IdentifierLookup";

/**
 * Die Kopfzeile ab dem Tablet: Bereich und Lager als Pillen, der
 * Kennungs-Schnellzugriff und die drei häufigsten Handgriffe.
 *
 * Seit 3.0 ist die Seitenleiste eine Symbolleiste; was dort keinen Platz mehr
 * hat und auf jeder Seite gebraucht wird, steht hier. Auf dem Telefon gibt es
 * die Kopfzeile nicht – dort trägt `AuthLayout` seine eigene, und Bereich und
 * Lager stehen in der ausgefahrenen Leiste.
 */
export function TopBar() {
  const t = useT();
  const role = useScopeRole();
  const { openMaterialForm, openPalette } = useQuickActions();

  return (
    <div className="sticky top-0 z-30 hidden h-16 items-center gap-2 border-b border-border/60 bg-background/95 px-4 backdrop-blur-sm supports-backdrop-filter:bg-background/80 md:flex lg:px-6">
      <ScopePill />
      <LagerPill />
      <IdentifierLookup compact className="min-w-0 max-w-md flex-1" />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {roleAllows(role, "editor") && (
          <Button
            variant="outline"
            size="icon"
            className="size-10"
            aria-label={t.home.newMaterial}
            onClick={() => openMaterialForm()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
        {roleAllows(role, "weigher") && (
          <>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => openPalette("consume")}
            >
              <Printer className="mr-2 h-4 w-4" /> {t.nav.consume}
            </Button>
            <Button className="h-10" onClick={() => openPalette("weigh")}>
              <Scale className="mr-2 h-4 w-4" /> {t.nav.weigh}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Der persönliche Bereich braucht im `Select` einen Wert – siehe `AuthLayout`. */
const PERSONAL_VALUE = "personal";

const pillClass =
  "h-10 w-auto shrink-0 gap-2 rounded-md border-border bg-card font-semibold";

/**
 * Bereich: „Privat“ oder eine Organisation. Ohne Mitgliedschaft eine feste
 * Pille – sie sagt, wo man ist, auch wenn es nichts zu wechseln gibt.
 */
function ScopePill() {
  const t = useT();
  const { organizationId } = useActiveScope();
  const { data: memberships } = trpc.organization.list.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (!memberships || memberships.length === 0) {
    return <StaticPill>{t.organizations.personal}</StaticPill>;
  }

  return (
    <Select
      value={organizationId == null ? PERSONAL_VALUE : String(organizationId)}
      onValueChange={value =>
        setActiveOrganizationId(value === PERSONAL_VALUE ? null : Number(value))
      }
    >
      <SelectTrigger
        className={pillClass}
        aria-label={t.organizations.scopeAria}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={PERSONAL_VALUE}>
          {t.organizations.personal}
        </SelectItem>
        {memberships.map(entry => (
          <SelectItem
            key={entry.organizationId}
            value={String(entry.organizationId)}
          >
            {entry.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Lager: ab zwei zur Wahl, bei einem eine feste Pille mit dem Namen, ohne
 * Lager der Weg zur Verwaltung.
 */
function LagerPill() {
  const t = useT();
  const navigate = useNavigate();
  const scope = useActiveScope();
  const { data: lagerList } = trpc.lager.list.useQuery(scope, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const activeId = useActiveLagerId(lagerList);

  if (!lagerList) return null;
  if (lagerList.length === 0) {
    return (
      <Button
        variant="outline"
        className="h-10 shrink-0"
        onClick={() => navigate(LAGER_PATH)}
      >
        <Boxes className="mr-2 h-4 w-4" />
        {t.lager.firstLager}
      </Button>
    );
  }
  if (lagerList.length === 1) {
    return <StaticPill>{lagerList[0].name}</StaticPill>;
  }

  return (
    <Select
      value={activeId != null ? String(activeId) : undefined}
      onValueChange={value => setActiveLagerId(Number(value))}
    >
      <SelectTrigger className={pillClass} aria-label={t.lager.switchAria}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {lagerList.map(item => (
          <SelectItem key={item.id} value={String(item.id)}>
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StaticPill({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-10 shrink-0 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold"
      )}
    >
      {children}
    </span>
  );
}
