---
date: 2026-08-11
title: Share one store, not everything
---

Sharing used to be a property of the friendship: one level per friend, valid for
everything you own. If you were happy to lend filament but not your expensive
resin, there was no way to say so — the choice was everything or nothing.

Now the level belongs to the **store**. One setting per store, per friend.

## What changed on the friends page

Each friend's card lists your stores, each with its own setting: nothing, search
only, or the whole store. Five stores mean five rows, and a store you have not
shared says so rather than being left out.

Accepting a friendship now shares **nothing**. There is no default any more, and
that is deliberate: a default would have to pick a specific store, possibly the
one you least wanted to show. A friendship with nothing shared would be
confusing, so the card says outright that you are not sharing yet, and points at
your stores.

The other direction stays one line — "You see: whole store" — and stays your
friend's decision alone. Deliberately one level and not a list: how many stores
they keep and which ones they share is information about their stock that they
did not give you.

## Your stores show where they go

The store list marks each store that leaves your account: "shared with 2
friends". Just the number, no names — who sees what is on the friends page. This
is the counterpart to sharing nothing by default: a store that goes out must
never be invisible about it.

## What friends see is unchanged

The store is now the unit of sharing, and a friend still never learns a store's
name — or that stores exist at all. Their view stays a flat list, never grouped,
so they cannot tell whether their two matches came from one store or two. A store
name is free text and can name a place, which is the same reason the drybox is
excluded.

The set of visible fields is byte-for-byte the one from 2.2.0: name, identifier,
material type, surface finish, manufacturer, colour, nominal weight, remaining
amount and percentage, and the remaining amount in metres or litres. Prices,
notes, purchase dates, dryboxes, weigh-in history and store are as absent as
before.

## Taking access back actually takes it back

Two things that would have been easy to get wrong, and both would have failed
quietly:

- **Ending a friendship removes the shares.** Had they stayed, becoming friends
  again later would have revived the old access without anyone sharing anything —
  and nothing on screen would have hinted at it.
- **Deleting a store removes its shares.** There are no foreign keys in this
  schema, so a leftover share row would eventually point at a store ID handed out
  to someone else.

Both are covered by tests that were checked the only way worth checking: by
removing the safeguard and confirming they turn red.

## For operators

One migration, `0012`. It creates `lager_shares`, **carries every existing level
over**, and only then drops the two columns on `friendships`. A user who had
granted "search only" now has "search only" on each of their stores — nobody
gains or loses access in the migration, and the per-store setting is theirs to
narrow afterwards. The drop is not reversible, so the carry-over runs first and in
the same transaction.

The security log records which store a change applied to. Deleting a shared store
writes one entry per affected friend, with `reason: "lager_deleted"` — a single
"store deleted" entry would not say whose access ended.

The data export gained a `lagerShares` section covering both directions, the ones
you granted and the ones you received. `formatVersion` moved from 2 to 3, because
the sharing levels left the `friendships` rows.

Also: the System page in administration now counts `friendships`, `loan_requests`
and `lager_shares`. The first two had been missing since 2.1.0 — the page showed
numbers, just not all of them. A test now compares the list against the database
instead of a second list kept by hand.
