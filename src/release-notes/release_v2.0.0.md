---
date: 2026-08-08
title: Your data, your call
---

This release is about what happens to your data — who sees it, how long it
stays, and how you get it back or get rid of it.

## Telegram's sign-in button waits for you now

The sign-in page used to load Telegram's button the moment you opened it. That
alone told Telegram your IP address and something about your device — whether or
not you went on to sign in.

Now nothing is loaded until you click **Load Telegram sign-in**. The notice next
to it says what that means: Telegram is based in the United Arab Emirates, and
there is no adequacy decision for that country under EU or Swiss law.

The six-digit code from the bot needs none of this. It works without any
Telegram code running in your browser, and it stays the default route.

Your decision is remembered in your browser and can be undone by clearing site
data.

## Download everything, or delete everything

Settings now has a **Data and account** section.

**Download my data** hands you a JSON file with everything stored under your
account: your profile, spools, weigh-ins, spool types, storage boxes, hidden
presets, submitted proposals, pending sign-in codes and your security log
entries. It is a complete, machine-readable copy of your account — not a
printout, and not the short list the import page takes.

**Delete account** removes your account and your entire stock for good. You type
your own name to confirm, because there is no undo.

One thing survives on purpose: proposals that were accepted into the shared
catalogue stay, without your name and without your reasoning. Other people's
spools point at those catalogue entries, and pulling them out would damage stock
that is not yours. The entry that remains says nothing about you.

## Imprint, privacy policy, terms

Three new pages, in English and German, reachable without signing in: the
imprint, the privacy policy and the terms of use. Links sit in the sidebar and
on the sign-in page.

The privacy policy is specific rather than generic — it names what is stored,
why, on what legal basis and for how long, including the cookies and the
browser storage the app uses. Worth a read if you have ever wondered what a
weigh-in actually records.

## No more profile pictures

Your Telegram profile picture is no longer stored or displayed. Showing it meant
asking Telegram for it on every single page you opened. Your initials do the
same job without telling anyone where you are.

## Sessions are shorter, and you can end them

Staying signed in used to last a year, and signing out only cleared the cookie
on that one device — the underlying session stayed valid.

Now a session lasts **30 days**, and **Sign out everywhere** in the settings ends
every session at once, on every device. That is the button for the day you leave
a laptop somewhere.

Signing out normally still only affects the device you are on.

## Fewer ways in for someone who should not be

- Sign-in codes are valid for five minutes instead of ten and are deleted
  automatically after a day. They also cannot be redeemed twice any more, even
  when two attempts arrive at the same moment.
- Repeated sign-in attempts from the same address are throttled.
- A security log records sign-ins, failed attempts, deletions and moderation
  decisions. Addresses are stored as an encrypted fingerprint, never in the
  clear, and entries are deleted after 90 days.

## A warning on the import page

The import page suggests handing an invoice to a language model to turn it into
a list. It now says out loud what that means: invoices usually carry your name,
address and payment details, and those go to whoever runs that model. filahub
sends nothing there itself.
