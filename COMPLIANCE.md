# Regulatory position

Where filahub stands with respect to EU and Swiss regulation, and why. Written
for whoever maintains or deploys it. Not legal advice — the reasoning is stated
so it can be checked, and so it can be revisited when the facts change.

Companion document: [PRIVACY.md](PRIVACY.md) covers the operator's data
protection duties.

## Three roles, kept apart

| Role          | What                                                  | Regime                                       |
| ------------- | ----------------------------------------------------- | -------------------------------------------- |
| **Publisher** | the repository, the container image, the product page | licence, CRA, product liability              |
| **Operator**  | one running instance                                  | GDPR / revFADP, ePrivacy, imprint            |
| **Supplier**  | enabling self-hosters to comply                       | no duty as such — but it is the decent thing |

Most confusion about "does regulation X apply to filahub" dissolves once the
role is named.

## Cyber Resilience Act (EU) 2024/2847

**Position: out of scope, as long as the project stays non-commercial.**

Art. 2 together with recitals 18–19 excludes free and open-source software that
is not supplied in the course of a commercial activity. The Commission's
guidance of 28 July 2026 states that **voluntary donations, public funding and
sponsorship alone do not constitute commercial activity**, and that paid
consulting, training or support do not automatically trigger the CRA either, as
long as the software itself remains freely available.

Two things this does _not_ mean:

- **Location is irrelevant.** The CRA attaches to products made available on the
  Union market, not to where the author sits. A maintainer outside the EU gets
  no exemption from that.
- **The status is not permanent.** It flips the moment any of these become true:
  - donations become a de facto condition for access or essential updates
  - there are paid tiers, paid hosting, or premium features
  - personal data is monetised for anything beyond security, compatibility and
    interoperability

If the status flips, the deadlines are already close: **Art. 14 reporting
obligations since 11 September 2026** (24 h early warning, 72 h notification,
14 days final report, to the national CSIRT and ENISA), full application
including CE marking on **11 December 2027**.

### Guardrail

Keep donations voluntary and decoupled from access and updates. If that ever
changes, this document is the place to record the decision — along with the fact
that CRA obligations then apply.

### Voluntary alignment

The CRA is not owed here, but several of its expectations are cheap and useful
regardless. They also matter for a different reason: a company deploying filahub
commercially becomes the manufacturer under the CRA and will need an SBOM from
upstream. In place today:

- **SBOM** in CycloneDX format, generated per release — attached to the
  container image as an attestation and kept as a workflow artifact
- **Build provenance** via BuildKit and, signed through Sigstore and recorded in
  a public transparency log, `actions/attest-build-provenance`. Verifiable with
  `gh attestation verify` — see [SECURITY.md](SECURITY.md)
- **Dependency updates** through Dependabot (npm, GitHub Actions, Docker base
  image)
- **Vulnerability gate** in CI: `npm audit` over production dependencies, and
  Trivy against the built image
- **Pinned supply chain**: every GitHub Action pinned to a commit SHA, base
  image pinned to a digest, lockfile committed
- **Least privilege at runtime**: the container runs as `node`, not root, and
  npm is removed from the finished image — it is only needed to install
  dependencies, but ships its own dependency tree that would otherwise show up
  in every scan of a product that never calls it

### Open advisories

Production dependencies are currently free of known advisories. The path
traversal in `@hono/node-server` `serve-static` below 2.0.5 (GHSA-frvp-7c67-39w9,
Windows only) was closed by moving to `@hono/node-server` 2.x — the public API
is unchanged, the major bump is a rewrite for throughput.

Two moderate advisories remain in **development** dependencies. Neither ships in
the image, and both sit behind an upstream package with no fixed release:

- `@hono/vite-dev-server` still depends on `@hono/node-server` 1.x, so the
  advisory above lives on in a nested copy. It is loaded by the Vite dev server
  only.
- `drizzle-kit` pulls the abandoned `@esbuild-kit/esm-loader`, and with it
  esbuild 0.18 (GHSA-67mh-4wv8-2f99). That advisory concerns esbuild's own
  `--serve` dev server, which drizzle-kit never starts.

The CI gate stays at `npm audit --omit=dev --audit-level=high`: production
dependencies are the ones that reach users.

## What else applies, and what does not

| Regime                                         | Applies?           | Why                                                                                                                        |
| ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **GDPR**                                       | to the operator    | Art. 3(2)(a) once an instance is aimed at people in the EU — being free does not exempt it                                 |
| **revFADP** (Switzerland)                      | to Swiss operators | Art. 19 information, Art. 25 access, Art. 28 portability, Art. 24 breach notification                                      |
| **ePrivacy** Art. 5(3)                         | to the operator    | the Telegram widget and stored preferences; hence the click-to-load gate                                                   |
| **NIS2**                                       | no                 | neither sector nor size                                                                                                    |
| **Product Liability Directive** (EU) 2024/2853 | no                 | Art. 2(2) excludes FOSS supplied outside commercial activity; transposition due 9 December 2026                            |
| **DSA**                                        | effectively no     | presupposes services normally provided for remuneration                                                                    |
| **European Accessibility Act**                 | no today           | microenterprise exemption for services. Switzerland's BehiG revision targets 1 January 2027 and covers commercial services |
| **AI Act**                                     | no                 | the app calls no model; the import page produces a prompt for the user to use elsewhere                                    |

