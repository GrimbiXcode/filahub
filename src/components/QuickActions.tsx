import { useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Archive,
  Disc3,
  FileUp,
  LayoutDashboard,
  Library,
  Monitor,
  Moon,
  Package,
  Plus,
  Scale,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
} from "lucide-react";
import { MaterialFormDialog } from "@/components/MaterialFormDialog";
import { WeighingDialog } from "@/components/WeighingDialog";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { RELEASE_NOTES_PATH, SETTINGS_PATH } from "@/const";
import { useAuth } from "@/hooks/useAuth";
import { useFormat } from "@/lib/formatContext";
import {
  getQuickActionsState,
  quickActions,
  setQuickActionsState,
  useQuickActionsState,
  type PaletteMode,
} from "@/lib/quickActions";
import { THEME_LABELS, useAppTheme } from "@/lib/theme";
import { trpc } from "@/lib/trpc";

/**
 * Rendert die Dialoge der Schnellaktionen. Gehört genau einmal ins Layout;
 * ausgelöst werden sie über `quickActions` aus `@/lib/quickActions`.
 */
export function QuickActionsHost() {
  const current = useQuickActionsState();

  // Strg/⌘ + K öffnet die Schnellsuche (⌘ + B gehört der Seitenleiste)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setQuickActionsState({
          paletteOpen: !getQuickActionsState().paletteOpen,
          paletteMode: "palette",
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {current.formMounted && (
        <MaterialFormDialog
          open={current.formOpen}
          onOpenChange={open => setQuickActionsState({ formOpen: open })}
          material={current.editing}
        />
      )}
      <WeighingDialog
        open={current.weighingFor != null}
        onOpenChange={open =>
          !open && setQuickActionsState({ weighingFor: null })
        }
        material={current.weighingFor}
      />
      <CommandPalette
        open={current.paletteOpen}
        mode={current.paletteMode}
        onOpenChange={open =>
          setQuickActionsState({
            paletteOpen: open,
            paletteMode: open ? getQuickActionsState().paletteMode : "palette",
          })
        }
        onModeChange={mode => setQuickActionsState({ paletteMode: mode })}
      />
    </>
  );
}

const NAV_TARGETS = [
  { icon: LayoutDashboard, label: "Materialübersicht", path: "/" },
  { icon: Disc3, label: "Rollentypen", path: "/rollentypen" },
  { icon: Archive, label: "Lagerboxen", path: "/lagerboxen" },
  { icon: FileUp, label: "Massenimport", path: "/import" },
  { icon: Sparkles, label: "Neuerungen", path: RELEASE_NOTES_PATH },
  { icon: SettingsIcon, label: "Einstellungen", path: SETTINGS_PATH },
];

const ADMIN_TARGETS = [
  { icon: Library, label: "Preset-Katalog", path: "/verwaltung/presets" },
  { icon: Package, label: "Vorschläge", path: "/verwaltung/vorschlaege" },
];

type PaletteProps = {
  open: boolean;
  mode: PaletteMode;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: PaletteMode) => void;
};

function CommandPalette({
  open,
  mode,
  onOpenChange,
  onModeChange,
}: PaletteProps) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { formatGrams } = useFormat();
  const { theme, setTheme } = useAppTheme();
  // Erst laden, wenn die Suche wirklich geöffnet wird
  const { data: materials } = trpc.material.list.useQuery(undefined, {
    enabled: open,
  });

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const materialItems = (materials ?? []).map(material => (
    <CommandItem
      key={material.id}
      value={[
        material.identifier,
        material.name,
        material.materialType,
        material.manufacturer,
        material.color,
        `#${material.id}`,
      ]
        .filter(Boolean)
        .join(" ")}
      onSelect={() =>
        run(() =>
          mode === "weigh"
            ? quickActions.openWeighing(material)
            : navigate(`/material/${material.id}`)
        )
      }
    >
      <Package className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate leading-tight">{material.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {material.materialType}
          {material.manufacturer ? ` · ${material.manufacturer}` : ""} ·{" "}
          {formatGrams(material.remainingWeight)} übrig
        </span>
      </div>
      {material.identifier && (
        <Badge variant="outline" className="ml-2 shrink-0 font-mono text-xs">
          {material.identifier}
        </Badge>
      )}
    </CommandItem>
  ));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "weigh" ? "Material wiegen" : "Schnellsuche"}
      description={
        mode === "weigh"
          ? "Material auswählen, das gewogen werden soll"
          : "Materialien finden, Seiten öffnen und Aktionen ausführen"
      }
      className="sm:max-w-xl"
    >
      <CommandInput
        placeholder={
          mode === "weigh"
            ? "Kennung oder Bezeichnung des Materials …"
            : "Suchen: Kennung, Material, Seite oder Aktion …"
        }
      />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Nichts gefunden.</CommandEmpty>

        {mode === "weigh" ? (
          <CommandGroup heading="Material zum Wiegen">
            {materialItems}
          </CommandGroup>
        ) : (
          <>
            <CommandGroup heading="Aktionen">
              <CommandItem
                value="wiegen wägung waage material"
                onSelect={() => onModeChange("weigh")}
              >
                <Scale className="mr-2 h-4 w-4" />
                Material wiegen
              </CommandItem>
              <CommandItem
                value="neues material anlegen filament hinzufügen"
                onSelect={() => run(() => quickActions.openMaterialForm())}
              >
                <Plus className="mr-2 h-4 w-4" />
                Neues Material anlegen
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Springe zu">
              {NAV_TARGETS.map(target => (
                <CommandItem
                  key={target.path}
                  value={`gehe zu ${target.label}`}
                  onSelect={() => run(() => navigate(target.path))}
                >
                  <target.icon className="mr-2 h-4 w-4" />
                  {target.label}
                </CommandItem>
              ))}
              {isAdmin &&
                ADMIN_TARGETS.map(target => (
                  <CommandItem
                    key={target.path}
                    value={`verwaltung ${target.label}`}
                    onSelect={() => run(() => navigate(target.path))}
                  >
                    <target.icon className="mr-2 h-4 w-4" />
                    {target.label}
                  </CommandItem>
                ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Farbschema">
              <CommandItem
                value="farbschema hell light"
                onSelect={() => run(() => setTheme("light"))}
              >
                <Sun className="mr-2 h-4 w-4" />
                {THEME_LABELS.light}
                {theme === "light" && <CommandShortcut>aktiv</CommandShortcut>}
              </CommandItem>
              <CommandItem
                value="farbschema dunkel dark nachtmodus"
                onSelect={() => run(() => setTheme("dark"))}
              >
                <Moon className="mr-2 h-4 w-4" />
                {THEME_LABELS.dark}
                {theme === "dark" && <CommandShortcut>aktiv</CommandShortcut>}
              </CommandItem>
              <CommandItem
                value="farbschema system automatisch"
                onSelect={() => run(() => setTheme("system"))}
              >
                <Monitor className="mr-2 h-4 w-4" />
                {THEME_LABELS.system}
                {theme === "system" && <CommandShortcut>aktiv</CommandShortcut>}
              </CommandItem>
            </CommandGroup>

            {materialItems.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Materialien">
                  {materialItems}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
