---
date: 2026-11-11
title: Grams from Prusa printers
---

## Fixed

Prints that the printer bridge sends from a **Prusa Core One, MK4S or XL**
now arrive in your inbox with the grams of filament they used. These printers
don't report the filament usage themselves, so the bridge now reads it from
the print file on the printer – only the beginning of the file, not the whole
print. Multi-material prints get one entry per filament, as before.

Update your printer bridge once (fetch its new version and start it again).
Prints that are already in your inbox stay without grams; enter them there
by hand.
