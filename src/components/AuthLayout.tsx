import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { LOGIN_PATH, RELEASE_NOTES_PATH, SETTINGS_PATH } from "@/const";
import {
  Archive,
  Disc3,
  FileUp,
  Inbox,
  LayoutDashboard,
  Library,
  LogOut,
  Monitor,
  Moon,
  PanelLeft,
  Scale,
  Search,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { AuthLayoutSkeleton } from "./AuthLayoutSkeleton";
import { QuickActionsHost } from "./QuickActions";
import { useQuickActions } from "@/lib/quickActions";
import { useReleaseNotes } from "@/hooks/useReleaseNotes";
import { ThemeToggle } from "./ThemeToggle";
import { THEMES, THEME_LABELS, useAppTheme, type Theme } from "@/lib/theme";
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Materialübersicht", path: "/" },
  { icon: FileUp, label: "Import", path: "/import" },
  { icon: Disc3, label: "Rollentypen", path: "/rollentypen" },
  { icon: Archive, label: "Lagerboxen", path: "/lagerboxen" },
];

/** Nur für Administratoren sichtbar; abgesichert wird serverseitig (adminQuery) */
const adminMenuItems = [
  { icon: Library, label: "Preset-Katalog", path: "/verwaltung/presets" },
  { icon: Inbox, label: "Vorschläge", path: "/verwaltung/vorschlaege" },
];

const THEME_ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

/** Tastenkürzel beschriften – auf dem Mac ⌘, sonst Strg */
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const SEARCH_SHORTCUT = isMac ? "⌘K" : "Strg K";

/** Titel für die Kopfzeile auf schmalen Geräten */
function titleForPath(pathname: string): string {
  const item = [...menuItems, ...adminMenuItems].find(
    entry => entry.path === pathname
  );
  if (item) return item.label;
  if (pathname === RELEASE_NOTES_PATH) return "Neuerungen";
  if (pathname === SETTINGS_PATH) return "Einstellungen";
  if (pathname.startsWith("/material/")) return "Material";
  return "Filament-Lager";
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { isLoading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (isLoading) {
    return <AuthLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-4">
            <h1 className="text-center text-2xl font-semibold tracking-tight">
              Bitte anmelden
            </h1>
            <p className="max-w-sm text-center text-sm text-muted-foreground">
              Für den Zugriff auf dein Materiallager ist eine Anmeldung
              erforderlich.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = LOGIN_PATH;
            }}
            size="lg"
            className="w-full"
          >
            Anmelden
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <AuthLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </AuthLayoutContent>
    </SidebarProvider>
  );
}

type AuthLayoutContentProps = {
  children: ReactNode;
  setSidebarWidth: (width: number) => void;
};

