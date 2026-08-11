# Data protection for operators

If you run filahub for anyone other than yourself, **you** are the data
controller — not the author of the software. This file describes what the
application processes, so you can fulfil your own obligations. It is not legal
advice.

Users of your instance get their own privacy policy inside the app at
`/datenschutz`; it is filled from your configuration. This file is for you.

## What you must configure

Four variables identify you. Without them the imprint and privacy policy show a
visible warning instead of an operator, and both pages are incomplete:

| Variable                 | Why                                                       |
| ------------------------ | --------------------------------------------------------- |
| `LEGAL_OPERATOR_NAME`    | Art. 13(1)(a) GDPR / Art. 19 revFADP — who is responsible |
| `LEGAL_OPERATOR_ADDRESS` | same; `\n` separates lines                                |
| `LEGAL_OPERATOR_EMAIL`   | where data subjects reach you                             |
| `LEGAL_OPERATOR_HOSTING` | Art. 13(1)(e) — who processes on your behalf              |

The texts themselves live in `src/legal/*.md` and describe the software, which
is identical on every instance. Only the operator details differ, which is why
they come from the environment rather than the files. **Do not hardcode your
details into the Markdown** — the next person to pull the image would ship them.

## What the application stores

| Data                                                                                                                                    | Where              | How long                               |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------- |
| Telegram ID, display name, Telegram username                                                                                            | `users`            | until the account is deleted           |
| Last sign-in timestamp                                                                                                                  | `users`            | until the account is deleted           |
| Display settings (language, currency, format)                                                                                           | `users`            | until the account is deleted           |
| Stores (name, material kind, filament diameter, free-text notes)                                                                        | `lager`            | until the account is deleted           |
| Materials, weigh-ins, container types, dryboxes — including prices, purchase dates, locations, surface finish and free-text notes       | own tables         | until the account is deleted           |
| Friendships: who is connected to whom and who asked                                                                                     | `friendships`      | until either account is deleted        |
| Store sharing: which of a user's stores a given friend may see, and how much                                                            | `lager_shares`     | until either account is deleted        |
| Loan requests: who asked whom for which material, its name at the time, and a free-text message                                         | `loan_requests`    | until either account is deleted        |
| Friend code — a shareable identifier, created only when a user opens the friends page                                                   | `users`            | until the account is deleted           |
| Preset proposals with reasoning and moderation record                                                                                   | `preset_proposals` | see "Deletion" below                   |
| Sign-in codes with Telegram ID and name                                                                                                 | `login_codes`      | **purged automatically after 24 h**    |
| Security log: sign-ins, failed attempts, deletions, moderation decisions — with an HMAC of the client address, never the address itself | `audit_log`        | **purged automatically after 90 days** |

No profile pictures. No email addresses — the column existed until 1.1.1 and was
dropped, because nothing ever wrote to it except the legacy MySQL import.

Free-text fields are whatever your users type. Assume they will eventually
contain something personal that has nothing to do with filament.

## Who else gets data

**Telegram** (Telegram FZ-LLC, United Arab Emirates) is unavoidable — it is the
only way to sign in. Three channels:

1. The login widget script, loaded from `telegram.org`. It transmits the
   visitor's IP address. The app loads it **only after an explicit click**;
   that click is the consent the transfer relies on (Art. 49(1)(a) GDPR,
   Art. 17(1)(a) revFADP). Do not remove that gate.
2. The bot API, for sending sign-in codes. Server-side, outbound.
3. Nothing else. Profile pictures are no longer fetched.

There is no adequacy decision for the UAE, under either EU or Swiss law. If that
is not acceptable for your users, filahub is not the right tool for them — there
is currently no login method that avoids Telegram.

**Your hosting provider** processes everything else on your behalf. You need a
data processing agreement with them (Art. 28(3) GDPR). Most providers offer one
in their account settings; concluding it is your job, not the software's.

**Other users**, but only the ones a user has accepted as a friend, and only as
much as that user chose. Since 2.1.0 filahub is not purely single-tenant any
more, and this section is where that shows.

Since 2.4.0 sharing is decided **per store**, not per friendship: for each of
their own stores, a user picks one of three levels for each friend — nothing,
search only, or the whole store. Accepting a friendship shares **nothing**; there
is no default, because a default would open a specific store the user may not
want to show. There is no symmetric setting either, so nobody can widen what
someone else shares.

That is a narrowing, not a widening: someone who shared their filament but not
their expensive resin previously had to choose between everything and nothing.
Existing access was carried over when the schema changed — every store of a user
who had granted a level received that same level, and users can now take back
each store individually.

What a friend can see, at most: name, short identifier, material type, surface
finish, manufacturer, colour, nominal weight, remaining amount and percentage,
and the remaining amount converted to metres or litres. What they can never see,
at any level: prices, free-text notes, purchase dates, storage box and its
location, the weigh-in history, and which store a material sits in — a store
name is free text and can name a place, the same reason the storage box is
excluded. **The store becoming the unit of sharing changed nothing about that
list**: a friend's view stays a flat list, never grouped by store, so the
recipient does not even learn how many stores their matches came from. The list
is enforced in one place (`toFriendMaterial` in `api/queries/friends.ts`) and
pinned by a test that asserts the exact set of fields; nothing else in the code
assembles a material for another user. Since 2.4.1 the data export honours the
same boundary: the sharing a user _received_ is listed as one level per person,
not one row per store — the raw rows would have said how many stores a friend
keeps and which of them they open individually.

