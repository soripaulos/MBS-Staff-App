# MBS Staff PWA — Development & Testing Handover

**Read this first.** It describes what exists today, how it works, what is deliberately unfinished, and what to test. It is written to be the single onboarding document for a developer or agent taking over this project with no prior context.

- **Repo**: `soripaulos/MBS-Staff-App`
- **Branch with all work**: `claude/mbs-staff-pwa-app-4txssw` (single commit `a068e6e`; `master` is empty)
- **Version**: 0.1.0 — feature-complete for v1 scope, **never run against a real login**
- **Backend**: the school's live Frappe/ERPNext site, `https://app.makkobillischool.com`. This repo is frontend-only.

Companion documents, all in `docs/`:

| File | What it holds |
|---|---|
| `SPEC.md` | The original build brief, including the **verified data contract** (section 5) read from the live database. The authority for field names. |
| `PERMISSIONS.md` | The persona/visibility matrix as implemented, plus recommended server-side hardening. |
| `HANDOVER.md` | This file. |

---

## 1. Status in one paragraph

Every module in the v1 scope is built, typechecks (`tsc --noEmit`) and produces a production build. Every doctype and fieldname used was verified against the live site during development. **No staff account has ever completed the OAuth round-trip against this app** — the auth flow, the identity-chain resolution, and all data reads are unproven end-to-end. The riskiest single piece of code is the teaching-scope resolver (§5), because several modules render from it. Treat the first real sign-in as the top priority, ahead of new features.

There are **no tests, no linter, and no CI**. `npm run build` (typecheck + Vite build) is the only gate.

---

## 2. Running it

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit && vite build → dist/
npm run typecheck    # tsc --noEmit
npm run icons        # regenerates PWA icons via sharp (rarely needed)
```

`.env` variables (both already filled in `.env.example`):

- `VITE_FRAPPE_URL` — defaults to `https://app.makkobillischool.com`
- `VITE_OAUTH_CLIENT_ID` — **`ci3eeqp3lv`** ("MBS Staff PWA"), already registered on the live site

### ⚠ The redirect URI blocks local dev today

The redirect URI is computed at runtime as `` `${window.location.origin}/oauth/callback` `` (`src/lib/config.ts`). OAuth Client `ci3eeqp3lv` on the live site has exactly two registered, verified 2026-09-17:

- `https://staff.makkobillischool.com/oauth/callback`
- `https://mbs-staff-app.pages.dev/oauth/callback`

**`http://localhost:5173/oauth/callback` is not among them**, so signing in from `npm run dev` fails with a redirect-URI mismatch until someone adds it on the Frappe desk (OAuth Client → `ci3eeqp3lv` → Redirect URIs, space or newline separated). Do that first, or test against the Pages deployment instead. The same applies to any new origin. Note also that if Vite falls back to port 5174 because 5173 is taken, the origin changes and sign-in breaks again.

---

## 3. Stack and project layout

React 18 · Vite 5 · TypeScript (strict) · TanStack Query v5 · React Router 6 · Tailwind 3 (class dark mode) · Recharts (lazy, analytics only) · lucide-react · vite-plugin-pwa (Workbox).

There is **no** frappe-react-sdk and **no** component library — the Frappe client and the UI kit are both hand-rolled and small.

```
src/
  main.tsx                    registerSW + React root
  App.tsx                     QueryClient, provider stack, all routes (lazy-loaded pages)
  index.css                   Tailwind layers + dataviz CSS custom properties (light/dark)
  app/AppShell.tsx            header, year/term picker, bell badge, account menu,
                              desktop side rail, mobile bottom nav, offline banner
  components/ui.tsx           Button Input Select Textarea Label Card Badge Modal Tabs
                              Stars Skeleton ListSkeleton EmptyState ErrorState PageTitle
                              statusTone()
  auth/
    pkce.ts                   randomString(), s256Challenge() via WebCrypto
    tokens.ts                 sessionStorage token store (key mbs-staff.tokens.v1)
    oauth.ts                  beginLogin, exchangeCode, refreshTokens, revokeToken
    AuthProvider.tsx          user identity from openid_profile; login/logout
    LoginPage.tsx             branded sign-in screen
    CallbackPage.tsx          /oauth/callback handler
  providers/
    SessionProvider.tsx       ★ roles + identity chain + teaching scope (see §5)
    AcademicProvider.tsx      Academic Year/Term list, current-by-date default, persisted
    ThemeProvider.tsx         light/dark/system, persisted
  lib/
    config.ts   api.ts   types.ts   constants.ts   grades.ts   dates.ts   utils.ts
  features/
    shared/useGroups.ts       useMyGroups, useGroupStudents, useGroupSubjects
    dashboard/   timetable/   results/   attendance/   students/
    notifications/   messages/   evaluations/   analytics/   leave/   more/
public/
  sw-push.js                  push + notificationclick handlers (importScripts'd by Workbox)
  icons/                      192, 512, maskable-512, apple-touch
```

