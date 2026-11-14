---
date: 2026-11-14
title: More reliable grams from the printer bridge
---

## Fixed

The printer bridge now picks up the grams of a print more reliably. When a
print starts, the printer is often still busy – loading filament from another
slot of the multi-material unit, for example – and didn't hand over the print
file. The bridge used to try only once and then gave up. It now tries again a
few times while the print runs, and one last time when it finishes.

If the grams still can't be read, the bridge log now says why.

Update your printer bridge once (fetch its new version and start it again).
