# N&D University Demo

An interactive, bilingual university portal created from the supplied Kazakh HTML screen references.

## Open locally

Open `dist/index.html` in a modern browser, or serve `dist` with a static web server. No build step or external packages are needed.

## Included

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
