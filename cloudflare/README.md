# N&D on Cloudflare Workers Free

The original student/staff demo, current login/registration screens and the
greeting «Қайырлы күн, Дартай Диас» are preserved. The previous Sites deployment
is a separate, unchanged installation.

## Deployment

The repository location is `ddias123-cloud/ND-webSite`, root directory
`cloudflare`, build command `node scripts/build-cloudflare.mjs`, deploy command
`npx wrangler deploy`. Runtime: Cloudflare Workers Free, D1 binding `DB`.
Wrangler automatically provisions a D1 database when its ID is omitted.
Apply migrations after provisioning: `npx wrangler d1 migrations apply DB --remote`.
Do not enable a paid Workers plan or R2 billing for this demo.

Before the app is usable, configure runtime `DEMO_OWNER_EMAIL` in the dashboard
and protect the entire Worker with Cloudflare Access, allowing the owning
Cloudflare account only. The entry uses verified `ctx.access` identity and
checks the owner's email. Every route denies access if either is absent.
Client-supplied Sites identity headers cannot bypass this check.

The new host has a new database and new cookies; existing Sites passwords and
account records are not in this source or automatically copied. After Access
is configured, register an N&D account on the new host yourself. No default
password exists. The owner identity permits separate N&D demo accounts inside
the same private gate. Email recovery delivery is still unconfigured.

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
