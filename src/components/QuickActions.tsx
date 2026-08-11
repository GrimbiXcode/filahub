import { useEffect, useState } from "react";
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
  Users,
} from "lucide-react";
import { FRIEND_SEARCH_MIN_LENGTH } from "@contracts/friends";
import { LoanRequestDialog } from "@/components/LoanRequestDialog";
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
import { FRIENDS_PATH, RELEASE_NOTES_PATH, SETTINGS_PATH } from "@/const";
import { useAuth } from "@/hooks/useAuth";
import { useDebounced } from "@/hooks/useDebounced";
import { useFormat } from "@/lib/formatContext";
import {
  getQuickActionsState,
  quickActions,
  setQuickActionsState,
  useQuickActionsState,
  type PaletteMode,
} from "@/lib/quickActions";
import { useT, type TextKey } from "@/lib/i18nContext";
import { useAppTheme } from "@/lib/theme";
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
      <LoanRequestDialog
        open={current.loanFor != null}
        onOpenChange={open => !open && setQuickActionsState({ loanFor: null })}
        material={current.loanFor}
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

/** Schlüssel in `t.nav` statt fertiger Beschriftung – siehe AuthLayout */
type NavKey = TextKey<"nav">;

const NAV_TARGETS: { icon: typeof Archive; label: NavKey; path: string }[] = [
  { icon: LayoutDashboard, label: "overview", path: "/" },
  { icon: Disc3, label: "spoolTypes", path: "/rollentypen" },
  { icon: Archive, label: "storageBoxes", path: "/lagerboxen" },
  { icon: Users, label: "friends", path: FRIENDS_PATH },
  { icon: FileUp, label: "import", path: "/import" },
  { icon: Sparkles, label: "releaseNotes", path: RELEASE_NOTES_PATH },
  { icon: SettingsIcon, label: "settings", path: SETTINGS_PATH },
];

