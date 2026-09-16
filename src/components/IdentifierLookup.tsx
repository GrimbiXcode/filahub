import { useState, type FormEvent } from "react";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useT } from "@/lib/i18nContext";
import { useQuickActions } from "@/lib/quickActions";
import { trpc } from "@/lib/trpc";
import { roleAllows } from "@contracts/organizations";
import { cn } from "@/lib/utils";

/**
 * Schnellzugriff: Kennung vom Gebinde ablesen, eintippen, wiegen.
 *
 * Gesucht wird über **alle** Lager des Bereichs: Wer eine Kennung von einem
 * Gebinde in der Hand abliest, weiß nicht, welches Lager gerade gewählt ist –
 * und „nicht gefunden“ für etwas, das man in der Hand hält, ist die schlechteste
 * Antwort. Erst exakt, dann als Teiltreffer, aber nur bei genau einem Treffer.
 *
 * Bis 3.0 stand das Feld auf der Übersicht; seit der Kopfzeile ist es auf jeder
 * Seite da, weil die Waage nicht danach fragt, welche Seite offen ist. Ab
 * `weigher` – das Feld führt nirgendwo anders hin als ins Wiegen.
 */
export function IdentifierLookup({
  className,
  compact = false,
}: {
  className?: string;
  /** Ohne eigenen Knopf – Absenden mit Eingabetaste, für schmale Stellen */
  compact?: boolean;
}) {
  const t = useT();
  const scope = useActiveScope();
  const role = useScopeRole();
  const { openWeighing } = useQuickActions();
  const [value, setValue] = useState("");
  const { data: allMaterials } = trpc.material.list.useQuery(
    { ...scope },
    { enabled: roleAllows(role, "weigher") }
  );

  if (!roleAllows(role, "weigher")) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = value.trim().toLowerCase();
    if (!q) return;
    const list = allMaterials ?? [];
    const exact = list.find(m => m.identifier?.toLowerCase() === q);
    const candidates = exact
      ? [exact]
      : list.filter(
          m =>
            m.identifier?.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q)
        );
    if (candidates.length === 1) {
      setValue("");
      openWeighing(candidates[0]);
      return;
    }
    toast.error(
      candidates.length === 0
        ? t.home.lookupNotFound({ query: value.trim() })
        : t.home.lookupAmbiguous({ query: value.trim() })
    );
  };

  return (
    <form className={cn("flex min-w-0 gap-2", className)} onSubmit={submit}>
      <div className="relative min-w-0 flex-1">
        <Scale className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="identifier-lookup"
          className="h-10 pl-9 font-mono text-sm placeholder:font-sans"
          placeholder={t.home.lookupPlaceholder}
          autoComplete="off"
          value={value}
          onChange={e => setValue(e.target.value)}
          aria-label={t.home.lookupAria}
        />
      </div>
      {!compact && (
        <Button type="submit" className="h-10 shrink-0">
          <Scale className="mr-2 h-4 w-4" /> {t.nav.weigh}
        </Button>
      )}
    </form>
  );
}