function AuthLayoutContent({
  children,
  setSidebarWidth,
}: AuthLayoutContentProps) {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, toggleSidebar, setOpenMobile } = useSidebar();
  const { openPalette } = useQuickActions();
  const { theme, setTheme } = useAppTheme();
  const { unreadCount } = useReleaseNotes();
  const isCollapsed = state === "collapsed";
  const [isDragging, setIsDragging] = useState(false);
  // In der eingeklappten Leiste gibt es nichts zu ziehen – abgeleitet statt
  // per Effekt zurückgesetzt.
  const isResizing = isDragging && !isCollapsed;
  const sidebarRef = useRef<HTMLDivElement>(null);

  /** Navigieren und dabei die ausgefahrene Leiste auf dem Telefon schließen */
  const go = (path: string) => {
    setOpenMobile(false);
    navigate(path);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0">
          <SidebarHeader className="h-16 justify-center">
            <div className="flex w-full items-center gap-3 px-2 transition-all">
              <button
                onClick={toggleSidebar}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                aria-label="Navigation ein-/ausklappen"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <span className="truncate font-semibold tracking-tight">
                  Filament-Lager
                </span>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            {/* Häufigste Aktionen ganz oben: wiegen und suchen */}
            <SidebarMenu className="px-2 py-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    setOpenMobile(false);
                    openPalette("weigh");
                  }}
                  tooltip="Material wiegen"
                  className="h-10 bg-primary font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                >
                  <Scale className="h-4 w-4" />
                  <span>Wiegen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    setOpenMobile(false);
                    openPalette();
                  }}
                  tooltip={`Suchen (${SEARCH_SHORTCUT})`}
                  className="h-10 font-normal text-muted-foreground"
                >
                  <Search className="h-4 w-4" />
                  <span>Suchen …</span>
                  <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline-block">
                    {SEARCH_SHORTCUT}
                  </kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            <SidebarSeparator className="my-2" />

            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => go(item.path)}
                      tooltip={item.label}
                      className="h-10 font-normal transition-all"
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {isAdmin && (
              <>
                <SidebarSeparator className="my-2" />
                <SidebarGroup className="py-0">
                  <SidebarGroupLabel>Verwaltung</SidebarGroupLabel>
                  <SidebarMenu className="px-2 py-1">
                    {adminMenuItems.map(item => {
                      const isActive = location.pathname === item.path;
                      return (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => go(item.path)}
                            tooltip={item.label}
                            className="h-10 font-normal transition-all"
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                            />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroup>
              </>
            )}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === RELEASE_NOTES_PATH}
                  onClick={() => go(RELEASE_NOTES_PATH)}
                  tooltip={
                    unreadCount > 0
                      ? `Neuerungen (${unreadCount} ungelesen)`
                      : "Neuerungen"
                  }
                  className="h-10 font-normal transition-all"
                >
                  <span className="relative flex shrink-0 items-center justify-center">
                    <Sparkles
                      className={`h-4 w-4 ${
                        location.pathname === RELEASE_NOTES_PATH
                          ? "text-primary"
                          : ""
                      }`}
                    />
                    {/* In der eingeklappten Leiste blendet SidebarMenuBadge aus –
                        dort bleibt nur dieser Punkt am Symbol. */}
                    {unreadCount > 0 && (
                      <span
                        aria-hidden
                        className="absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-primary group-data-[collapsible=icon]:block"
                      />
                    )}
                  </span>
                  <span>Neuerungen</span>
                </SidebarMenuButton>
                {unreadCount > 0 && (
                  <SidebarMenuBadge className="bg-primary text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-[active=true]/menu-button:text-primary-foreground">
                    {unreadCount}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === SETTINGS_PATH}
                  onClick={() => go(SETTINGS_PATH)}
                  tooltip="Einstellungen"
                  className="h-10 font-normal transition-all"
                >
                  <Settings
                    className={`h-4 w-4 ${
                      location.pathname === SETTINGS_PATH ? "text-primary" : ""
                    }`}
                  />
                  <span>Einstellungen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-sidebar-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-9 w-9 shrink-0 border">
                    {user?.avatar && (
                      <AvatarImage
                        src={user.avatar}
                        alt={user.name ?? "Profilbild"}
                      />
                    )}
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-medium leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">
                      {user?.telegramUsername
                        ? `@${user.telegramUsername}`
                        : "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Farbschema
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={value => setTheme(value as Theme)}
                >
                  {THEMES.map(value => {
                    const Icon = THEME_ICONS[value];
                    return (
                      <DropdownMenuRadioItem key={value} value={value}>
                        <Icon className="mr-2 h-4 w-4" />
                        {THEME_LABELS[value]}
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Abmelden</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        {/* Ziehgriff nur am Zeigergerät – auf dem Telefon liegt die Leiste
            als Overlay über der Seite und hat nichts zu ziehen. */}
        <div
          className={`absolute right-0 top-0 z-50 hidden h-full w-1 cursor-col-resize transition-colors hover:bg-primary/20 md:block ${
            isCollapsed ? "md:hidden" : ""
          }`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsDragging(true);
          }}
        />
      </div>

      <SidebarInset className="min-w-0">
        {/* Kopfzeile nur auf schmalen Geräten – per CSS statt per Hook, damit
            beim ersten Rendern nichts springt. */}
        <div className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
          <SidebarTrigger className="size-10 rounded-lg" />
          <span className="min-w-0 flex-1 truncate font-medium tracking-tight">
            {titleForPath(location.pathname)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            aria-label="Material wiegen"
            onClick={() => openPalette("weigh")}
          >
            <Scale className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            aria-label="Suchen"
            onClick={() => openPalette()}
          >
            <Search className="h-5 w-5" />
          </Button>
          <ThemeToggle className="size-10" />
        </div>
        <main className="flex-1">
          <div className="mx-auto w-full max-w-7xl p-4 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-10">
            {children}
          </div>
        </main>
      </SidebarInset>

      <QuickActionsHost />
    </>
  );
}
