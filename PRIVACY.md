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

| Data                                                                                                            | Where              | How long                            |
| --------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------- |
| Telegram ID, display name, Telegram username                                                                    | `users`            | until the account is deleted        |
| Last sign-in timestamp                                                                                          | `users`            | until the account is deleted        |
| Display settings (language, currency, format)                                                                   | `users`            | until the account is deleted        |
| Spools, weigh-ins, spool types, storage boxes — including prices, purchase dates, locations and free-text notes | own tables         | until the account is deleted        |
| Preset proposals with reasoning and moderation record                                                           | `preset_proposals` | see "Deletion" below                |
| Sign-in codes with Telegram ID and name                                                                         | `login_codes`      | **purged automatically after 24 h** |

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

**Nobody else.** No analytics, no tracking, no CDN, no external fonts, no error
reporting service. Verifiable: the only third-party host in the codebase is
`telegram.org`.

## Data subject rights

Both of the awkward ones are built in and need no work from you:

- **Access and portability** — users export everything under Settings → "Data
  and account". The format is JSON and can be read back in on the import page.
- **Erasure** — same place. Deletes the account and the entire stock.

Correction is just editing. For restriction and objection you will have to act
manually; there is no tooling for those.

### What deletion keeps

Proposals accepted into the shared catalogue survive, with `userId` and the
free-text comment set to NULL. The catalogue is shared, and other users'
materials reference those entries — removing them would damage stock that is not
the deleting user's. The remaining row allows no conclusion about the person.

If you find that unacceptable for your instance, the logic is in
`deleteUserAccount` (`api/queries/account.ts`) and the reasoning is in the
comments there. Change it knowingly, and change the privacy policy with it.

## Breaches

Article 33 GDPR gives you 72 hours to notify your supervisory authority once you
become aware of a personal data breach. Swiss law (Art. 24 revFADP) says "as
soon as possible" without a fixed deadline. Either way you need to know who your
authority is **before** it happens — look it up now, not during.

The app writes no audit log yet. If you need to reconstruct who did what, you
have Postgres timestamps and whatever your reverse proxy logs. Plan accordingly.

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