### Routes

| Path | Page | Who sees the nav entry |
|---|---|---|
| `/login`, `/oauth/callback` | auth | unauthenticated |
| `/` | Dashboard | everyone |
| `/timetable` | Timetable | everyone |
| `/results`, `/results/student/:id` | Results center, one student's results | teacher or leadership |
| `/attendance`, `/attendance/take/:scheduleId` | Records + take-attendance | teacher or leadership |
| `/students`, `/students/:id` | Roster, student 360 | teacher or leadership |
| `/notifications` | Inbox / broadcasts / feedback | everyone |
| `/messages` | Parent messages | teacher or leadership |
| `/evaluations` | Teacher evaluations | teacher or leadership |
| `/analytics` | Leadership analytics | leadership |
| `/leave` | Staff leave | linked Employee, or HR |
| `/more` | Menu + settings | everyone |

Unknown paths redirect to `/`. Tabs within a page are driven by `?tab=` search params (so dashboard tiles can deep-link, e.g. `/attendance?tab=sick`).

---

## 4. Authentication flow

OAuth 2.0 Authorization Code **with PKCE**, against Frappe's `frappe.integrations.oauth2.*` endpoints. No client secret.

```
LoginPage → beginLogin()
  generate verifier (96 chars) + state (24) → sessionStorage
  challenge = base64url(SHA-256(verifier))
  redirect to /api/method/frappe.integrations.oauth2.authorize
    ?client_id&response_type=code&scope=all openid&redirect_uri
    &state&code_challenge&code_challenge_method=S256

Frappe consent screen → redirects to /oauth/callback?code&state

CallbackPage → exchangeCode(code, state)
  verifies state matches, pulls verifier, clears both
  POST /api/method/frappe.integrations.oauth2.get_token
    Content-Type: application/x-www-form-urlencoded, Expect: ""
    grant_type=authorization_code, code, redirect_uri, client_id, code_verifier
  → { access_token, refresh_token, expires_in }
  stored in sessionStorage with expires_at = now + (expires_in - 60)s

  then GET /api/method/frappe.integrations.oauth2.openid_profile
  → { email, name } → AuthProvider.setSignedIn → navigate("/")
```

Three details that are load-bearing and were established against this specific site — **do not "clean them up"**:

1. The token request is **form-urlencoded**, not JSON.
2. It sends an **empty `Expect` header**. Without it the site's proxy has been observed to fail the request.
3. `scope` is the literal string `"all openid"`.

**Refresh** is lazy and happens inside `src/lib/api.ts`: every request calls `getAccessToken()`, which checks `expires_at` and, if expired, refreshes once — concurrent callers share one in-flight promise (the `refreshing` module variable). A failed refresh, or any `401` from the API, clears tokens and dispatches a `window` event `"mbs:signed-out"` that `AuthProvider` listens for, dropping the user back to `/login`.

**Tokens live in `sessionStorage`**, deliberately: closing the tab signs the user out. This is a security decision, not an oversight. It also means a PWA launched fresh from the home screen always asks for sign-in.

---

## 5. ★ Identity chain and teaching scope — the highest-risk code

`src/providers/SessionProvider.tsx`, `fetchStaffContext()`. Everything role-aware renders from its output. If this resolves wrong, Results, Students, Attendance, Timetable and Appeals are all wrong downstream.

It runs as one TanStack query keyed `["staff-context", user]`, `staleTime: 60_000`, `refetchOnWindowFocus: true` — which is how **a role change in Frappe takes effect within a minute without a redeploy**.

