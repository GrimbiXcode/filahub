Using Node.js 26, Tailwind CSS v4.3.3, and Vite v8.2.1

Tailwind CSS has been set up with the shadcn theme

Setup complete: /mnt/agents/output/app

Components (40+):
accordion, alert-dialog, alert, aspect-ratio, avatar, badge, breadcrumb,
button-group, button, calendar, card, carousel, chart, checkbox, collapsible,
command, context-menu, dialog, drawer, dropdown-menu, empty, field, form,
hover-card, input-group, input-otp, input, item, kbd, label, menubar,
navigation-menu, pagination, popover, progress, radio-group, resizable,
scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner,
spinner, switch, table, tabs, textarea, toggle-group, toggle, tooltip

Usage:
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'

Structure:
src/sections/ Page sections
src/hooks/ Custom hooks
src/types/ Type definitions
src/App.css Styles specific to the Webapp
src/App.tsx Root React component
src/index.css Global styles and Tailwind's theme (CSS-first, no tailwind.config.js)
src/main.tsx Entry point for rendering the Webapp
index.html Entry point for the Webapp
vite.config.ts Main build and dev server settings for Vite
postcss.config.js Config file for CSS post-processing tools
