---
date: 2026-08-11
title: Share filament with friends
---

You have 200 g of PETG left, you need 600, and someone you know has a full spool
sitting in a drybox. filahub now knows about that. Connect with people you trust,
see what they have, and ask.

The whole feature is built around one idea: **you decide what you show, for each
friend separately, and nobody can change that but you.** Prices are never part of
it.

## Connecting

Under **Friends** you get a friend code — something like `FH-A2B3-C4D5`. Pass it
to someone, and they can send you a request. Nobody can find you without it, so
your account cannot be discovered by guessing names.

If your friend has a Telegram name set, you can use that instead. The code is the
more reliable route: not everyone has one.

You will get a message from the bot when somebody asks, and again when they
accept.

## Choosing what you share

Every friendship has **two** settings, one per direction. What you show, and what
your friend shows you. Yours is a dropdown you can change any time; theirs is
their decision, and you only see what they picked.

Three levels:

- **Nothing** — your stock stays completely hidden.
- **Search only** — your filament turns up when your friend searches for
  something specific. They cannot browse your stock.
- **Whole stock** — your friend can open your stock and look through it.

New friendships start at **search only**. Being findable is the point of adding
someone; showing them everything is a separate decision.

One thing worth knowing about **search only**: it stops browsing, not curiosity.
Someone who tries a lot of different searches can piece together what you have.
If that bothers you, pick **nothing** — that is a real boundary.

## What a friend can see

Name, short identifier, material type, manufacturer, colour, nominal weight, and
how much is left.

That is the complete list. Never included, at any sharing level:

- prices
- your notes
- purchase dates
- which storage box it is in, and where that box is
- your weigh-in history

The remaining amount is still correct even though the box is hidden — the box's
empty weight is subtracted, you just do not see the box.

## Asking to borrow

Found something you need? **Ask**, optionally with a short message. Your friend
gets a Telegram message and answers in filahub — you both see whether it is open,
accepted or declined, and you can withdraw a request you no longer need.

If your friend has never opened a chat with the bot, Telegram will not let it
message them. filahub tells you when that happens; the request still waits for
them in the app.

## Searching

Type into the search box on the overview and matches from your friends appear in
their own section below your own filament. The quick search (Ctrl/⌘ + K) does the
same from anywhere.

Your friends' stock is searched from two characters onwards.

## Leaving

Ending a friendship removes both directions and any pending requests. Deleting
your account removes every friendship and request you were part of, in both
directions — including the copies on your friends' side, since those rows describe
both of you.

Your friend code disappears with your account. Generating a new one immediately
invalidates the old, in case you shared it too widely.

## For operators

One new optional setting: `APP_BASE_URL`, the public address of your instance.
It is used for the links in Telegram notifications. Without it the messages still
work — they just name the page instead of linking to it.

The privacy policy and the compliance notes have both been updated. filahub is no
longer purely single-tenant, and "who else gets data" now has an answer beyond
Telegram and your hosting provider. Read that section before you upgrade a public
instance.
