import { useAuth } from "@/hooks/useAuth";
import { roleAllows } from "@contracts/organizations";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  ADMIN_ABUSE_PATH,
  ADMIN_PRESETS_PATH,
  ADMIN_PROPOSALS_PATH,
  ADMIN_SYSTEM_PATH,
  ADMIN_USERS_PATH,
  APP_NAME,
  APPEARANCE_PATH,
  CONTAINER_TYPES_PATH,
  DRYBOXES_PATH,
  FRIENDS_PATH,
  LAGER_PATH,
  ORGANIZATIONS_PATH,
  LEGAL_DOCUMENTS,
  LEGAL_PATHS,
  LOGIN_PATH,
  RELEASE_NOTES_PATH,
  SETTINGS_PATH,
} from "@/const";
import {
  Archive,
  Building2,
  Boxes,
  Database,
  Disc3,
  FileUp,
  Inbox,
  LayoutDashboard,
  Library,
  LogOut,
  Monitor,
  Moon,
  PanelLeft,
  Palette,
  Printer,
  Scale,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  UserCog,
  Users,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router";
import Blocked from "@/pages/Blocked";
import { AuthLayoutSkeleton } from "./AuthLayoutSkeleton";
import { LogoMark, Wordmark } from "./Logo";
import { TopBar } from "./TopBar";
import { QuickActionsHost } from "./QuickActions";
import { useQuickActions } from "@/lib/quickActions";
import { setActiveLagerId, useActiveLagerId } from "@/lib/activeLager";
import { useReleaseNotes } from "@/hooks/useReleaseNotes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ThemeToggle } from "./ThemeToggle";
import { useT, type TextKey } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { Messages } from "@/messages/de";
import { THEMES, useAppTheme, type Theme } from "@/lib/theme";
import { isMac } from "@/lib/formKeyboard";
import {
  setActiveOrganizationId,
  useActiveScope,
  useScopeRole,
} from "@/lib/activeScope";
import { Button } from "./ui/button";

/**
 * Die Einträge tragen den Schlüssel in `t.nav`, nicht die fertige
 * Beschriftung – sonst wäre die Sprache beim Modulladen eingefroren.
 */
type NavKey = TextKey<"nav">;

const menuItems: {
  icon: typeof LayoutDashboard;
  label: NavKey;
  path: string;
}[] = [
  { icon: LayoutDashboard, label: "overview", path: "/" },
  { icon: FileUp, label: "import", path: "/import" },
  { icon: Boxes, label: "lager", path: LAGER_PATH },
  { icon: Disc3, label: "containerTypes", path: CONTAINER_TYPES_PATH },
  { icon: Archive, label: "storageBoxes", path: DRYBOXES_PATH },
  { icon: Palette, label: "appearance", path: APPEARANCE_PATH },
  { icon: Users, label: "friends", path: FRIENDS_PATH },
  { icon: Building2, label: "organizations", path: ORGANIZATIONS_PATH },
];

/** Nur für Administratoren sichtbar; abgesichert wird serverseitig (adminQuery) */
const adminMenuItems: {
  icon: typeof LayoutDashboard;
  label: NavKey;
  path: string;
}[] = [
  { icon: Library, label: "presetCatalog", path: ADMIN_PRESETS_PATH },
  { icon: Inbox, label: "proposals", path: ADMIN_PROPOSALS_PATH },
  { icon: UserCog, label: "users", path: ADMIN_USERS_PATH },
  { icon: ShieldAlert, label: "abuse", path: ADMIN_ABUSE_PATH },
  { icon: Database, label: "system", path: ADMIN_SYSTEM_PATH },
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

/** Tastenkürzel beschriften – auf dem Mac ⌘, sonst die Steuerungstaste */
function searchShortcut(t: Messages): string {
  return isMac ? "⌘K" : `${t.common.ctrlKey} K`;
}

/** Titel für die Kopfzeile auf schmalen Geräten */
function titleForPath(pathname: string, t: Messages): string {
  const item = [...menuItems, ...adminMenuItems].find(
    entry => entry.path === pathname
  );
  if (item) return t.nav[item.label] as string;
  if (pathname === RELEASE_NOTES_PATH) return t.nav.releaseNotes;
  if (pathname === SETTINGS_PATH) return t.nav.settings;
  if (pathname.startsWith("/material/")) return t.nav.material;
  // Eine einzelne Organisation trägt ihren Namen erst nach dem Laden – die
  // Kopfzeile nennt bis dahin den Bereich.
  if (pathname.startsWith(`${ORGANIZATIONS_PATH}/`)) return t.nav.organizations;
  return APP_NAME;
}

/**
 * Ob die Seitenleiste ausgefahren startet. Seit 3.0 ist sie standardmäßig eine
 * Symbolleiste; wer sie ausfährt, bekommt das über das Cookie der
 * Sidebar-Komponente beim nächsten Mal wieder.
 */
function sidebarStartsOpen(): boolean {
  return document.cookie.split("; ").includes("sidebar_state=true");
}

export default function AuthLayout({
  children,
  fullWidth = false,
}: {
  children: ReactNode;
  /** Ohne Maximalbreite – die Übersicht braucht den Platz für Regal und Detail */
  fullWidth?: boolean;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { isLoading, user, isBlocked } = useAuth();
  const t = useT();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (isLoading) {
    return <AuthLayoutSkeleton />;
  }

  /*
    Gesperrt: keine Seitenleiste, keine Inhalte, nur die Sperrseite.

    Die Prüfung steht **vor** `!user` und vor allem anderen, weil dies die
    einzige Stelle ist, an der sich App-Oberfläche und Schranke entscheiden –
    jede geschützte Seite rendert `AuthLayout`. Eine eigene Route wäre ein
    zweiter Weg, und wer eine Route vergisst, hätte ein Loch; hier kann nichts
    vorbeikommen. Abgesichert ist die Sperre ohnehin serverseitig
    (`authedQuery` in `api/middleware.ts`) – das hier ist die Oberfläche dazu,
    nicht der Riegel.
  */
  if (isBlocked) {
    return <Blocked />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-4">
            <h1 className="text-center text-2xl font-semibold tracking-tight">
              {t.authGate.title}
            </h1>
            <p className="max-w-sm text-center text-sm text-muted-foreground">
              {t.authGate.description}
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = LOGIN_PATH;
            }}
            size="lg"
            className="w-full"
          >
            {t.authGate.action}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={sidebarStartsOpen()}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          // Die Symbolleiste: 64 px, damit 44-px-Knöpfe Luft haben
          "--sidebar-width-icon": "4rem",
        } as CSSProperties
      }
    >
      <AuthLayoutContent
        setSidebarWidth={setSidebarWidth}
        fullWidth={fullWidth}
      >
        {children}
      </AuthLayoutContent>
    </SidebarProvider>
  );
}

