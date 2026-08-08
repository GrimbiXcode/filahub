import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18nContext";
import { cn } from "@/lib/utils";
import { THEMES, useAppTheme, type Theme } from "@/lib/theme";

const THEME_ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Farbschema umschalten – kompakt als Symbolknopf, gedacht für Kopf- und
 * Seitenleiste.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const { theme, resolvedTheme, setTheme } = useAppTheme();
  const Icon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("shrink-0", className)}
          aria-label={t.theme.current({ theme: t.theme[theme] })}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={value => setTheme(value as Theme)}
        >
          {THEMES.map(value => {
            const ItemIcon = THEME_ICONS[value];
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <ItemIcon className="mr-2 h-4 w-4" />
                {t.theme[value]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Farbschema als Segmentschalter – für die Einstellungen, wo alle drei
 * Möglichkeiten auf einen Blick sichtbar sein sollen.
 */
export function ThemeSegmentedControl() {
  const t = useT();
  const { theme, setTheme } = useAppTheme();

  return (
    <div
      role="radiogroup"
      aria-label={t.theme.label}
      className="grid grid-cols-3 gap-2"
    >
      {THEMES.map(value => {
        const Icon = THEME_ICONS[value];
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-accent font-medium"
                : "hover:bg-accent/50"
            )}
          >
            <Icon className="h-5 w-5" />
            {t.theme[value]}
          </button>
        );
      })}
    </div>
  );
}
