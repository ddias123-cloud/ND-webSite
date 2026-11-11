# N&D University

A Kazakh/Russian university workspace with server-backed accounts, profiles,
roles, assignments, submissions, grades, timetables and in-app notifications.
The current deployment is an owner-private demo. Creating an N&D account does
not add anyone to the Sites hosting allowlist or make the demo public.

## Development

Node.js 24+ is required; no external packages are needed.

```
node scripts/build-auth.mjs
node --test tests/auth.test.mjs tests/workspace.test.mjs
node scripts/preview-auth.mjs
```

The preview is `http://127.0.0.1:8788`, with a test-only platform identity,
SQLite database and avatar storage under ignored `.preview/`. Production uses
a Cloudflare Worker, provisioned D1 `DB` and private R2 `BUCKET` bindings.
SQL files under `drizzle/` are ordered schema-only migrations. Never put account
records, passwords, credentials or real profile data into migrations.

`web/product.js` and `web/product.css` implement the current workspace.
`web/login.js` and `web/login.css` implement registration, login and email link
screens. The older `web/app.js` and `web/style.css` remain as reference material;
the current portal does not load their fictional data or role switcher.

## Accounts and permissions

Users enter their own valid email address. New passwords require 8–128 printable
ASCII characters, with at least one Latin letter and no spaces or Cyrillic.
Existing owner passwords and sessions are preserved. Passwords use salted
PBKDF2-HMAC-SHA256, 100,000 iterations supported by Workers. Session tokens are
random, stored as SHA-256 hashes and sent through Secure, HttpOnly, SameSite=Strict
cookies. Sessions bind to the verified platform visitor and expire after 8 hours.
Logout revokes the current token. Requests use same-origin checks, bounded JSON
bodies and persistent login/mail throttling.

New accounts start as students. The existing verified legacy account receives
the administrator profile. Teacher and curator requests require administrator
approval. Only the administrator can grant or revoke roles; clients cannot
promote themselves. Teachers access their authored teaching records, deans their
faculty, curators their assigned faculty and group, and students their own grades
and group assignments. Rectors and the administrator have a university overview.
Staff faculty/group scope is assigned by the administrator. This version supports
one assigned group per teacher. Students fill in their own group and faculty;
this is not an integration with a university registrar or enrollment approval.

Records are shared in D1. In-app notifications for tasks, grades and schedule
changes refresh every 20 seconds while the portal is visible. These are not
background iOS push notifications. Avatar uploads are cropped to 256px WebP
in the browser, size/type checked by the server, stored privately and served
only to authorized N&D sessions. No private offline page cache is used.

## Email verification and password recovery

The screens, one-time expiring hashed tokens and mail adapter are implemented.
Actual email delivery is **not configured**. Set `RESEND_API_KEY` and a verified
sender in `EMAIL_FROM` through the Sites runtime environment controls when a
sender account is available. Never commit these values. Missing configuration
returns an explicit unavailable message; the UI does not pretend a message was
sent. Password recovery uses a neutral response to avoid disclosing registered
addresses. Reset links last 30 minutes and verification links 60 minutes. Reset
revokes all N&D sessions for that account, including legacy sessions. Email
verification is recorded but not required for this private demo's basic access.

Tests use a mocked email provider; no real delivery has been verified. A broader
university launch still needs enrollment/identity review, recovery delivery,
operational support and institution-specific data rules.

## Private iPhone demo

Open the private deployed URL in Safari, sign in with the owning ChatGPT account,
log in to N&D, then use Share → Add to Home Screen. Keep Open as Web App enabled
when shown. This is a web app, not an App Store/TestFlight build; internet and
an authorized session are required. The access policy remains owner-only.

## Publication and GitHub source mirror

Follow `AGENTS.md`. Changes made in this chat are published to the private Site
and then mirrored to
`https://github.com/ddias123-cloud/ND-webSite/tree/main/source`.
This is task-based one-way synchronization, not a background watcher; changes
made on GitHub do not deploy the private Site automatically. The repository is
public. Only committed, sanitized source is exported by
`scripts/github-snapshot.mjs`; database records, local storage, generated bundles
and service credentials are excluded. GitHub Pages continues to serve the
redirect to the private Site, with `source/` excluded from Pages publication.

## Source references

The user supplied `Рөлдер экрандары N&D.html` and `Студент экрандары N&D.html`.
They inform the visual language and role hierarchy, and are reference material
rather than runtime dependencies.
