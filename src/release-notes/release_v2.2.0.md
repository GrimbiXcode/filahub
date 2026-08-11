---
date: 2026-08-11
title: More than filament
---

filahub was built for filament on spools. If you also sinter powder or print
with resin, there was nowhere to put it. This release introduces **stores** — and
with them, room for more than one kind of material.

## Stores

A store groups what belongs together, and carries the settings that apply to
everything inside it: which material kind it holds, and for filament, which
diameter.

Pick one of three kinds:

- **Filament** — spools and reels. Remaining amount also shown in metres.
- **Powder** — sintering powder in bags or buckets. Grams only.
- **Resin** — liquid resin. Remaining amount also shown in litres.

You can have up to five. Switch between them in the sidebar; the overview, the
statistics and the filters all follow your choice.

Your existing filament did not go anywhere: it is already in a store called
**"Mein Lager"**, set to filament at 1.75 mm. If you print 2.85 mm, change the
diameter once and you are done.

## Metres and litres, next to grams

Grams are still what you weigh and what you type in — nothing about that changed.
But grams are a poor way to think about filament. So next to the remaining amount
you now see roughly how much is left in the unit that matters:

- **Filament** in metres. 1 kg of PLA is about 335 m at 1.75 mm — and only about
  126 m at 2.85 mm. The diameter more than doubles the answer, which is why it
  belongs to the store.
- **Resin** in litres.
- **Powder** in nothing extra. Bulk density depends on grain size and packing, so
  any figure would be a guess, and a wrong number is worse than none.

The conversion needs a density. filahub knows sensible values for the common
materials — PLA, PETG, ABS, ASA, TPU, nylon and others — and picks one by material
type, so "PLA Silk" gets PLA's density. If you have something unusual, enter its
density on the material and that wins. Hover the converted figure to see which
density was used.

Everything is prefixed with "approx." on purpose. The number rests on a density
that is usually an estimate, and filahub would rather say so than pretend.

## Surface finish is its own field now

Matte, silk, glossy, transparent, metallic — these used to end up inside the
material type, as "PLA Silk". That had a cost you may have noticed: the material
type filter matches exactly, so "PLA" and "PLA Silk" showed up as two separate
entries that never found each other.

**Finish** is now its own field, with suggestions and room for whatever your
manufacturer invented. It is searchable and filterable, and your material types
go back to being material types.

## What friends see

Friends' materials now show the finish and the converted amount too, so "will
this reach?" is answerable in metres rather than grams — using the diameter from
the owner's store, so the figure is right even though you never see the store.

Nothing new leaks. Which store a material sits in stays private — a store name is
free text and can name a place, the same reason a drybox is never shown — and so
does the density behind the conversion. Prices, notes, purchase dates, dryboxes
and weigh-in history remain invisible at every sharing level.

Finish is searchable across friends' stock as well, which it has to be now that
it is no longer buried inside the material type.

## Storage boxes are called dryboxes

With stores arriving, "Lagerbox" and "Lager" were one letter apart. The boxes are
dryboxes — that is what they are for — so that is what they are called now.
Nothing about them changed, and the old bookmark still works.