Each step is wrapped in its own `try/catch` that swallows errors and falls back to empty. A locked-down account degrades to a bare dashboard instead of an error screen. This also means **a permissions problem looks like "no data" rather than a failure** — when debugging, watch the Network tab for 403s.

```
1. Roles       GET User/<email> → doc.roles[].role
                 (403 tolerated → roles = [])

2. Instructor  Instructor where custom_username = <email>          ← primary link
   fallback    Employee where user_id = <email>
               → Instructor where employee = <employee.name>

3. Scope (only if an Instructor was found)
   groupsTaught     frappe.client.get_list on child doctype
                    "Student Group Instructor" (parent "Student Group"),
                    filter instructor = <instructor>, collect distinct .parent,
                    then fetch those Student Groups with disabled = 0
   homeroomGroups   Student Group where custom_homeroom_teacher = <instructor>
                                    and disabled = 0
   subjectPairs     distinct (course, student_group) from Course Schedule
                    where instructor = <instructor>
                      and schedule_date >= today − 120 days
```

### Known limitations of the scope resolver — verify these first

- **The 120-day window.** `subjectPairs` only sees subjects scheduled in the last 120 days. At the very start of an academic year, or for a subject that hasn't met recently, a teacher's subject list will be **empty** and Results will show "No subjects". This drives the Results subject dropdown, the Appeals filter, and the dashboard's "Subjects I teach" tile.
- **Two sources specified but not implemented.** `SPEC.md` §4.1 says to union the Course Schedule pairs with (a) `Weekly Schedule Entry` per-day instructor columns (`monday_instructor`…`sunday_instructor`, child of `Weekly Course Schedule Tool`) and (b) course-based Student Groups (`group_based_on = 'Course'`). Neither is implemented. Adding them would fix the 120-day gap at its root.
- **Groups are not year-filtered here.** `groupsTaught` fetches every year's groups; the academic-year filter is applied later in `useMyGroups`.
- **No `has_permission` probing.** `SPEC.md` §4.2 asks for feature gating on live permission checks first and persona mapping second. The implementation is persona-only (role-name lists in `SessionProvider`). A new role such as "Vice Principal" will **not** light up features automatically — it must be added to the role arrays. This is a known deviation from the brief.

### Persona flags produced

```ts
isTeacher        instructor record found, OR "Instructor" role
isLeadership     Director | Education Manager | Academics User | System Manager
isAdmin          System Manager | Education Manager
isAcademicAdmin  isAdmin | Academics User
isHR             HR Manager | HR User | Leave Approver
canBroadcast     System Manager | Education Manager | Academics User | Director
employee         linked Employee record (gates staff leave)
```

**These flags decide what renders, never what the server returns.** Frappe DocPerms remain the security boundary. Client filters are UX. `docs/PERMISSIONS.md` lists the server-side permission-query conditions the school should add for row-level guarantees.

---

## 6. The Frappe client (`src/lib/api.ts`)

A thin typed wrapper — roughly 200 lines, no dependencies.

| Function | Transport |
|---|---|
| `getList(doctype, {filters, fields, limit, start, orderBy, parent})` | `GET /api/resource/<doctype>?…` → `.data` |
| `getDoc(doctype, name)` | `GET /api/resource/<doctype>/<name>` → `.data` |
| `getChildList(childDoctype, parentDoctype, opts)` | `frappe.client.get_list` with explicit `parent` — **required for child doctypes** |
| `getCount(doctype, filters)` | `frappe.client.get_count` |
| `createDoc(doctype, doc)` | `POST /api/resource/<doctype>` |
| `updateDoc(doctype, name, patch)` | `PUT /api/resource/<doctype>/<name>` |
| `submitDoc(doc)` | `frappe.client.submit` (docstatus 0 → 1) |
| `call(method, params)` / `postCall(method, params)` | `GET`/`POST /api/method/<method>` → `.message` |
| `downloadFile(path, filename)` | authenticated blob fetch → browser save |
| `fileUrl(path)` | prefixes `FRAPPE_URL` unless already absolute |

Conventions worth knowing:

