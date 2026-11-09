---
date: 2026-11-09
title: Filter by remaining amount
---

The overview can now show only the spools and containers whose remaining
amount falls within a range you choose. Open **Filters** and find
**Remaining**.

- **Two handles set the range.** Drag either end, or grab the bar between them
  to move the whole range at once. For exact values, type them into the
  _from_ and _to_ fields.
- **Choose a unit:** grams, metres for filament, litres for resin, or percent
  of the nominal amount. The app remembers the unit you pick. Your
  inventory's own second unit is the default, because "40 m left" tells you
  right away whether the next print will fit.
- **Shortcuts** for the usual questions: _Almost empty_ (up to 10 %),
  _Opened_ and _Full_ (90 % and more).
- **The bars behind the slider** show how many containers sit at each amount,
  so you can see where the nearly empty spools gather.
- **Logarithmic scale** for inventories where 250 g samples sit next to 5 kg
  buckets. On a linear scale the small amounts would be squeezed into a few
  pixels.

An active range shows up as a removable chip above the list, like the other
filters. Containers without a length or volume (no density set) are left out
while a range in metres or litres is active, and the filter tells you how
many that is. Switching to another inventory clears the range.
