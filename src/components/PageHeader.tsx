import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18nContext";
import { cn } from "@/lib/utils";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  /** Aktionen rechts; auf schmalen Geräten rutschen sie unter den Titel. */
  actions?: ReactNode;
  /** Zeigt einen Zurück-Pfeil, der auf diesen Pfad navigiert. */
  backTo?: string;
  className?: string;
};

/**
 * Einheitlicher Seitenkopf: Titel, Beschreibung und Aktionen.
 *
 * Auf schmalen Geräten stehen die Aktionen als eigene Zeile unter dem Titel.
 * Ob ein Knopf dort die volle Breite einnimmt, entscheidet die Seite selbst
 * (`w-full sm:w-auto` bzw. `flex-1 sm:flex-none`).
 */
export function PageHeader({
  title,
  description,
  actions,
  backTo,
  className,
}: Props) {
  const navigate = useNavigate();
  const t = useT();

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {backTo != null && (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 shrink-0"
            aria-label={t.common.back}
            onClick={() => navigate(backTo)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {description != null && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions != null && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