- Default `limit` is **100**. Pages that need more pass it explicitly (marks grids use 5000). Watch for silent truncation when a section grows.
- Errors throw `FrappeError` carrying `.status`. `extractMessage()` unwraps Frappe's `message` / `exception` / `_server_messages` shapes and strips HTML.
- The global `QueryClient` (in `App.tsx`) **does not retry 4xx** — a 403 fails fast and lands in `ErrorState`, which renders a specific, non-alarming message for 403 and hides the retry button. Treat a 403 as an answer, not an error.
- `getList` filters are passed as Frappe filter arrays. TypeScript's inference fights the nested tuple shapes; several call sites use `as never`. That is deliberate noise, not a bug — but it means **the compiler will not catch a malformed filter**. Check filters by eye.

---

## 7. Data contract — what the app actually reads and writes

`SPEC.md` §5 is the full verified contract. This table is the subset the code touches, with the operations performed. **No fieldname in this codebase was invented — each was checked against the live site.** Keep it that way.

### Read

| Doctype | Fields used | Where |
|---|---|---|
| `User` | `roles[].role` | SessionProvider |
| `Instructor` | `name`, `instructor_name`, `image`, `custom_username`, `employee` | SessionProvider |
| `Employee` | `name`, `employee_name`, `user_id` | SessionProvider, Staff leave |
| `Student Group` | `student_group_name`, `program`, `academic_year`, `academic_term`, `group_based_on`, `custom_homeroom_teacher`, `disabled`, child `students` | useGroups, everywhere |
| `Student Group Instructor` (child) | `instructor`, `parent` | SessionProvider |
| `Student Group Student` (child) | `student`, `student_name`, `group_roll_number`, `active` | rosters, attendance |
| `Course Schedule` | `course`, `student_group`, `instructor`, `instructor_name`, `room`, `schedule_date`, `from_time`, `to_time`, `class_schedule_color` | Timetable, Dashboard, scope |
| `Holiday` (child of `Holiday List`) | `holiday_date`, `description`, `weekly_off` | Timetable |
| `Student Term Subject Result` | `student`, `student_name`, `subject`, `exam`, `score`, `max_score`, `semester`, `academic_year`, `student_group` | Results |
| `Student Term Report` | `student`, `student_name`, `academic_term`, `term_average`, `rank_in_group`, `student_group` | Results, Analytics |
| `Student Year Report` | `student`, `student_name`, `academic_year`, `year_average`, `rank_in_group` | Results |
| `Appeal Result` | `student_name`, `student_group`, `subject`, `exam`, `original_score`, `original_max_score`, `reason`, `attachment`, `status`, `resolution`, `semester` | Results › Appeals |
| `Student` | `student_name`, `image`, `gender`, `date_of_birth`, `joining_date`, `student_email_id`, `custom_school_id`, `custom_government_student_id`, `custom_student_category`, `custom_mode_of_transport`, `enabled`, `guardians[]` | Students |
| `Student Log` | `type`, `date`, `log` | Student timeline |
| `Student Activity` | `activity_type`, `activity_date`, `title`, `role`, `description` | Student timeline |
| `Student Incident`, `Student Discipline Incident` | `incident_date`, `incident_type`, `severity`, `status`, `description` | Student timeline |
| `Student Late Day` | `student`, `date`, `time`, `reason` | Attendance, timeline, analytics |
| `Student Sick Day` | `student`, `date`, `type`, `details`, `parent_contacted`, `leave_early` | Attendance, timeline, analytics |
| `Student Permission Leave` | `student`, `date`, `time`, `reason`, `detail` | Attendance, timeline |
| `Student Leave Application` | `student`, `student_name`, `from_date`, `to_date`, `total_leave_days`, `reason`, `custom_status`, `docstatus` | Attendance › Leave |
| `Student Attendance` | `student`, `status`, `docstatus`, `course_schedule` | Take attendance |
| `Student Evaluation` | `students`, `class`, `reviewer`, `review_date`, `feedback`, ~19 Rating fields | Student 360 › Evaluations |
| `Teacher Evaluation` | `instructors`, `student_group`, `review_date`, `respect`, `exams`, `communication_skill`, `followup`, `homework`, `knowledge` | Evaluations |
| `Teacher Parent Message` | full thread fields | Messages |
| `Notification Log` | `subject`, `email_content`, `read`, `creation`, `for_user` | Notifications › Inbox |
| `App Notification` | `title`, `status`, `sent_date`, `notification_category`, `message`, `send_to_all_students` | Notifications › Broadcasts |
| `Student Feedback` | `student_name`, `status`, `category`, `subcategory`, `specific_issue`, `details`, `attachment` | Notifications › Feedback |
| `Academic Year`, `Academic Term` | name + start/end dates | AcademicProvider |
| `Leave Application`, `Leave Type` | HR fields | Staff leave |

