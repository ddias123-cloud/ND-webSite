# N&D Cloudflare migration

This project preserves the original inner demo, current registration/login design,
and greeting for Дартай Диас. The existing Sites deployment remains unchanged.

Cloudflare source is mirrored to the root `cloudflare/` subtree of
`ddias123-cloud/ND-webSite`. Preserve all unrelated GitHub paths, especially
`source/` and the existing Pages landing page. Never mirror runtime databases,
cookies, credentials, `.wrangler`, `.env`, `.dev.vars`, account records or bundles.
Use connected GitHub tools for writes and update main with its inspected head as
expected SHA, without force. Cloudflare Builds may deploy this subtree after a
push; keep `cloudflare/wrangler.jsonc` configured fail-closed.

App content and API records require the server-side N&D session. Student signup
is open at the user's explicit request. New email/password accounts are students;
client role fields and forged identity headers must never grant staff access.
The existing DEMO_OWNER_EMAIL account retains its password, sessions and owner
permissions. Only initial registration of that reserved owner email requires
ND_SETUP_CODE (at least 24 characters); use /account#owner-setup for that flow.
Login assets are public. Preserve session checks and the owner setup guard.
Cloudflare Access is not required: its free checkout requested a payment card
and authorization for charges above free limits, so it was not activated.
Use only free resources unless the user authorizes a paid plan. R2 is optional
and is not required by the restored inner demo.

Build: `node scripts/build-cloudflare.mjs`.
Test: `node --test tests/auth.test.mjs tests/workspace.test.mjs tests/cloudflare.test.mjs`.
Deploy from the `cloudflare` root, then apply ordered D1 schema migrations.
Do not transfer existing Sites accounts/password hashes through chat or GitHub;
the new host uses its own database and sessions.