type AuthLayoutContentProps = {
  children: ReactNode;
  setSidebarWidth: (width: number) => void;
  fullWidth: boolean;
};

/**
 * Knöpfe der Leiste: in der Symbolleiste 44 px groß und rund, mittig – die
 * Sidebar-Komponente setzt dort 32 px mit `!important`, deshalb ebenso.
 */
const railButton =
  "h-10 transition-all group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:[&>span:last-child]:hidden";

function AuthLayoutContent({
  children,
  setSidebarWidth,
  fullWidth,
}: AuthLayoutContentProps) {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, toggleSidebar, setOpenMobile } = useSidebar();
  const { openPalette } = useQuickActions();
  const { theme, setTheme } = useAppTheme();
  const { unreadCount } = useReleaseNotes();
  /*
    Offene Anfragen für das Abzeichen. `AuthLayout` rendert auf **jeder** Seite,
    deshalb hinter einem `staleTime` – ohne das wäre es eine Abfrage pro
    Seitenwechsel für eine Zahl, die sich selten ändert. Vorbild ist
    `trpc.auth.me` in `src/providers/i18n.tsx`.
  */
  const { data: pending } = trpc.friend.pendingCount.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const pendingFriends = pending?.count ?? 0;
  /*
    Offene Einladungen in Organisationen – dieselbe Bauart und derselbe
    `staleTime` wie beim Freundes-Zähler darüber.
  */
  const { data: pendingInvitations } = trpc.organization.pendingCount.useQuery(
    undefined,
    {
      staleTime: 1000 * 60 * 5,
      retry: false,
    }
  );
  const pendingOrganizations = pendingInvitations ?? 0;
  const role = useScopeRole();
  const t = useT();
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:mx-auto"
                aria-label={t.nav.toggleSidebar}
              >
                {/* Eingeklappt ist die Bildmarke der Griff – ein zweites
                    Symbol hätte in 64 px keinen Platz. */}
                {isCollapsed ? (
                  <LogoMark className="h-6 w-6" />
                ) : (
                  <PanelLeft className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {!isCollapsed ? (
                <Wordmark className="min-w-0 [&>span]:truncate" />
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            {/* Ab dem Tablet stehen Bereich und Lager in der Kopfzeile
                (`TopBar`); hier nur noch für die ausgefahrene Leiste auf dem
                Telefon. */}
            <div className="md:hidden">
              <OrganizationSwitcher />
              <LagerSwitcher />
            </div>

            {/* Häufigste Aktionen ganz oben: wiegen und suchen. Ab dem Tablet
                trägt sie die Kopfzeile, deshalb dort ausgeblendet. */}
            <SidebarMenu className="px-2 py-1 md:hidden">
              {/*
                Der auffälligste Knopf der ganzen Oberfläche – unterhalb von
                `weigher` gehört er weg, sonst führt der wichtigste Weg der App
                in ein `FORBIDDEN`. Die Schnellsuche darunter bleibt: Suchen
                darf jedes Mitglied.
              */}
              {roleAllows(role, "weigher") && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => {
                      setOpenMobile(false);
                      openPalette("weigh");
                    }}
                    tooltip={t.nav.weighMaterial}
                    className="h-10 bg-primary font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                  >
                    <Scale className="h-4 w-4" />
                    <span>{t.nav.weigh}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {/*
                Verbrauch abbuchen (seit 2.9.0): so häufig wie Wiegen, aber
                ohne die Hervorhebung – der auffälligste Knopf bleibt einer.
              */}
              {roleAllows(role, "weigher") && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => {
                      setOpenMobile(false);
                      openPalette("consume");
                    }}
                    tooltip={t.nav.consumeMaterial}
                    className="h-10 font-medium"
                  >
                    <Printer className="h-4 w-4" />
                    <span>{t.nav.consume}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    setOpenMobile(false);
                    openPalette();
                  }}
                  tooltip={t.nav.searchWithShortcut({
                    shortcut: searchShortcut(t),
                  })}
                  className="h-10 font-normal text-muted-foreground"
                >
                  <Search className="h-4 w-4" />
                  <span>{t.common.search}</span>
                  <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline-block">
                    {searchShortcut(t)}
                  </kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            <SidebarSeparator className="my-2" />

            <SidebarMenu className="px-2 py-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
              {menuItems.map(item => {
                const isActive = location.pathname === item.path;
                /*
                  Offene Freundschafts- und Ausleih-Anfragen als Zähler. Nur
                  dieser Eintrag trägt einen – deshalb die Abfrage hier statt
                  eines `badge`-Feldes in der Tabelle oben, das bei allen
                  anderen leer bliebe.
                */
                const badge =
                  item.path === FRIENDS_PATH
                    ? pendingFriends
                    : item.path === ORGANIZATIONS_PATH
                      ? pendingOrganizations
                      : 0;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => go(item.path)}
                      tooltip={
                        badge === 0
                          ? t.nav[item.label]
                          : item.path === FRIENDS_PATH
                            ? t.nav.friendsPending({ count: badge })
                            : t.nav.organizationsPending({ count: badge })
                      }
                      className={`${railButton} font-normal`}
                    >
                      <span className="relative flex shrink-0 items-center justify-center">
                        <item.icon
                          className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                        />
                        {/* Wie bei den Neuerungen: In der eingeklappten Leiste
                            blendet SidebarMenuBadge aus, dort bleibt der Punkt. */}
                        {badge > 0 && (
                          <span
                            aria-hidden
                            className="absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-primary group-data-[collapsible=icon]:block"
                          />
                        )}
                      </span>
                      <span>{t.nav[item.label]}</span>
                    </SidebarMenuButton>
                    {badge > 0 && (
                      <SidebarMenuBadge className="bg-primary text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-[active=true]/menu-button:text-primary-foreground">
                        {badge}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {isAdmin && (
              <>
                <SidebarSeparator className="my-2" />
                <SidebarGroup className="py-0">
                  <SidebarGroupLabel>{t.nav.administration}</SidebarGroupLabel>
                  <SidebarMenu className="px-2 py-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
                    {adminMenuItems.map(item => {
                      const isActive = location.pathname === item.path;
                      return (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => go(item.path)}
                            tooltip={t.nav[item.label]}
                            className={`${railButton} font-normal`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                            />
                            <span>{t.nav[item.label]}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroup>
              </>
            )}
          </SidebarContent>

          <SidebarFooter className="p-3 group-data-[collapsible=icon]:px-0">
            <SidebarMenu className="group-data-[collapsible=icon]:items-center">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === RELEASE_NOTES_PATH}
                  onClick={() => go(RELEASE_NOTES_PATH)}
                  tooltip={
                    unreadCount > 0
                      ? t.nav.releaseNotesUnread({ count: unreadCount })
                      : t.nav.releaseNotes
                  }
                  className={`${railButton} font-normal`}
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
                  <span>{t.nav.releaseNotes}</span>
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
                  tooltip={t.nav.settings}
                  className={`${railButton} font-normal`}
                >
                  <Settings
                    className={`h-4 w-4 ${
                      location.pathname === SETTINGS_PATH ? "text-primary" : ""
                    }`}
                  />
                  <span>{t.nav.settings}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-sidebar-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center">
                  {/*
                    Bewusst nur die Initialen: Ein Telegram-Profilbild käme von
                    Telegrams CDN und würde bei jedem Seitenaufruf dorthin
                    zurückrufen.
                  */}
                  <Avatar className="h-9 w-9 shrink-0 border">
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
                  {t.theme.label}
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
                        {t.theme[value]}
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
                  <span>{t.nav.signOut}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Rechtstexte müssen von überall erreichbar sein. In der
                eingeklappten Leiste ist kein Platz dafür – dort führt der Weg
                über die Einstellungen. */}
            <nav className="flex flex-wrap gap-x-3 gap-y-1 px-1 pt-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {LEGAL_DOCUMENTS.map(entry => (
                <a
                  key={entry}
                  href={LEGAL_PATHS[entry]}
                  className="underline-offset-2 hover:text-foreground hover:underline"
                >
                  {t.legal[entry]}
                </a>
              ))}
            </nav>
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
        {/* Ab dem Tablet: Bereich, Lager, Kennung und die häufigsten
            Handgriffe – per CSS ausgeblendet, nicht per Hook, damit beim
            ersten Rendern nichts springt. */}
        <TopBar />
        {/* Kopfzeile nur auf schmalen Geräten – ebenfalls per CSS. */}
        <div className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b bg-background/95 px-2 backdrop-blur-sm supports-backdrop-filter:bg-background/80 md:hidden">
          <SidebarTrigger className="size-10 rounded-lg" />
          <span className="min-w-0 flex-1 truncate font-medium tracking-tight">
            {titleForPath(location.pathname, t)}
          </span>
          {roleAllows(role, "weigher") && (
            <Button
              variant="ghost"
              size="icon"
              className="size-10"
              aria-label={t.nav.weighMaterial}
              onClick={() => openPalette("weigh")}
            >
              <Scale className="h-5 w-5" />
            </Button>
          )}
          {roleAllows(role, "weigher") && (
            <Button
              variant="ghost"
              size="icon"
              className="size-10"
              aria-label={t.nav.consumeMaterial}
              onClick={() => openPalette("consume")}
            >
              <Printer className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            aria-label={t.common.search}
            onClick={() => openPalette()}
          >
            <Search className="h-5 w-5" />
          </Button>
          <ThemeToggle className="size-10" />
        </div>
        {/*
          Letzte Absicherung gegen seitliches Schieben: `clip` statt `hidden`,
          weil es keinen Scroll-Container erzeugt und `position: sticky` im
          Inhalt deshalb weiter funktioniert. Der eigentliche Schutz sind die
          Regeln an den Feldern selbst – das hier fängt nur ab, dass ein
          einzelner Ausreisser die ganze Seite verschiebbar macht.
        */}
        <main className="min-w-0 flex-1 overflow-x-clip">
          <div
            className={`mx-auto w-full p-4 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-10 ${
              fullWidth ? "max-w-none" : "max-w-7xl"
            }`}
          >
            {children}
          </div>
        </main>
      </SidebarInset>

      <QuickActionsHost />
    </>
  );
}

/**
 * Auswahl des aktiven Lagers – gehört ins Layout, nicht auf die Seiten.
 *
 * Die Wahl gilt für alles: Materialübersicht, Statistik, Filter, neues
 * Material. Läge sie auf der Übersicht, wäre sie beim Wiegen aus einem Dialog
 * heraus nicht erreichbar.
 *
 * Erscheint erst ab **zwei** Lagern. Mit einem einzigen wäre es ein Auswahlfeld
 * ohne Auswahl, und mit keinem hätte es nichts anzuzeigen – dann führt der
 * Verweis auf die Verwaltung weiter.
 */
/**
 * Umschalter zwischen dem eigenen Bestand und den Organisationen.
 *
 * Anders als der `LagerSwitcher` darunter erscheint er schon ab **einer**
 * Organisation: „Privat" gibt es immer, also stehen dann bereits zwei Einträge
 * zur Wahl. Wer in keiner ist, sieht ihn nicht – der Weg führt über den
 * Navigationseintrag.
 *
 * Das Umschalten lädt alles Betroffene von selbst neu: `organizationId` ist
 * Teil des Query-Schlüssels jeder bereichsbezogenen Abfrage. Genau dafür ist
 * das Feld serverseitig Pflicht und nicht optional.
 */
function OrganizationSwitcher() {
  const t = useT();
  const { organizationId } = useActiveScope();
  const { data: memberships } = trpc.organization.list.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (!memberships || memberships.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-3 py-2 group-data-[collapsible=icon]:hidden">
      <span className="text-xs font-medium text-muted-foreground">
        {t.organizations.scopeLabel}
      </span>
      <Select
        value={organizationId == null ? PERSONAL_VALUE : String(organizationId)}
        onValueChange={value =>
          setActiveOrganizationId(
            value === PERSONAL_VALUE ? null : Number(value)
          )
        }
      >
        <SelectTrigger
          className="h-9 w-full"
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
    </div>
  );
}

/**
 * Der persönliche Bereich braucht im `Select` einen Wert – `""` behandelt Radix
 * als „nichts gewählt" und zeigte dann den Platzhalter statt „Privat".
 */
const PERSONAL_VALUE = "personal";

function LagerSwitcher() {
  const t = useT();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const scope = useActiveScope();
  const { data: lagerList } = trpc.lager.list.useQuery(scope, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const activeId = useActiveLagerId(lagerList);

  if (!lagerList || lagerList.length === 0) {
    return (
      <div className="px-3 py-2 group-data-[collapsible=icon]:hidden">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            setOpenMobile(false);
            navigate(LAGER_PATH);
          }}
        >
          <Boxes className="mr-2 h-4 w-4" />
          {t.lager.firstLager}
        </Button>
      </div>
    );
  }

  if (lagerList.length === 1) return null;

  return (
    <div className="flex flex-col gap-1 px-3 py-2 group-data-[collapsible=icon]:hidden">
      <span className="text-xs font-medium text-muted-foreground">
        {t.lager.switchLabel}
      </span>
      <Select
        value={activeId != null ? String(activeId) : undefined}
        onValueChange={value => setActiveLagerId(Number(value))}
      >
        <SelectTrigger className="h-9 w-full" aria-label={t.lager.switchAria}>
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
    </div>
  );
}
