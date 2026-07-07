# Makko Billi Staff (MBS Staff PWA)

The staff companion app for **Makko Billi School** — the staff-side counterpart of the MBS Student App. Teachers, homeroom teachers, supervisors, directors, HR and administrators sign in with their school account and see exactly what their Frappe roles and permissions allow.

Backend: the school's live Frappe/ERPNext site at `https://app.makkobillischool.com`. This repo is frontend-only; it creates no data models of its own except where noted in `docs/SPEC.md`.

## Features (v1)

| Area | What it does | Who sees it |
|---|---|---|
| Dashboard | Today's classes with now/next, role-adaptive stat tiles, homeroom shortcuts | All (adapts) |
| Timetable | My week / my day (dual Gregorian + Ethiopian dates), section timetables, holiday cards, tap a class → attendance | All staff |
| Take attendance | Present/Absent/Leave per student for a `Course Schedule` session; bulk Education API with per-doc fallback | Teachers |
| Results | Marks grid (student × exam, official First Test 15 / Second Test 15 / Mid 20 / Final 50), section overview with rank, year view, CSV export | Teachers see only the subject/section pairs they teach; homeroom + leadership see whole sections |
| Grade appeals | Review queue for `Appeal Result` raised by parents; triage Open → In Review → Resolved/Rejected | Teachers (their subjects), leadership |
| Attendance records | Late days, sick days, permission leaves — logging forms + filterable history; student leave applications | Teachers (their students), leadership |
| Students | Section rosters, school-wide search (leadership), student 360: profile, guardians, merged records timeline (logs, achievements, activities, incidents, late/sick/leave), evaluations, full results history | Scoped |
| Notifications | Personal bell inbox (`Notification Log`), school broadcasts (`App Notification`) with draft composer, admin feedback triage (`Student Feedback`) | Scoped |
| Parent messages | `Teacher Parent Message` threads: compose, read parent replies, follow up | Teacher sees own threads; admin sees all |
| Teacher evaluations | Anonymous aggregates per criterion (never reviewer identity); leadership sees per-teacher table | Teacher: own; leadership: all |
| Staff leave | Apply for HR `Leave Application`, view own history; HR sees pending queue | Employees / HR |
| Analytics | Sex distribution, pass rate, term-average histogram, late/sick monthly trend, sick-by-type | Leadership |
| PWA | Installable, offline read cache of last-seen data, dark mode, update-on-reload, web-push service-worker handlers | All |

## Setup

```bash
npm install
cp .env.example .env   # already contains the registered client id
npm run dev            # http://localhost:5173
npm run build          # typecheck + production build to dist/
```

Environment:

- `VITE_FRAPPE_URL` — the Frappe site (default `https://app.makkobillischool.com`)
- `VITE_OAUTH_CLIENT_ID` — OAuth Client id. **`ci3eeqp3lv` ("MBS Staff PWA") is already registered** on the site with redirect URIs `http://localhost:5173/oauth/callback` and `https://staff.makkobillischool.com/oauth/callback`. When you deploy to a different origin, add `<origin>/oauth/callback` to that OAuth Client's redirect URIs.

## Auth & permissions model

- OAuth 2.0 Authorization Code + **PKCE** against Frappe (`frappe.integrations.oauth2.*`), form-urlencoded token exchange with an empty `Expect` header (the verified pattern for this site). Tokens live in `sessionStorage`, silent refresh before expiry.
- On sign-in the app resolves the **staff identity chain**: User → `Instructor` (via `custom_username`, falling back through `Employee.user_id`) → Student Groups taught (`Student Group Instructor`), homeroom groups (`custom_homeroom_teacher`), and subject/section pairs (from recent `Course Schedule` rows).
- The UI renders from roles + that scope (see `docs/PERMISSIONS.md`), and it re-fetches the context on window focus, so **granting or revoking a role in Frappe changes what the user sees within a minute — no redeploy**.
- Every 403 from the server is handled as an access answer, not an error. The client scope filter is UX; **Frappe DocPerms remain the security boundary**. Recommended server-side hardening steps are listed in `docs/PERMISSIONS.md`.

## Push notifications

The service worker ships `push` / `notificationclick` handlers (`public/sw-push.js`). Delivery needs a server-side Web-Push (VAPID) sender on the Frappe site — key generation, a subscription doctype and a send hook. That server piece is deliberately not part of this repo; until it exists, the in-app bell inbox (with its unread badge) covers notifications while the app is open.

## Design notes

- React 18 + Vite + TypeScript, TanStack Query for server state, Tailwind (class-strategy dark mode), Recharts (lazy-loaded — leadership analytics only), lucide icons.
- A thin hand-rolled Frappe REST client (`src/lib/api.ts`) instead of frappe-react-sdk: bearer-token injection, one 401-refresh retry, typed errors, child-table reads via `frappe.client.get_list`.
- Dual-calendar dates (`src/lib/dates.ts`) use the Beyene–Kudlek Ethiopian conversion — same convention as the student app.
- Grades are always **computed** (A+ ≥95 … F <60), never stored — matching the school's scale.
- Verified doctype/field ground truth lives in `docs/SPEC.md`; nothing in the code references a field that wasn't checked against the live site.
