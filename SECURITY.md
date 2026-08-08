# Security policy

## Supported versions

Only the latest release gets security fixes. There are no maintained release
branches — upgrade to the newest tag before reporting.

This is a hobby project maintained by one person. "Supported" means fixes land
in the next release when I get to them, not within a contractual window. If you
need guarantees, run your own fork; the licence gives you everything you need
to.

Dependencies are watched by Dependabot (npm, GitHub Actions and the Docker base
image), and CI fails on high-severity advisories in production dependencies.
One moderate advisory is knowingly left open — see COMPLIANCE.md for which and
why.

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's private reporting instead:

**[Report a vulnerability](https://github.com/GrimbiXcode/filahub/security/advisories/new)**

Helpful in a report:

- what the issue is and where in the code it sits
- how to reproduce it, ideally against a local instance
- what an attacker gains — data of other users, admin access, the host
- the version or commit you tested

This is a hobby project maintained by one person, so please expect an
acknowledgement within about a week rather than within hours. Once a fix is
released I will credit you in the advisory unless you would rather stay
anonymous.

## Scope

In scope is everything in this repository — the tRPC API, the Telegram login
flow, session handling, the preset moderation workflow and the Docker image.

Out of scope:

- **`filahub.weblabor.io`** — that instance belongs to the maintainer
  personally. Do not test against it; run your own instance instead.
- Anything requiring an already-compromised host, database or Telegram bot
  token.
- Hardening that belongs to the deployment rather than the app — TLS
  configuration, HSTS, network exposure. The app itself now sets
  Content-Security-Policy, `X-Frame-Options`, `Referrer-Policy` and
  `Permissions-Policy` (`api/app.ts`); a gap _there_ is in scope.

## Things worth knowing before you report

These are documented behaviours, not bugs:

- **`TELEGRAM_ALLOWED_IDS` empty means nobody can sign in.** Open registration
  requires `TELEGRAM_OPEN_REGISTRATION=1` as an explicit choice. With it, and
  without `OWNER_TELEGRAM_ID`, no account is made admin automatically — see
  `shouldGrantAdmin` in `api/queries/users.ts`.
- **`DEV_LOGIN=1` bypasses Telegram entirely** and creates an admin. It is
  ignored when `NODE_ENV=production`, and the route is not even registered
  there — see `api/devLogin.ts`.
- **The session cookie is `Secure; SameSite=Lax` outside localhost**, so the
  app requires HTTPS in production. Serving it over plain HTTP is a
  misconfiguration, not a vulnerability in the app.
- **Sessions last 30 days and can be revoked.** The token carries the
  `tokenVersion` it was issued under; "sign out everywhere" bumps the counter
  and invalidates every token at once. A plain sign-out only clears the cookie
  on that device.
- **The preset catalogue is deliberately global**, shared by every account on
  an instance. Every other table is scoped to its owner.

## Verifying a release

Container images carry a build attestation and a software bill of materials.
Both are produced by the release workflow and can be checked without trusting
me:

```bash
# Was this image built from this repository, by its CI?
gh attestation verify oci://ghcr.io/grimbixcode/filahub:latest \
  --repo GrimbiXcode/filahub

# What is inside it?
docker buildx imagetools inspect ghcr.io/grimbixcode/filahub:latest \
  --format '{{ json .SBOM }}'
```

A CycloneDX SBOM of the npm dependencies is also attached to each release run
as a workflow artifact.

## If this ever becomes a commercial product

filahub is currently outside the scope of the EU Cyber Resilience Act, because
it is not supplied in the course of a commercial activity — the reasoning and
the conditions under which that changes are in
[COMPLIANCE.md](COMPLIANCE.md).

Should it change, Art. 14 CRA reporting has applied since 11 September 2026 and
would bind this project: an actively exploited vulnerability or a severe
incident goes to the coordinating CSIRT and ENISA as an early warning within
**24 hours**, a notification within **72 hours**, and a final report within
**14 days** of a fix being available. That process does not exist here today,
and setting it up would be a precondition for going commercial, not an
afterthought.
