---
date: 2026-11-09
title: PrusaSlicer files: G-code and filament profiles
---

Logging a print no longer means copying numbers out of the slicer.

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

G-code and profiles are read in your browser and never uploaded. Only the
values you save end up in filahub.
