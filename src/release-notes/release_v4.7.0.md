---
date: 2026-11-09
title: Prusa printers, PrusaSlicer and spool tags
---

Logging a print no longer means copying numbers out of the slicer. Your Prusa
printers and PrusaSlicer can now report prints by themselves, and spools with
an NFC tag fill in the material form.

## Prints arrive by themselves: the inbox

A new **Inbox** (next to Prints) collects prints that were reported to
filahub. Each entry shows the grams per filament, print time and printer.
**Take over** opens the print form already filled in – the material is
suggested like for a G-code file – and saving books the consumption as usual.
**Dismiss** what you didn't print. Nothing is booked until you take an entry
over.

## Printer bridge for Prusa printers

Under **Connections**, create a printer bridge. filahub shows you a single
`docker run` command with everything filled in – run it on any computer in
your network that has Docker, such as a Raspberry Pi or a NAS. That's all you
do on that computer.

Then add your printers right in the app: name, address and the PrusaLink API
key (or username and password). The bridge picks them up within seconds, and
filahub shows for each printer whether the bridge can reach it – with a plain
explanation if not: name not found, connection refused, wrong key, not
PrusaLink, and what to check. **Test connection** checks again on the spot,
and the bridge log shows what it has been doing.

When a print finishes, the bridge sends it to your inbox with the grams from
the file. A stopped print is sent too, with the grams estimated from how far
it got. If filahub can't be reached for a while, the bridge keeps the prints
and delivers them later.

It works with printers that offer PrusaLink (MK4, MK3.9, Core One, XL,
MINI). An MK3S with a Raspberry Pi isn't supported yet.

## PrusaSlicer reports every export

Under **Connections**, you can also connect PrusaSlicer: download a small
script, create one settings file, and add one line to PrusaSlicer's
post-processing scripts – the app shows all three ready to copy. After every
export, grams and print time land in your inbox. The key deliberately lives in
its own file, not in PrusaSlicer, because PrusaSlicer writes its settings into
every G-code you share.

A connection key can only put prints into your inbox. It can't read or change
anything, and you can revoke it at any time. In an organization, an
administrator can see and revoke the keys that point to it.

## Tap a spool (NFC)

On Android with Chrome, **Tap spool (NFC)** in the material form reads the
OpenPrintTag on a spool, like the ones on Prusament spools: manufacturer,
material, type, colour, net weight and density are filled in. If you already
have that material, the new spool is added to it. On the material page,
**From NFC tag** takes the nozzle, bed and drying temperatures from the tag
into the print settings. On other devices these buttons don't appear.

## Import from G-code

When you record a new print, choose **Import from G-code** and pick the file
PrusaSlicer exported – plain or binary G-code (`.gcode`, `.bgcode`). The form
fills in what the file knows:

- **Grams per filament**, one line each. Multi-material prints get one line per
  filament that was actually used.
- **Print time** as the slicer estimated it.
- **Printer**, matched against the names you already use.
- **Title** from the file name, without the slicer's suffix like
  `_0.4n_0.2mm_PLA_MK4S_1h3m`.

Fields you already typed stay as they are.

## The material is a suggestion

filahub looks for a material of the same type whose manufacturer and name fit
the filament profile, for example "Prusament PLA". It only fills one in when
the match is clear. If the material has exactly one spool in use, that spool is
chosen too, so saving books the consumption as usual.

For multi-material prints with several spools of the same material, the colour
decides: set the extruder colours in PrusaSlicer to match your spools, and each
line finds the spool with the closest colour. A colour that fits none of them
leaves the line open.

Lines without a clear match stay open for you to pick, and each line shows what
the G-code said (colour, type, profile), with a warning if the type differs
from the material you chose.

## Filament profiles to and from PrusaSlicer

The print settings card on a material page has two new buttons:

- **From PrusaSlicer** reads a filament profile – a single profile file, an
  exported config or a config bundle. Nozzle and bed temperatures, chamber,
  fan, flow and retraction are filled into the form for you to check before
  saving. If the file holds several profiles, pick the one you want; the best
  match by name is preselected. Values filahub doesn't know from the profile,
  like drying, stay as they were. The profile's density can be taken over for
  the material too.
- **For PrusaSlicer** downloads your settings as a config bundle. In
  PrusaSlicer, use **File → Import → Import Config Bundle**, and the material
  appears as a filament profile. The first layer gets the upper end of your
  nozzle and bed range, all other layers the middle.

Max volumetric speed has no counterpart in filahub and is not converted.

## Your files stay on your device

G-code, profiles and NFC tags are read in your browser and never uploaded.
Only the values you save end up in filahub. Your PrusaLink keys and passwords
are stored encrypted, are never shown again in the app and go only to your own
bridge.
