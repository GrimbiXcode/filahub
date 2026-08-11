---
date: 2026-08-11
title: Containers, not spools
---

The last release let you keep powder and resin. This one fixes the words
underneath: what holds your material is a **container**, and a container is not
always a spool.

## Container types

"Spool types" are now **container types**, and each one has a form:

- **Spool** — the reels you already have
- **Bag** — refill coils without a spool, powder in a sealed bag
- **Bottle** — resin, and Sinterit ships 2 kg of powder this way
- **Pail** — the 10 kg bucket
- **Cartridge** — closed resin systems
- **Other** — because not every container in the world fits five boxes

Everything you already had is a spool. Nothing moved, nothing needs editing.
The page lives at **/gebinde** now; the old bookmark still works.

The form is a hint, not a rule. In a resin store, bottles and cartridges sort to
the top of the container list — but every container stays selectable, including
your cardboard spools. If you have a reason to put filament in a bucket, filahub
is not going to argue.

## The catalogue takes more than spools

The preset catalogue used to describe a spool and only a spool. Its limits said
so: at most 20 kg of content, at most 5 kg empty, and the empty weight had to be
lower than the content. A 25 kg pail of sintering powder in a steel container
failed all three.

Now:

- Content up to **50 kg**, empty weight up to **20 kg**.
- The rule "empty weight below content weight" is **gone**. It was only ever true
  for spools — 500 g of test powder in a 2 kg container breaks it, and there is
  nothing wrong with that entry. Your own container types never had this rule in
  the first place, so the catalogue was stricter than the form next to it.
- Outer diameter, width and bore only appear for spools. A bottle has no bore.
- Container material gained **glass** and **foil**.

**No resin or powder presets ship with this release.** The catalogue's own rule is
that a wrong starting value is worse than a missing entry, and the empty weights
for resin bottles and powder containers are not something we could source
properly. The structure is ready; entries come through the catalogue admin and
community suggestions, the same way the spool data grew.

## Fixed: a filament spool claiming to fit resin

Grouping in the container list rested on two lenient rules — an untagged series
matches any material type, and an unknown form matches any material kind. Each is
right on its own. Together they meant an untagged filament spool from the starter
catalogue appeared under "Fits resin", which it plainly does not.

Matching now needs a positive reason: a contradicting property rules a container
out, and at least one property has to actually agree. Two unknowns mean "don't
know" and sort down with the rest. Nothing became unselectable — it just stopped
claiming to fit.

## Smaller things

- The command palette knows your stores. It also lost a stale link to the old
  drybox address.
- The System page in administration counts the `lager` table, which it quietly
  skipped since the last release.
- Five English strings still said "storage box" where the app says "drybox".
- The container list shows each entry's form and tare together: "60 g tare · Bottle".
- The hint next to the data export listed the wrong sections and claimed the
  importer reads that file back. It does not — the importer takes a short list of
  positions. Both are corrected.

## For operators

Two migrations. `0010` renames tables, columns and one enum type — a rename only,
no data touched. `0011` adds the form columns and two container materials.

The data export changed shape: the sections `spoolTypes` and `hiddenSpoolPresets`
are now `containerTypes` and `hiddenContainerPresets`, and `formatVersion` moved
from 1 to 2. A file a user downloaded earlier still carries the old names — that
is what the version field is for. Nothing in the application reads exports back,
so nothing breaks.

The privacy policy's table of stored data uses the new names.