The one to watch is GDPR Art. 27 (representative in the Union) for a non-EU
operator running an open instance. The exemption in Art. 27(2) requires
processing to be _occasional_, which sits awkwardly with persistent user
accounts. Closing registration is the cheap way out; appointing a representative
is the other.

## Record of processing activities

Template for Art. 30 GDPR / Art. 12 revFADP. Fill in the operator-specific rows.

- **Controller**: from `LEGAL_OPERATOR_*`
- **Purposes**: managing a personal filament stock; authentication; maintaining
  the shared preset catalogue; sharing stock between users who have connected as
  friends, and passing on loan requests between them; since 2.5.0, running a
  stock jointly in an organization (companies, university print hubs,
  makerspaces)
- **Categories of data subjects**: registered users of this instance
- **Categories of data**: see the table in [PRIVACY.md](PRIVACY.md)
- **Recipients**: Telegram FZ-LLC (authentication, loan and organization
  notifications); the hosting provider (processor); **other users of this
  instance** — either limited to what the data subject shared with an accepted
  friend and never including monetary amounts, or, within an organization, its
  fellow members, who see the shared stock itself and each other's display name
  and Telegram username (see "Who else gets data" in [PRIVACY.md](PRIVACY.md))
- **Legal basis for sharing between users**: Art. 6(1)(a) GDPR — the sharing
  level is a per-friend choice by the data subject, defaults to the narrowest
  useful setting, and is revocable at any time with immediate effect. The same
  basis covers organizations: nobody is added without their own act (accepting
  an invitation, or entering a join code), and leaving takes effect immediately
- **Organization stock is not personal data of its members**: rows owned by an
  organization carry no author column, deliberately. Consequence for Art. 15 and
  Art. 20: the export contains a member's memberships and invitations, not the
  organization's inventory — that is the organization's record, not theirs
- **Third-country transfers**: Telegram, United Arab Emirates — no adequacy
  decision; based on explicit consent (Art. 49(1)(a) GDPR / Art. 17(1)(a)
  revFADP), obtained through the click-to-load gate on the login page
- **Erasure periods**: sign-in codes 24 h; everything else until the account is
  deleted
- **Technical and organisational measures**: see below

Small operators may be exempt from keeping this (Art. 30(5) GDPR, Art. 12(5)
revFADP), but the exemptions are narrower than they look — Art. 30(5) requires
the processing to be _occasional_. Regular user accounts are not.

## Technical and organisational measures

For Art. 32 GDPR / Art. 8 revFADP. What the software provides:

- **Authentication** via Telegram, HMAC-SHA256 verified with a constant-time
  comparison and a 24-hour replay window (`api/telegram/widget.ts`)
- **Sessions** as HS256 JWTs with the algorithm pinned on verification, 30-day
  lifetime, revocable through `users.tokenVersion`
- **Cookies** `httpOnly`, `Secure` outside localhost, `SameSite=Lax`
- **Authorisation** enforced server-side on every procedure; roles are a
  Postgres enum, not free text. Client-side gating is cosmetic and documented
  as such
- **Tenant separation**: every user-scoped query takes the user id as a
  parameter, with explicit ownership checks on top
- **Input validation** with shared zod schemas, client and server using the same
  definitions
- **Rate limiting** on sign-in attempts, friend requests and friend search, keyed
  on the client address
- **Transport and browser hardening**: Content-Security-Policy,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; HSTS in production
- **Data minimisation**: sign-in codes purged after 24 h; no profile pictures;
  no email addresses
- **Security logging**: sign-ins, failed and blocked attempts, rate-limit hits,
  account exports and deletions, moderation decisions — client addresses stored
  as an HMAC keyed with `APP_SECRET`, never in the clear, purged after 90 days
- **SQL injection**: Drizzle ORM throughout; the few raw fragments use only
  module constants and the identifier escaper

What the operator must add: encrypted transport (HTTPS), backups and their
restoration, access control on the host, patching, and a data processing
agreement with the hosting provider.

Known gaps, deliberately recorded rather than glossed over:

- **No admin screen for the security log.** The `audit_log` table is written
  and purged automatically, but reading it means querying Postgres directly.
- **No coverage measurement**, and no test for the authorisation boundary as a
  whole — though account deletion, export, session handling, the rate limiter
  and role assignment are covered.
- **Rate limiting is per process.** A deployment with several replicas
  multiplies the effective limit by the replica count.
- **Commits are not consistently signed**, and release tags are lightweight
  rather than signed and annotated.

## Erasure concept