### Write

| Doctype | Operation | Page |
|---|---|---|
| `Student Attendance` | create (+submit), or `set_value` on a draft; bulk via Education API | Take attendance |
| `Student Late Day` / `Student Sick Day` / `Student Permission Leave` | create + best-effort submit | Attendance forms |
| `Student Log`, `Student Activity` | create | Student 360 › Add |
| `Teacher Parent Message` | create; update `teacher_followup` + date | Messages |
| `Appeal Result` | update `status` + `resolution` | Results › Appeals |
| `Student Feedback` | update `status` | Notifications › Feedback |
| `App Notification` | create as **Draft** | Notifications › compose |
| `Notification Log` | `set_value read = 1` | Inbox |
| `Leave Application` | create with `status: "Open"` | Staff leave |

**The app never writes a score.** Correcting a mark is a desk operation (submitted docs need cancel + amend); the Appeals UI says so explicitly.

### Two conventions that are easy to get wrong

- **Grades are always computed, never stored.** `src/lib/grades.ts`: A+ ≥95, A ≥90, B+ ≥85, B ≥80, C ≥70, D ≥60, F below. Pass threshold is 60.
- **Frappe Rating fields store 0–1**, not 1–5. `ratingToStars()` in `utils.ts` multiplies by 5. Every rating display must go through it.

Exam names are verified live values (`src/lib/constants.ts`): `First Test`, `Second Test`, `Mid Exam`, `Final Exam`, with official maxima 15/15/20/50. **The maxima are display hints only** — real totals always come from each row's `max_score`.

---

## 8. Feature notes — behaviour, scoping, and known limits

### Dashboard (`/`)
Role-adaptive tiles + today's classes with Now/Next badges computed from wall-clock time against `from_time`/`to_time`, each linking straight to attendance-taking. Homeroom shortcuts when applicable. Every tile count is a `getCount` wrapped in `.catch(() => undefined)`, so a permission failure shows `—` rather than breaking the page.

### Timetable (`/timetable`)
Two modes: **My timetable** (by instructor) and **Section timetable** (by group). Mon–Sat, week navigation, mobile day-switcher and desktop week grid. Dual Gregorian + Ethiopian dates throughout. Class cards carry the `class_schedule_color` left border. Tapping your own class on a past-or-today date opens attendance.

*Limit*: holidays are read from the `Holiday` child table across **all** Holiday Lists in the date range, with no filtering by `Holiday Student Group`. If the school scopes holidays per section, this will over-report.

