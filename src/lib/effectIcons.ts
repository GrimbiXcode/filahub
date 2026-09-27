import type { ColorEffectKind } from "@contracts/appearance";
import {
  Eye,
  Lightbulb,
  Moon,
  Radio,
  Sparkles,
  Sun,
  Thermometer,
  type LucideIcon,
} from "lucide-react";

/**
 * Ein Zeichen je Wirkung (seit 4.8.0) – an der Spule, im Editor und im
 * Filter der Übersicht dasselbe. Eigene Datei, weil Komponenten-Dateien für
 * React Fast Refresh nur Komponenten exportieren dürfen.
 */
export const EFFECT_ICONS: Readonly<Record<ColorEffectKind, LucideIcon>> = {
  photochromic: Sun,
  thermochromic: Thermometer,
  phosphorescent: Moon,
  fluorescent: Lightbulb,
  goniochromic: Eye,
  infrared: Radio,
  other: Sparkles,
};
