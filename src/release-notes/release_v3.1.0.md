---
date: 2026-09-22
title: Automatic identifiers and smoother forms
---

## Identifiers that count themselves

A store can now have an **identifier template**, for example `ID: {n}` or
`F{nn}`. Set it when you create or edit a store under “Stores”.

When you add a material to that store, the form fills in the next free
identifier for you – `ID: 1`, `ID: 2` and so on, or `F01`, `F02` with `{nn}`.
It picks the lowest number that is not taken yet, so the number of a deleted
material becomes free again. You can still type something else or leave the
field empty.

With a template in place you can also look a material up by its number alone:
typing `4` into the identifier field at the top finds `ID: 4`.

## Suggestion lists scroll again

In the material form, the suggestion lists under fields like finish or
manufacturer could not be scrolled – with the mouse wheel or with a finger,
anything past the first few entries was out of reach. They scroll now.

## Enter no longer saves a half-filled form

Typing the start of a value and pressing Enter used to create the material
right away, before you had filled in the rest. Now:

- **Enter** in a suggestion field takes the highlighted suggestion – the best
  match is highlighted as you type, so "ma" and Enter gives "Matt". To keep
  what you typed instead, press Esc first.
- **Enter** in any other field moves on to the next one. After the last field
  it lands on the save button.
- **⌘ + Enter** (Mac) or **Ctrl + Enter** saves and closes the form from any
  field. The form shows the shortcut next to its buttons.

The same keys work in the other forms with several fields: stores, dryboxes,
containers, your own colours and finishes, and proposals.