### Results (`/results`)
Four tabs: **Marks grid** (student × exam pivot, computed total/%/grade, sticky header and first column, CSV export), **Section overview** (rank + per-subject percentages + term average, falling back to raw results when Term Reports haven't been generated), **Year** (Year Report ranks), **Appeals**.

Scoping: the subject dropdown comes from `useGroupSubjects` — teachers get only their `subjectPairs` for that group; homeroom teachers and leadership get every subject that has results there. Section overview and Year tabs only render for homeroom or leadership.

*Limit*: **Appeals are fetched unfiltered and narrowed client-side** to the teacher's subject/section pairs. The server must enforce this properly (see `PERMISSIONS.md` hardening list) — until then a teacher's browser has received rows it doesn't display.

### Take attendance (`/attendance/take/:scheduleId`)
Loads the schedule, the group roster (active, roll-number sorted), and any existing `Student Attendance` for that session. Defaults everyone to Present. Saves only what changed.

Two save paths in `saveAttendance()`:
1. **Bulk** — used only when nothing exists yet for the session. Tries `education.education.api.mark_attendance` then `erpnext.education.api.mark_attendance`; a 404/417 falls through to the next, any other status rethrows.
2. **Per-document fallback** — create + best-effort submit for new records, `frappe.client.set_value` for drafts.

*Two real limits to verify on the first live run:*
- **The bulk path collapses `Leave` into `students_absent`**, because the Education API only takes present/absent. If any student is marked Leave on a first-save, they will be recorded Absent. Consider forcing the per-doc path whenever a Leave mark is present.
- **Submitted records are skipped silently** — the loop `continue`s without counting, so the "N records written" message can undercount. Their buttons are disabled in the UI and marked "saved"; correcting them is a desk cancel+amend.

### Attendance records (`/attendance`)
Tabs for Late / Sick / Permission / student Leave applications, each with a date range (default last 30 days) and a create form. Forms create then **best-effort submit** — if the user lacks submit permission the record stays a draft rather than erroring.

*Limit*: teacher scoping loads the rosters of **at most the first 12 of their groups** (`groups.slice(0, 12)`) to build the allowed-student set, and the filter applies only once that query resolves — so rows can flash unfiltered on slow connections. Server-side permission conditions are the real fix.

### Students (`/students`, `/students/:id`)
Section roster with in-section search; leadership additionally gets school-wide search at 3+ characters. Student 360 has three tabs: **Overview** (profile + guardians), **Records** (a merged, date-sorted timeline of logs, achievements, activities, incidents, discipline incidents, late/sick/permission, with type filters — every source individually `.catch`-guarded so partial permissions still render something), and **Evaluations** (star ratings grouped into Academics / Skills / Habits & conduct).

### Notifications (`/notifications`)
**My inbox** reads `Notification Log` for the signed-in user with mark-read and mark-all-read; the header bell polls the unread count every 120s. **School broadcasts** lists `App Notification`; authorized roles can compose — and composing **saves a Draft only**. Actual delivery to student devices runs through the school's existing send flow on the desk; the modal says so. **Feedback inbox** (admins) triages `Student Feedback` through Open → In Review → Resolved → Closed.

### Parent messages (`/messages`)
`Teacher Parent Message` threads: compose to a student, read the parent's reply, add a follow-up. Teachers are filtered to `teacher = session user`; admins see all.

### Teacher evaluations (`/evaluations`)
Aggregates of `Teacher Evaluation` per criterion. **The `reviewer` field is never requested from the server** — anonymity is preserved at the query level, not by hiding a column. Teachers query only their own rows; leadership sees a per-teacher table with expandable detail.

*Cosmetic*: the leadership table prints the raw `instructors` link value (an Instructor docname), not `instructor_name`.

### Analytics (`/analytics`)
Leadership only. Stat tiles (active students, sex ratio, mean term average, pass rate ≥60) plus three charts: late/sick by month, term-average histogram, sick-by-type. Charts use the validated dataviz palette exposed as CSS custom properties in `index.css` (`--viz-series-1…4`, `--viz-grid`, `--viz-muted`), redefined for dark mode — **use those variables rather than hardcoding chart colors.**

### Staff leave (`/leave`)
Apply for HR `Leave Application` (created with `status: "Open"`), see own history; HR sees the pending queue. Approve/reject is deliberately **not** implemented — it runs the HR workflow and belongs on the desk.

### More (`/more`)
Navigation overflow, theme toggle, notification-permission request (only on explicit tap, never on load), and the install prompt.

---

## 9. PWA behaviour

`vite-plugin-pwa` with `registerType: "autoUpdate"`. Manifest: standalone, portrait, brand green `#146c43`, shortcuts to Timetable / Results / Notifications.

Workbox runtime caching:
- `/api/resource/*` and `/api/method/frappe.client*` **GETs** → `NetworkFirst`, 8s timeout, 300 entries, 24h. This is what makes the app readable offline.
- `/files/*` → `CacheFirst`, 30 days.
- `navigateFallback: /index.html` with `/api/` and `/files/` denied, so client routing works on refresh.

`public/sw-push.js` is `importScripts`'d into the generated SW and implements `push` and `notificationclick` (focus-or-open the deep link). **Delivery does not work yet** — it needs VAPID keys, a subscription doctype and a send hook on the Frappe site, none of which exist. Until then the in-app bell inbox is the notification channel.

*Known mismatch to fix*: the offline banner claims "Changes are disabled," but **nothing actually disables mutations when offline**. A write attempted offline will fail at the network layer with a generic error. Either disable submit buttons on `!navigator.onLine` or reword the banner.

---

## 10. Conventions to preserve

- **Never reference a field that isn't in `SPEC.md` §5 or verified live.** If you need a new one, verify it against the site first (the Frappe MCP tools were used for this originally).
- **Grades computed, never stored.** Ratings are 0–1 and go through `ratingToStars`.
- **Dual dates everywhere a date is user-facing**: `dualDate()` renders `"Mon, Nov 3 · Hidar 24, 2018 E.C."`. The Ethiopian conversion is Beyene–Kudlek, matching the student app.
- **403 is an answer.** Wrap optional reads in `.catch()` and let `ErrorState` handle the rest; never show a scary error for a permission boundary.
- **Persona flags gate layout; the server gates data.** Don't move security logic into the client.
- **Dark mode is class-based** and every surface needs its `dark:` pair. Charts read the CSS variables.
- Mobile-first: bottom tab bar below `md`, side rail at `md+`, wide tables inside `overflow-x-auto` with sticky headers. The page body should never scroll horizontally.
- Tabs and filters live in `?tab=` search params so they're linkable.

---

## 11. What is NOT built

### Open decisions awaiting the product owner
1. **`Staff Feedback` doctype** — the staff→school channel. Specified in `SPEC.md` §5.6 (fields, anonymity flag, role permissions) but **not created on the live site and not wired in the UI**, because creating a production doctype needs explicit approval.
2. **Staff broadcast delivery** — v1 only reaches staff through the in-app bell. Extending `App Notification` with staff recipients (or a parallel doctype) is a production schema change.
3. **Web push server side** — VAPID keys, a `Staff Push Subscription` doctype, a `notify_user` util and hooks.

### Deliverables from the brief that were not produced
4. **`server/`** — the brief asks that every new doctype, whitelisted method and permission config live in the repo as applyable Frappe fixtures with an install guide. This directory does not exist.
5. **Tests.** None. The brief names three suites: permission-mapper / scope-resolver units, marks-grid math (totals, percentages, banding), and a login-redirect smoke test against a mocked token endpoint. There is no `test` or `lint` script.
6. **`docs/DATA_NOTES.md`** and **`SECURITY_NOTES.md`** — the live-site recon findings and the doctypes whose scoping is currently client-only.
7. **Lighthouse PWA audit** — never run.

### Unresolved data questions
8. **The twin doctypes.** `SPEC.md` §5.4 notes that `Student Late Day`/`Student Late Record` and `Student Sick Day`/`Student Sick Record` both exist, and asks that row counts decide which is live. The app uses the **`Day`** variants throughout. This choice was never confirmed against row counts — if the school actually writes the `Record` variants, Attendance, the student timeline and Analytics are all reading empty tables.
9. **`has_permission` gating** (§5 above) — persona role-lists are hardcoded, so new roles need a code change.

---

## 12. Test plan

Nothing here has been executed. Run it in order; step 1 gates everything.

### 1 · First sign-in (blocks all other testing)
Confirm the dev server is on **port 5173**. Sign in as a plain `Instructor`.

- [ ] Consent screen appears; callback completes; you land on the dashboard with your name
- [ ] Open DevTools → Application → Session Storage: `mbs-staff.tokens.v1` present, PKCE keys cleared
- [ ] **Log the resolved scope** and verify against reality — `groupsTaught`, `homeroomGroups`, `subjectPairs` must match what that teacher actually teaches. Add a temporary `console.log` in `fetchStaffContext`. *This is the single most important check in the project.*
- [ ] Confirm which branch of the identity chain fired: `custom_username` or the `Employee.user_id` fallback
- [ ] Watch the Network tab for 403s — silent catches make permission problems look like empty data
- [ ] Reload the page: still signed in. Close the tab and reopen: signed out (expected).

### 2 · Scope correctness per persona
Test as: an `Instructor`, a homeroom teacher, leadership (`Director` / `Education Manager`), and an admin (`System Manager`).

- [ ] Nav items match the persona table in §5
- [ ] Teacher: Results shows only taught subject/section pairs; Section overview and Year tabs are absent
- [ ] Homeroom teacher: Section overview and Year appear for the homeroom group only
- [ ] Teacher: deep-link `/results?group=<someone-else's-group>` — expect a 403 handled as a calm access message, not a crash
- [ ] Leadership: all groups listed; school-wide student search works at 3+ characters
- [ ] Admin: Feedback inbox tab appears; sees all parent-message threads
- [ ] **Revoke a role in Frappe, return to the tab** — within ~60s (window focus refetch) the UI should drop the corresponding features with no redeploy

### 3 · Results
- [ ] Marks grid totals, percentages, letter grades and band colors are right for a section with real data (hand-check one student)
- [ ] Students with a missing exam show `—` and are not counted into the max
- [ ] CSV export opens correctly in Excel (it is written with a BOM)
- [ ] Section overview ranks match `Student Term Report.rank_in_group`
- [ ] Section with no Term Reports yet falls back to raw results without erroring
- [ ] A section with >100 students isn't truncated (limits are set to 5000 — confirm)
- [ ] Appeals: open one, set In Review → Resolved, confirm the parent-facing status changes in the student app
- [ ] Verify the teacher's appeal list is narrowed to their pairs

### 4 · Attendance (the highest write risk)
- [ ] Take attendance for a fresh session, all Present → confirm `Student Attendance` docs land with the right `course_schedule`, `student_group`, `date`
- [ ] **Mark one student Leave on a first save** and check what was actually stored — the bulk path may record Absent (§8). If so, force the per-doc path.
- [ ] Re-open the same session: prior marks load, submitted rows are disabled and labelled "saved"
- [ ] Change one draft mark and re-save: only that record updates
- [ ] Confirm whether the bulk Education API endpoint exists on this site at all, or whether every save falls through to the per-doc path
- [ ] Log a late / sick / permission record; confirm docstatus (submitted vs left draft) and that it appears in both the list and the student's timeline
- [ ] Check that a teacher sees only their own students' records — and note the 12-group cap

### 5 · Everything else
- [ ] Timetable: week navigation, Today, mobile day-switcher, holiday cards, Ethiopian dates correct against a known date
- [ ] Student 360: timeline merges all seven sources in date order; filters work; adding a Log and an Activity persists
- [ ] Evaluations: star math matches the raw 0–1 values ×5; **confirm no request anywhere asks for `reviewer`** (check the Network tab)
- [ ] Messages: compose → appears for the parent in the student app; a parent reply shows as "Parent replied"; follow-up saves
- [ ] Notifications: unread badge accurate; mark-read sticks; composing a broadcast creates a **Draft** (not a send)
- [ ] Staff leave: application created with `status: "Open"`; HR pending queue lists it
- [ ] Analytics: tile numbers cross-check against Frappe report views

### 6 · PWA, responsive, accessibility
- [ ] Installable on Android/desktop (prompt in More) and iOS (Share → Add to Home Screen)
- [ ] Load a few pages, go offline: cached reads still render, offline banner shows
- [ ] Run Lighthouse — PWA installable, SW registered, manifest valid, offline start
- [ ] 360px / 768px / 1024px / 1440px; both themes; no horizontal page scroll
- [ ] Keyboard-navigable; focus rings visible; modals close on Escape

---

## 13. Suggested order of work for whoever picks this up

1. **Run test plan §1 and §2.** Fix whatever the scope resolver gets wrong before touching anything else.
2. **Fix the two attendance issues** (§8) if the live run confirms them — they cause wrong data, not just wrong display.
3. **Resolve the twin-doctype question** (§11.8) against real row counts; write `docs/DATA_NOTES.md` while you're in there.
4. **Add the test suite and a lint script** — scope resolver, marks-grid math, permission mapper first, since those are the parts that silently produce wrong numbers.
5. **Create `server/`** with the fixtures and install guide so the site admin has something applyable.
6. Then the open product decisions (Staff Feedback, broadcast delivery, web push) once the owner has chosen.

---

## 14. Git

All work is on `claude/mbs-staff-pwa-app-4txssw`. `master` has no commits. There is no open PR. Push with `git push -u origin claude/mbs-staff-pwa-app-4txssw`.
