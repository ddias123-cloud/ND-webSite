# N&D on Cloudflare Workers Free

The original student/staff demo, current login/registration screens and the
greeting «Қайырлы күн, Дартай Диас» are preserved. The previous Sites deployment
is a separate, unchanged installation.

## Deployment

The repository location is `ddias123-cloud/ND-webSite`, root directory
`cloudflare`, build command `node scripts/build-cloudflare.mjs`, deploy command
`npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`.
Runtime: Cloudflare Workers Free, provisioned D1 binding `DB`.
The database ID is resource metadata, not an access credential.
Do not enable a paid Workers plan or R2 billing for this demo.

Configure runtime `DEMO_OWNER_EMAIL` and secret `ND_SETUP_CODE` in the dashboard.
The setup code must have at least 24 characters and is entered by the owner,
not committed to this repository. Initial registration requires that code and
the exact allowed email. Registration closes after the owner account exists.
The owner chooses their N&D password through the registration form themselves.
Passwords use salted PBKDF2 and sessions use secure HttpOnly cookies.
Login pages/assets are public; app code, records and pages require an N&D session.
Client-supplied identity headers cannot bypass this check. Failed logins are
limited by hashed edge IP so one visitor cannot exhaust another's login budget.

Cloudflare Access is not needed. Its free activation checkout requested a card
and authorization for overage charges, so that separate service was not activated.

The new host has a new database and new cookies; existing Sites passwords and
account records are not in this source or automatically copied. After the setup
code is configured, register an N&D account on the new host yourself. No default
password exists. Only the configured owner email can register and log in.
Email recovery delivery is still unconfigured.

## Checks

```
node scripts/build-cloudflare.mjs
node --test tests/auth.test.mjs tests/workspace.test.mjs tests/cloudflare.test.mjs
```

The current inner interface uses fictional sample records and local browser
storage. Switching demo roles grants no real server permissions. The prior
server workspace API remains in the source but is not the displayed interface.
No source file contains service credentials or user database records.

Cloudflare docs:
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/d1/reference/migrations/
