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

App content and API records require the server-side N&D session. Only the account
matching runtime DEMO_OWNER_EMAIL may register or log in. Initial registration
also requires the runtime ND_SETUP_CODE secret (at least 24 characters), and
registration closes after that owner account exists. Login assets are public.
Never trust client identity headers or remove the owner/session/setup guards.
Cloudflare Access is not required: its free checkout requested a payment card
and authorization for charges above free limits, so it was not activated.
Use only free resources unless the user authorizes a paid plan. R2 is optional
and is not required by the restored inner demo.

Build: `node scripts/build-cloudflare.mjs`.
Test: `node --test tests/auth.test.mjs tests/workspace.test.mjs tests/cloudflare.test.mjs`.
Deploy from the `cloudflare` root, then apply ordered D1 schema migrations.
Do not transfer existing Sites accounts/password hashes through chat or GitHub;
the new host uses its own database and sessions.
