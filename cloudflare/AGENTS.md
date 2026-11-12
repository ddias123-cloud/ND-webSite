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

Every request must pass Cloudflare Access and match runtime DEMO_OWNER_EMAIL.
Never trust client identity headers or silently publish an unprotected fallback.
Use only free resources unless the user authorizes a paid plan. R2 is optional
and is not required by the restored inner demo.

Build: `node scripts/build-cloudflare.mjs`.
Test: `node --test tests/auth.test.mjs tests/workspace.test.mjs tests/cloudflare.test.mjs`.
Deploy from the `cloudflare` root, then apply ordered D1 schema migrations.
Do not transfer existing Sites accounts/password hashes through chat or GitHub;
the new host uses its own database and sessions.
