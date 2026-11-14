---
date: 2026-11-14
title: Grams from plain G-code files
---

## Fixed

The printer bridge now also finds the grams in plain G-code files
(`.gcode`). PrusaSlicer writes the filament usage only at the very end of
these files, so the bridge reads the file once more after the print has
finished, when the printer is free again. The print shows up in your inbox a
little later than before – with large files up to a few minutes.

Binary G-code (`.bgcode`) works as before and is faster: there the bridge
reads the grams while the print is still running.

Prints sent shortly after replacing a file with the same name on the printer
no longer lose their grams.

Update your printer bridge once (fetch its new version and start it again).
