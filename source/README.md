# N&D University Demo

An interactive, bilingual university portal created from the supplied Kazakh HTML screen references.

## GitHub source synchronization

The source mirror is `https://github.com/ddias123-cloud/ND-webSite/tree/main/source`.
Changes made with the assistant in this project are copied there after publication
using the workflow in `AGENTS.md`. This is one-way synchronization performed as
part of an editing task, not a background filesystem watcher. Changes made on
GitHub do not deploy the private Site automatically. `github-sync.json` stores
the destination and `scripts/github-snapshot.mjs` exports only committed source.
The public GitHub repository never receives account records, local databases,
password hashes, session cookies or service credentials. Its Pages landing page
continues to redirect visitors to the private N&D login.

## Open locally

Use Node.js 24+: `node scripts/build-auth.mjs`, then `node scripts/preview-auth.mjs`. The preview runs at `http://127.0.0.1:8788` with an isolated test identity and local SQLite database under ignored `.preview/`. No external packages are required. Production is a Worker with a Sites-provisioned D1 binding; static hosting cannot enforce this login.

## Email and password

The hosting policy remains owner-private. The first authenticated owner visit creates a password for the verified ChatGPT email; no default or shared password exists. Enter it directly on the Site. Passwords are salted and derived with Workers-supported PBKDF2-HMAC-SHA256 (100,000 iterations), and never stored as plaintext or browser storage. Random session tokens are stored as SHA-256 hashes in D1 and sent in Secure/HttpOnly/SameSite=Strict cookies. Sessions expire after eight hours; logout revokes the current token. Same-origin checks, bounded JSON bodies and persisted login throttling protect the endpoints.

This is single-owner demo authentication, not university account administration. Role switching still previews fictional sample data and grants no real university permissions. Email delivery, password recovery and enrollment of other users are not implemented. Before a broader launch, use an audited authentication provider and server-backed roles and records. The original GitHub Pages deployment is separate and remains public; this change only updates the protected Site and its installed web app.

## Private iPhone demo

The owner-private Sites deployment supports installation from Safari with Share → Add to Home Screen. Sign in with the owning ChatGPT account first, set the N&D password on the first visit, then add the portal itself (not the platform sign-in page). Keep Open as Web App enabled when that option is shown. The icon, standalone mode and manifest are included; an internet connection and an authorized session are required. Installation is a web app, not an App Store or TestFlight build.

Access is enforced by the Sites hosting policy, not by the manifest, robots metadata or role selector. No service worker caches private pages for offline access. The separately published GitHub Pages copy remains public unless explicitly disabled.

## Screens

- Student, rector, dean, curator and teacher interfaces.
- Kazakh and Russian language switching and light/dark themes.
- Student timetable, chats, grades, activities, points, opportunities, support and assignments.
- Staff analytics, faculty students, curator management, grade entry, financial summary and a scanner walkthrough.
- Browser-local persistence and CSV downloads.

## Demonstration boundaries

All records are examples. Role switching illustrates screen access and is not authentication. Messages, applications and appointments stay in localStorage and are not transmitted. The assistant uses prepared role-specific responses and has no model connection. The scanner shows sample results and does not perform OCR. Assignment files are not uploaded or retained.

Production use requires server-side authentication and authorization, a database, audited role assignments, real integrations, and separate private storage for support records.

## Source references

The user supplied `Рөлдер экрандары N&D.html` and `Студент экрандары N&D.html`. Their visual language, role hierarchy and screen content inform this implementation. Source files are reference material, not runtime dependencies.
