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
- **Least privilege at runtime**: the container runs as `node`, not root

### The one open advisory

`@hono/node-server` below 2.0.5 has a path traversal in `serve-static`
**on Windows**, through an encoded backslash. filahub ships as a Linux
container, so it is not reachable here, and the fix is a major version bump of
the HTTP server — a real regression risk for no gain in this deployment.

The CI gate is therefore set to `--audit-level=high`, which lets this moderate
advisory stand. Revisit when `@hono/node-server` 2.x is otherwise worth
adopting.

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
  the shared preset catalogue
- **Categories of data subjects**: registered users of this instance
- **Categories of data**: see the table in [PRIVACY.md](PRIVACY.md)
- **Recipients**: Telegram FZ-LLC (authentication); the hosting provider
  (processor)
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
- **Rate limiting** on sign-in attempts, keyed on the client address
- **Transport and browser hardening**: Content-Security-Policy,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; HSTS in production
- **Data minimisation**: sign-in codes purged after 24 h; no profile pictures;
  no email addresses
- **SQL injection**: Drizzle ORM throughout; the few raw fragments use only
  module constants and the identifier escaper

What the operator must add: encrypted transport (HTTPS), backups and their
restoration, access control on the host, patching, and a data processing
agreement with the hosting provider.

Known gaps, deliberately recorded rather than glossed over:

- **No audit log.** Sign-ins, failed attempts, admin actions and role changes
  leave no trace beyond database timestamps. This is the largest remaining gap:
  an incident could not be reconstructed from the application's own records.
- **No coverage measurement**, and no test for the authorisation boundary as a
  whole — though account deletion, export, session handling, the rate limiter
  and role assignment are covered.
- **Rate limiting is per process.** A deployment with several replicas
  multiplies the effective limit by the replica count.
- **Commits are not consistently signed**, and release tags are lightweight
  rather than signed and annotated.

## Erasure concept

| Data                                                                        | On account deletion                          |
| --------------------------------------------------------------------------- | -------------------------------------------- |
| Own stock: materials, weigh-ins, spool types, storage boxes, hidden presets | deleted                                      |
| Proposals — pending, rejected, withdrawn                                    | deleted                                      |
| Proposals — accepted                                                        | anonymised: `userId` and comment set to NULL |
| Global catalogue entries                                                    | kept; they carry no personal data            |
| Moderation record where the deleted user reviewed                           | `reviewedBy` set to NULL                     |
| Sign-in codes                                                               | deleted                                      |
| Account                                                                     | deleted                                      |

Sign-in codes are additionally purged after 24 hours regardless of any deletion
request (`api/queries/retention.ts`).

The reasoning for keeping accepted proposals is in
`deleteUserAccount` and in the privacy policy shown to users. It rests on
Art. 17(3): other users' stock references those catalogue entries, and the
remaining row no longer identifies anyone.

## Decisions on record

Add entries here as they are made, with dates. This section is the point of the
document — a position that is not written down gets re-litigated.

| Date           | Decision                                                   | Rationale                   |
| -------------- | ---------------------------------------------------------- | --------------------------- |
| _to be filled_ | Registration open or restricted on the public instance     | affects Art. 27 and Art. 30 |
| _to be filled_ | GDPR Art. 27 representative appointed / reasoned exemption | see above                   |
| _to be filled_ | Donation model confirmed non-commercial                    | keeps the CRA exemption     |