The two accounts also see each other's display name and Telegram username, and
since 2.4.1 only **after** the friendship is accepted. A pending or declined
request discloses neither: a friend code is meant to be passed around, and
holding one should not turn into a handle for writing to that person directly.

Be honest with your users about one limit: **"search only" is a courtesy
boundary, not a security boundary.** It stops browsing — matches are returned
only for a query of at least two characters, never as a list — but somebody who
tries many queries can map a stock piece by piece. Since 2.4.1 the search is
rate-limited (120 queries a minute per client address, far above normal use),
which slows that down and records whoever trips the limit — it does not make it
impossible. If that matters to them, the answer is "nothing", not "search only".

Requesting a loan sends a message through the Telegram bot API to the owner,
containing the requester's display name, the material's name and the optional
message. Same channel as the sign-in codes, same third country.

Granting, changing and withdrawing access is recorded in the security log
(`friend.*` events, purged after 90 days), including **which store** it applied
to — without that, the entry would not answer who gained access to what. Deleting
a shared store writes one such entry per affected friend. Loan requests are
deliberately **not** logged there — they are usage, not security, and logging them
would build the movement profile the log is designed to avoid.

**Nobody else.** No analytics, no tracking, no CDN, no external fonts, no error
reporting service. Verifiable: the only third-party host in the codebase is
`telegram.org`.

## Data subject rights

Both of the awkward ones are built in and need no work from you:

- **Access and portability** — users export everything under Settings → "Data
  and account". The format is JSON, machine-readable as Art. 20 requires, and
  carries a `formatVersion` (4 since 2.4.1, when the sharing a user _received_
  was compressed to one level per owner; 3 since 2.4.0, when the sharing levels
  moved out of the friendship rows into their own `lagerShares` section; 2 since
  2.3.0, when two section names changed). Note it is **not** the format the
  import page reads
  — that one takes a short list of positions, not a full account dump.
- **Erasure** — same place. Deletes the account and the entire stock.

Correction is just editing. For restriction and objection you will have to act
manually; there is no tooling for those.

### What deletion keeps

Proposals accepted into the shared catalogue survive, with `userId` and the
free-text comment set to NULL. The catalogue is shared, and other users'
materials reference those entries — removing them would damage stock that is not
the deleting user's. The remaining row allows no conclusion about the person.

Friendships, store shares and loan requests do **not** survive. They are deleted
in both directions — where the leaving user asked and where they were asked, and
both the shares they granted and the ones they received — because there is no
moderation purpose that would justify keeping them. This does remove the other
person's side of a shared row; that is unavoidable, since the row is joint data
about both of them, and the erasure right of the person leaving wins here.

The shares are deleted **before** the stores, and that order is not cosmetic:
there are no foreign keys, so a leftover share row would keep pointing at a store
ID that the database later hands out again — someone would see a stock nobody ever
shared with them.

If you find that unacceptable for your instance, the logic is in
`deleteUserAccount` (`api/queries/account.ts`) and the reasoning is in the
comments there. Change it knowingly, and change the privacy policy with it.

## Breaches

Article 33 GDPR gives you 72 hours to notify your supervisory authority once you
become aware of a personal data breach. Swiss law (Art. 24 revFADP) says "as
soon as possible" without a fixed deadline. Either way you need to know who your
authority is **before** it happens — look it up now, not during.

The `audit_log` table is what you reconstruct from. It records sign-ins and
sign-outs, failed and blocked attempts, rate-limit hits, invalid widget
signatures, account exports and deletions, and moderation decisions.

There is no admin screen for it; query it directly:

```sql
SELECT at, event, "actorUserId", detail
FROM audit_log
WHERE at > now() - interval '7 days'
ORDER BY at DESC;
```

Client addresses are stored as an HMAC keyed with `APP_SECRET`, never in the
clear. You can still recognise the same address across entries — compute the
HMAC of an address you suspect and compare. Rotating `APP_SECRET` breaks that
correlation for older rows, which is one more reason not to rotate it casually.

## Open registration

`TELEGRAM_OPEN_REGISTRATION=1` means anyone with a Telegram account can create
one here. That is a different situation from running an instance for yourself
and three friends:

- You become the controller for an open-ended number of strangers.
- A record of processing activities (Art. 30 GDPR) is no longer arguably
  optional — the processing is regular, not occasional.
- If you are outside the EU and your instance is aimed at people inside it,
  Art. 27 GDPR may require you to appoint a representative in the Union. The
  exemption in Art. 27(2) is narrow and does not obviously cover persistent user
  accounts.

None of this is a reason not to do it. It is a reason to decide it on purpose.
See [COMPLIANCE.md](COMPLIANCE.md).