| Data                                                                        | On account deletion                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Own stock: materials, weigh-ins, container types, dryboxes, hidden presets  | deleted                                                                          |
| Store shares (`lager_shares`) — granted and received, **before** the stores | deleted                                                                          |
| Stores (`lager`) — deleted **after** the materials that point at them       | deleted                                                                          |
| Proposals — pending, rejected, withdrawn                                    | deleted                                                                          |
| Proposals — accepted                                                        | anonymised: `userId` and comment set to NULL                                     |
| Global catalogue entries                                                    | kept; they carry no personal data                                                |
| Moderation record where the deleted user reviewed                           | `reviewedBy` set to NULL                                                         |
| Sign-in codes                                                               | deleted                                                                          |
| Friendships — in both directions                                            | deleted                                                                          |
| Loan requests — asked and been asked                                        | deleted                                                                          |
| Organization memberships and invitations — in both directions               | deleted                                                                          |
| Organizations where the account was the **last** administrator              | successor promoted, or the organization and its stock deleted if nobody is left  |
| Stock owned by an organization the account belonged to                      | kept; it carries no author and is not the member's personal data                 |
| Friend code                                                                 | deleted with the account row                                                     |
| Security log entries                                                        | anonymised: actor, subject and Telegram ID set to NULL; event and timestamp kept |
| Account                                                                     | deleted                                                                          |

Sign-in codes are additionally purged after 24 hours, and security log entries
after 90 days, regardless of any deletion request
(`api/queries/retention.ts`).

Security log entries are anonymised rather than deleted for a specific reason:
if deleting an account emptied the log, anyone who gained unauthorised access
could erase their own traces by deleting the account they broke into. Art. 17(3)
lit. b and e cover keeping the sequence of events; what goes is the link to the
person.

The reasoning for keeping accepted proposals is in
`deleteUserAccount` and in the privacy policy shown to users. It rests on
Art. 17(3): other users' stock references those catalogue entries, and the
remaining row no longer identifies anyone.

Friendships, store shares and loan requests get the opposite treatment — deleted
outright, in both directions. Nothing in Art. 17(3) covers keeping them: there is
no moderation record, no other user's stock depends on them, and an anonymised
friendship would be meaningless. Deleting them does remove the counterparty's
side of a row that describes both people; that is inherent to joint data, and the
erasure right of the person leaving takes precedence over the other's
convenience.

Organizations get a third treatment, because neither of the first two fits. The
memberships and invitations go the way the friendships do — joint data, no
moderation purpose, deleted in both directions. The **stock** stays, and that is
a consequence of a design decision rather than an exception carved out for it:
rows owned by an organization have no author column, so they contain nothing to
erase. Recording who booked what in would have been a usage log, which this
project declines to keep for the same reason it does not log loan requests.

The last-administrator case is the one place where erasure forces a decision
instead of a rule. Everywhere else the app refuses a step that would leave an
organization without an administrator, since nobody could then repair it. An
Art. 17 request is not refusable, so `handleAdminAccountDeletion` decides: the
longest-standing remaining member is promoted (logged as
`organization.member_role_changed` with `reason: "last_admin_deleted"`, and told
over Telegram), or, if nobody remains, the organization and its entire stock are
deleted — data no one can ever reach again is worse than deleting it.

The order in the table is load-bearing, not tidiness. There are no foreign keys
anywhere in this schema, so a row deleted too late is a row pointing at an ID the
database will hand out again: a leftover `lager_shares` row would grant a stranger
access to whoever next receives that store ID. The same reasoning puts the stores
after the materials that reference them, puts the organization cascade **before**
the personal one, and all of it is enforced by the order of statements in
`deleteUserAccount` with the reasoning in the comments there.

## Decisions on record

Add entries here as they are made, with dates. This section is the point of the
document — a position that is not written down gets re-litigated.

| Date           | Decision                                                   | Rationale                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _to be filled_ | Registration open or restricted on the public instance     | affects Art. 27 and Art. 30                                                                                                                                                                        |
| _to be filled_ | GDPR Art. 27 representative appointed / reasoned exemption | see above                                                                                                                                                                                          |
| _to be filled_ | Donation model confirmed non-commercial                    | keeps the CRA exemption                                                                                                                                                                            |
| 2026-08-11     | Sharing between users is per-direction, never symmetric    | a symmetric level would let one user widen what another discloses; each person must control their own stock alone                                                                                  |
| 2026-08-11     | Access exports include the counterparty's display name     | the mirror image of stripping `ipHash`: the name is what makes the row meaningful to the data subject, who already sees it in the interface, and IDs alone would be a useless answer under Art. 15 |
| 2026-08-11     | "Search only" is documented as a courtesy, not a guarantee | server-side search with a mandatory query prevents browsing, but repeated queries can still map a stock; users who need a hard boundary must pick "nothing"                                        |
| 2026-08-11     | Loan requests are not written to the security log          | they are usage data; logging them would create the movement profile `contracts/audit.ts` explicitly excludes                                                                                       |
