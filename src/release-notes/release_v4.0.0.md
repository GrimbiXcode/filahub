---
date: 2026-09-25
title: Materials and their spools
---

## A material, and the spools that belong to it

Until now every spool was its own material. Two spools of the same PLA were
two entries that knew nothing about each other. From this version on, filahub
tells the two apart:

- The **material** is the product – for example “Polymaker PolyTerra PLA,
  Charcoal Black”. Name, material type, manufacturer, colour, finish and
  density belong to it.
- A **spool** (or bottle, bag, **container** in general) is the single piece in
  your store, with its identifier, its weigh-ins, its usage and its drybox.

When you edit the name, colour or finish of a material, the change applies to
all of its spools at once.

## “Running low” now counts the whole material

The warning used to look at each spool on its own. A spool at 8 % was flagged
as running low even when a full one of the same material sat right next to it.

Now filahub adds up all spools of a material – across all of your stores – and
warns only when that total is low. The ring of each spool still shows how full
that one spool is, so the nearly empty one is still easy to spot.

A material with a single spool warns exactly as before: below 25 % of its
nominal weight.

## Set your own warning threshold per store

Under “Stores” you can now enter a threshold in grams, for example “warn below
300 g”. It applies to every material that lies in that store. If a material has
spools in several stores, the highest threshold counts. Leave the field empty
to keep the default of 25 % of the largest spool.

## See the other spools of a material

Next to the shelf and on the page of a spool you now find **“Spools of this
material”**: every spool of the same material, in every store, with what is
left on each and the total. A tap takes you to that spool.

From there, **“Add another spool”** opens the form with the material already
filled in – you only enter the store, the weight, the price and the identifier.

## A page for each material

Each material has its own page, reached from “Go to material”. It shows the
material's details, all of its spools and the stock across all stores. You can
edit the material there as well.

In the material form you can now pick an existing material instead of typing
everything again. Choosing “Create a new material” works as before.

## Your existing spools

filahub has sorted your existing entries into materials. Spools were grouped
together only where manufacturer, material type, colour, finish and the store's
kind and filament diameter all match – and only if manufacturer and colour were
filled in. Everything else became a material of its own.

If two materials are really the same, the overview shows a hint, and the
material page offers **“Merge into this one”**: the spools of the other
material move over, and the other entry disappears.

## Group the shelf by material

Above the shelf you can now choose between grouping by drybox, as before, and
grouping by material – then all spools of a material stand next to each other.

## Other changes

- Weighing, logging usage and deleting now refer to a single spool or
  container, and the counters in the overview, the stores and the dryboxes
  count containers.
- A spool's page has a new address. Saved links to the old address still work.
- The data export now lists materials and their containers separately.