const ADMIN_TARGETS: { icon: typeof Archive; label: NavKey; path: string }[] = [
  { icon: Library, label: "presetCatalog", path: "/verwaltung/presets" },
  { icon: Package, label: "proposals", path: "/verwaltung/vorschlaege" },
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
  const t = useT();
  // Erst laden, wenn die Suche wirklich geöffnet wird
  const { data: materials } = trpc.material.list.useQuery(undefined, {
    enabled: open,
  });

  /*
    Der Suchbegriff liegt im Zustand, weil das eigene Lager und das der Freunde
    unterschiedlich gesucht werden: Das eigene filtert cmdk im Browser über die
    vollständig geladene Liste, das der Freunde muss der Server durchsuchen –
    sonst wäre die Sichtbarkeitsstufe „nur in der Suche“ wirkungslos, weil die
    Liste ohnehin im Browser läge.
  */
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 300);
  const { data: friendMaterials } = trpc.friend.searchMaterials.useQuery(
    { query: debounced },
    {
      enabled: open && debounced.length >= FRIEND_SEARCH_MIN_LENGTH,
      staleTime: 1000 * 30,
    }
  );

  // Beim Öffnen mit leerem Feld beginnen, damit nicht die letzte Suche
  // stehenbleibt. Wie im WeighingDialog bewusst während des Renderns.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }

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
          {t.quick.remaining({
            amount: formatGrams(material.remainingWeight),
          })}
        </span>
      </div>
      {material.identifier && (
        <Badge variant="outline" className="ml-2 shrink-0 font-mono text-xs">
          {material.identifier}
        </Badge>
      )}
    </CommandItem>
  ));

  /*
    Treffer bei Freunden. Der rohe Suchbegriff steht mit im `value`, damit
    cmdk sie nicht ein zweites Mal wegfiltert: Die Zeilen kommen schon passend
    vom Server, cmdk kennt aber nur seinen eigenen Filter über `value`.
  */
  const friendItems = (friendMaterials ?? []).map(material => (
    <CommandItem
      key={`friend-${material.id}`}
      value={[
        debounced,
        material.name,
        material.materialType,
        material.manufacturer,
        material.color,
        material.ownerName,
      ]
        .filter(Boolean)
        .join(" ")}
      onSelect={() => run(() => quickActions.openLoanRequest(material))}
    >
      <Users className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate leading-tight">{material.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {t.friends.ownerLabel({ name: material.ownerName })} ·{" "}
          {material.materialType} ·{" "}
          {t.quick.remaining({
            amount: formatGrams(material.remainingWeight),
          })}
        </span>
      </div>
      <Badge variant="secondary" className="ml-2 shrink-0 text-xs">
        {t.loan.ask}
      </Badge>
    </CommandItem>
  ));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "weigh" ? t.quick.weighTitle : t.quick.searchTitle}
      description={
        mode === "weigh" ? t.quick.weighDescription : t.quick.searchDescription
      }
      className="sm:max-w-xl"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={
          mode === "weigh"
            ? t.quick.weighPlaceholder
            : t.quick.searchPlaceholder
        }
      />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>{t.common.nothingFound}</CommandEmpty>

        {mode === "weigh" ? (
          <CommandGroup heading={t.quick.groupWeigh}>
            {materialItems}
          </CommandGroup>
        ) : (
          <>
            <CommandGroup heading={t.quick.groupActions}>
              <CommandItem
                value={t.quick.keywordsWeigh}
                onSelect={() => onModeChange("weigh")}
              >
                <Scale className="mr-2 h-4 w-4" />
                {t.quick.weighTitle}
              </CommandItem>
              <CommandItem
                value={t.quick.keywordsNewMaterial}
                onSelect={() => run(() => quickActions.openMaterialForm())}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t.quick.newMaterial}
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading={t.quick.groupJumpTo}>
              {NAV_TARGETS.map(target => (
                <CommandItem
                  key={target.path}
                  value={t.quick.keywordsGoTo({ label: t.nav[target.label] })}
                  onSelect={() => run(() => navigate(target.path))}
                >
                  <target.icon className="mr-2 h-4 w-4" />
                  {t.nav[target.label]}
                </CommandItem>
              ))}
              {isAdmin &&
                ADMIN_TARGETS.map(target => (
                  <CommandItem
                    key={target.path}
                    value={t.quick.keywordsAdmin({
                      label: t.nav[target.label],
                    })}
                    onSelect={() => run(() => navigate(target.path))}
                  >
                    <target.icon className="mr-2 h-4 w-4" />
                    {t.nav[target.label]}
                  </CommandItem>
                ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading={t.theme.label}>
              <CommandItem
                value={t.quick.keywordsThemeLight}
                onSelect={() => run(() => setTheme("light"))}
              >
                <Sun className="mr-2 h-4 w-4" />
                {t.theme.light}
                {theme === "light" && (
                  <CommandShortcut>{t.theme.active}</CommandShortcut>
                )}
              </CommandItem>
              <CommandItem
                value={t.quick.keywordsThemeDark}
                onSelect={() => run(() => setTheme("dark"))}
              >
                <Moon className="mr-2 h-4 w-4" />
                {t.theme.dark}
                {theme === "dark" && (
                  <CommandShortcut>{t.theme.active}</CommandShortcut>
                )}
              </CommandItem>
              <CommandItem
                value={t.quick.keywordsThemeSystem}
                onSelect={() => run(() => setTheme("system"))}
              >
                <Monitor className="mr-2 h-4 w-4" />
                {t.theme.system}
                {theme === "system" && (
                  <CommandShortcut>{t.theme.active}</CommandShortcut>
                )}
              </CommandItem>
            </CommandGroup>

            {materialItems.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t.quick.groupMaterials}>
                  {materialItems}
                </CommandGroup>
              </>
            )}

            {friendItems.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t.friends.searchTitle}>
                  {friendItems}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
