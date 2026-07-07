# MBS Staff App — Full Development Prompt

You are building the **MBS Staff App**: a production-grade Progressive Web App (PWA) for the staff of **Makkobilli School (MBS)** — teachers, homeroom teachers, supervisors, principals, directors, HR/admin staff, and school administrators. The app is a frontend for an existing **Frappe/ERPNext (Education + HRMS)** backend that is already live and full of data.

**Companion context**: the school already runs the **MBS Student App** (parent/student side, at `portal.makkobillischool.com`). Every two-way flow in that app has a staff-side counterpart that THIS app must serve: parents appeal grades → teachers review appeals; teachers send `Teacher Parent Message` → parents reply → teachers follow up; staff write `Student Hub Evaluation` / incidents → parents acknowledge/respond; parents rate teachers (`Teacher Evaluation`, rate-limited to once per teacher per 30 days) → staff see aggregates; parents submit `Student Feedback` → admins triage; parents apply for student leave → staff review. The student app displays Gregorian and Ethiopian calendar dates side by side and shows Holiday/Special Event cards on the schedule — mirror both conventions here.

You have access to the **Frappe MCP server** connected to the production site. Use it throughout development to verify doctype structures, field names, real data shapes, roles, and permissions **before** writing code against them. Never guess a fieldname — check it. The "Data Contract" section below was verified directly against the live database and is your starting ground truth; re-verify anything you extend.

---

## 1. Mission

One app, one login, and every staff member sees **exactly what their Frappe permissions allow — nothing more, nothing less**:

- A **teacher** sees the sections (Student Groups) they teach, the subjects they teach in those sections, the results of only those subject/section combinations, their own timetable, and their own parent messages.
- A **homeroom teacher** additionally sees the full picture of their homeroom section (all subjects, term reports, ranks, attendance-type records).
- A **supervisor / principal / director** sees whole-school or whole-division data: all sections, all results, trends, statistics, evaluations.
- An **administrator** additionally sees the school feedback inbox (feedback submitted by staff and by the student hub), manages notifications, and manages taxonomy/settings.
- **Permissions are live**: when an admin grants or revokes a role or user permission in Frappe, the app reflects it on next data fetch/session refresh without a new build or code change. The UI is permission-driven, not hardcoded per person.

The backend is the source of truth for authorization. The frontend only *mirrors* permissions for UX (hiding what would 403 anyway); it never *implements* them.

---

## 2. Tech Stack

- **React 18 + TypeScript + Vite**.
- **frappe-react-sdk** (which wraps **frappe-js-sdk**) for all data access: `useFrappeGetDocList`, `useFrappeGetDoc`, `useFrappeGetCall`, `useFrappeCreateDoc`, `useFrappeUpdateDoc`, `useFrappePostCall`, `useSWR`-based caching. Review the current frappe-react-sdk and frappe-js-sdk documentation (fetch from GitHub/npm) before wiring auth — especially `FrappeProvider`'s `tokenParams` for OAuth bearer tokens.
- **vite-plugin-pwa** (Workbox) for the service worker, manifest, offline support, and update flow.
- **Tailwind CSS + shadcn/ui** components; **lucide-react** icons; **Recharts** for charts.
- **React Router v6** with route-level code splitting.
- **date-fns** for dates. All backend dates are Gregorian `YYYY-MM-DD`, but the school communicates in both calendars and the student app already shows **Gregorian and Ethiopian dates side by side** — do the same here (use a small Ethiopian-calendar conversion util, e.g. the `kenat`/`ethiopian-date` npm package or a ~40-line converter; centralize ALL date formatting in one `lib/dates.ts`).
- State: rely on frappe-react-sdk's SWR cache; add a small Zustand store only for session/UI state (current academic year & term selection, sidebar, theme).

Repository layout:

```
/src
  /app            # router, providers, layout shells
  /auth           # OAuth flow, token storage, session bootstrap, guards
  /api            # typed wrappers around doctypes + whitelisted methods
  /features
    /dashboard
    /results
    /timetable
    /attendance   # late days, sick days, leave
    /students     # student 360 profile, logs, activities, incidents
    /notifications
    /feedback     # staff feedback, teacher-parent messages, evaluations
    /statistics
  /components     # shared UI
  /lib            # permissions, date utils, constants
/public           # icons, manifest assets
```

---

## 3. Authentication — Frappe OAuth 2.0 (PKCE)

Use Frappe's built-in OAuth 2 provider. Do **not** use username/password or cookie-only sessions as the primary mechanism.

1. **Server prerequisite** (document this in the README; create via Frappe MCP if asked): an **OAuth Client** record in Frappe with:
   - Grant Type: `Authorization Code`, Response Type: `Code`
   - PKCE enabled (`Code Challenge Method: S256`) so no client secret ships in the browser
   - Redirect URI: `https://<app-host>/auth/callback` (plus `http://localhost:5173/auth/callback` for dev)
   - Scopes: `all openid`
2. **Client flow**:
   - `/auth/login` → generate `code_verifier`/`code_challenge` + `state`, store verifier in `sessionStorage`, redirect to `<frappe>/api/method/frappe.integrations.oauth2.authorize`.
   - `/auth/callback` → exchange code at `frappe.integrations.oauth2.get_token`, receive `access_token`, `refresh_token`, `id_token`, `expires_in`.
   - Persist tokens in `localStorage` under a versioned key; schedule silent refresh at ~80% of `expires_in` using the refresh token; on refresh failure, force re-login.
   - Configure `FrappeProvider` with `tokenParams: { useToken: true, token: () => getAccessToken(), type: "Bearer" }` so every SDK call carries the bearer token.
   - `openid profile` gives you the user email via `frappe.integrations.oauth2.openid_profile` — use it to identify the logged-in user.
3. **Session bootstrap** (runs after login and on every app start; this is what makes permissions *live*):
   - Fetch the logged-in user: `frappe.auth.get_logged_user`.
   - Fetch the user's **roles**: read `User` doc or call a small whitelisted method; roles drive coarse UI gating.
   - Resolve the **staff identity chain** (Section 4).
   - Fetch **per-doctype permissions** for every doctype the app touches using `frappe.client.get_list` probes or `frappe.permissions.has_perm` via `useFrappeGetCall('frappe.client.has_permission', {...})`. Cache in context as `can(doctype, ptype)`.
   - Re-run bootstrap on window focus after >5 minutes of inactivity and on token refresh, so permission changes made in Frappe propagate without reinstalling.
4. **Every backend error is authoritative**: a 403 from the server hides that section and shows a friendly "You don't have access" state — never retry-loop, never mask as a crash.

---

## 4. Identity, Roles & Data Scoping

### 4.1 Identity chain (verified against the live site)

Resolve who the logged-in user *is* in school terms:

1. `User` (email from OAuth) →
2. `Instructor` where `custom_username = user.name` (this custom field exists and links Instructor → User). Fallback: `Employee` where `user_id = user.name`, then `Instructor` where `employee = employee.name`.
3. From the Instructor, derive teaching scope:
   - **Student Groups taught**: `Student Group` docs whose child table `instructors` (child doctype `Student Group Instructor`, field `instructor`) contains this Instructor, filtered to the selected `academic_year` / `academic_term` and `disabled = 0`.
   - **Homeroom sections**: `Student Group` where `custom_homeroom_teacher = instructor.name`.
   - **Subject/section pairs taught**: distinct (`course`, `student_group`) pairs from `Course Schedule` where `instructor = instructor.name`; union with the per-day instructor columns in `Weekly Schedule Entry` (`monday_instructor` … `sunday_instructor` alongside `monday` … `sunday` course links, child of `Weekly Course Schedule Tool`); union with course-based Student Groups (`group_based_on = 'Course'`) where they are listed as instructor.

Cache this "TeachingScope" object in context: `{ instructor, groupsTaught[], homeroomGroups[], subjectSectionPairs[] }`.

### 4.2 Roles present on the site (verified)

Relevant roles that exist right now: `Instructor`, `Education Manager`, `Academics User`, `Director`, `HR Manager`, `HR User`, `Leave Approver`, `System Manager`, `Analytics`, `Scholarship Supervisor`, `ICT Technician`, `Employee`, `Employee Self Service`. Map them to app personas:

| Persona | Roles (any of) | Scope |
|---|---|---|
| Teacher | `Instructor` | Own subject/section pairs only |
| Homeroom teacher | `Instructor` + is `custom_homeroom_teacher` of a group | Full data for homeroom group(s) + teacher scope |
| Supervisor / Principal / Director | `Academics User`, `Education Manager`, `Director` | All sections & results, evaluations, trends |
| Administrator | `System Manager` or `Education Manager` | Everything above + feedback inbox + notification management + settings |
| HR | `HR Manager`, `HR User`, `Leave Approver` | Staff leave applications, staff attendance views |

**Do not hardcode this table as the only gate.** It selects which navigation items *render*; the actual data access must always be a live server check (`has_permission` probe + graceful 403 handling). If the school later adds a role like "Vice Principal", granting that role the right Frappe permissions must light the features up automatically — so gate features on `can('Student Term Report','read')`-style checks first, persona mapping second (persona only decides *layout emphasis*, e.g., which dashboard variant to show).

### 4.3 Teacher data scoping rules (enforce in queries, mirror on server)

- Results a teacher can see: `Student Term Subject Result` where `student_group ∈ groupsTaught` **and** `subject ∈ subjects they teach in that group` (from `subjectSectionPairs`), or where `examiner = instructor`.
- Homeroom teachers can additionally read `Student Term Report` / `Student Year Report` for students of their homeroom group(s).
- Late/sick/leave/log/activity/incident records: teachers see records for students in their groups (filter by student ∈ group's `students` child table, child doctype `Student Group Student`, fields `student`, `student_name`, `group_roll_number`, `active`).
- Leadership personas see all, subject to Frappe permissions.
- **Server-side**: where Frappe's role permissions are too coarse for row-level scoping, prefer configuring Frappe **User Permissions** / permission query conditions on the site (document what needs to be configured), rather than trusting the client filter. Client filters are UX; server config is security. Flag any doctype where scoping is currently only client-side in a `SECURITY_NOTES.md`.

---

## 5. Data Contract — Verified DocTypes & Fields

These structures were read from the live database. Re-verify with the Frappe MCP (`get_doctype_info`) before use, and inspect 2–3 real documents per doctype (`list_documents`) to learn data conventions (naming series, how terms are labeled, etc.).

### 5.1 Results (the school does NOT use Assessment Plan/Result — never build on those)

- **`Student Term Subject Result`** (submittable; one row per student × subject × exam × term):
  `student` (→Student), `student_name`, `academic_year` (→Academic Year), `semester` (→Academic Term), `subject` (→Course), `student_group` (→Student Group), `grade` (→Program), `exam` (→Assessment Criteria; e.g., First Test / Mid Exam / Final Exam), `score` (Float), `max_score` (Float), `percentage` (Percent), `examiner` (→Instructor).
- **`Student Term Report`** (submittable; roll-up per student per term):
  `student`, `student_name`, `academic_year`, `academic_term`, `student_group`, `term_average` (Float), `rank_in_group` (Int), `course_summary` (Table → **`Course Term Summary`**: `course`, `total_score_for_term`, `total_maximum_score`, `percentage`).
- **`Student Year Report`** (submittable; roll-up per student per year):
  `student`, `student_name`, `academic_year`, `student_group`, `year_average`, `rank_in_group`, `course_year_summary` (Table → **`Course Year Summary`**: `course`, `total_year_score`, `total_year_max_score`, `year_average_percentage`, `terms_count`).
- **`Student Assessment Score`** exists (`student`, `academic_year`, `academic_term`, `student_group`, `program`, `course`, `assessment_criteria`, `score`, `max_score`) — check with real data whether it is actively used; treat term/year reports as canonical.
- **`Appeal Result`** (grade appeals raised by parents from the student app): `student`, `student_name`, `student_group`, `academic_year`, `semester` (→Academic Term), `subject` (→Course), `exam` (Data), `original_score`, `original_max_score`, `reason`, `attachment` (Attach Image), `status` (Open/In Review/Resolved/Rejected), `resolution` (Text). Teachers review these (see 6.2.6).
- **`Report Card Generator`** (`academic_year`, `generation_mode` Single Student/Student Group/All Students, `student`, `student_group`) plus `Report Card Semester`/`Report Card Subject`/`Report Card Year`/`Report Card Course` child tables and the `Student Report Card` (Scan Me module) — the digital, QR-verifiable report card system. Inspect via MCP before wiring the leadership-facing "generate/view report cards" action.
- **Exam & grading conventions** (from the school's official guide — use as constants): per semester the exams are First Test (/15), Second Test (/15), Mid Exam (/20), Final Exam (/50). Grading scale: A+ 95–100, A 90–94, B+ 85–89, B 80–84, C 70–79, D 60–69, F below 60; passing threshold = year average ≥ 60. Use these bands for grade-letter display, marks-grid color coding, and grade-distribution charts (verify the live `exam` / Assessment Criteria values via MCP before hardcoding labels).

### 5.2 Sections, subjects, people

- **`Student Group`** (custom-modified): `academic_year`, `academic_term`, `group_based_on` (Batch/Course/Activity), `student_group_name`, `program`, `batch`, `course`, `max_strength`, `disabled`, `custom_homeroom` (Data), `custom_homeroom_teacher` (→Instructor), child `students` (**Student Group Student**: `student`, `student_name`, `group_roll_number`, `active`), child `instructors` (**Student Group Instructor**: `instructor`, `instructor_name`).
- **`Instructor`**: `instructor_name`, `employee` (→Employee), `gender`, `status` (Active/Left), `department`, `image`, **`custom_username` (→User)** — the auth link.
- **`Student`**: standard Education fields (name, gender, date_of_birth, joining_date, image, enabled…) plus customs: `custom_school_id`, `custom_government_student_id`, `custom_student_category`, `custom_mode_of_transport`, `custom_exams_taken`, `custom_reason_for_leaving_copy`, `custom_certificate_image`.
- `Program` = grade level; `Course` = subject; `Academic Year` / `Academic Term` = year/semester.

### 5.3 Timetable

- **`Period Time Block`**: `program`, `period_number` (Int), `period_label`, `from_time`, `to_time` — the bell schedule per grade/program.
- **`Course Schedule`**: `student_group`, `instructor`, `instructor_name`, `program`, `course`, `schedule_date` (Date), `room`, `from_time`, `to_time`, `title`, `color`, `class_schedule_color` — one document per actual class occurrence (dated instances, generated in bulk).
- **`Weekly Course Schedule Tool`** (+ child **`Weekly Schedule Entry`**): the weekly template per student group — each row is a period (`period_number`, `period_label`, `from_time`, `to_time`) with per-day `monday`…`sunday` (→Course) and `monday_instructor`…`sunday_instructor` (→Instructor). This is the generator; `Course Schedule` docs are the output. **Read timetables primarily from `Course Schedule`** (it reflects reschedules); use `Period Time Block` to render the period grid skeleton.
- **Holidays & events**: `Holiday List` (`holiday_list_name`, `from_date`, `to_date`, `weekly_off`, child `holidays` → **`Holiday`**: `holiday_date`, `weekly_off`, `description`) with custom child **`Holiday Student Group`** (`student_group`) scoping holidays to specific sections; core `Event` doctype for special events. The student app renders Holiday cards (e.g., "Ethiopian Christmas — Gena") and full-day Special Event cards on the schedule — render the same cards in staff timetables. Inspect how `Holiday Student Group` attaches (which parent doctype) via MCP.

### 5.4 Late / sick / leave (all submittable — handle `docstatus`, show Draft vs Submitted, use amend flow for corrections)

- **`Student Late Day`** and **`Student Late Record`**: `student`, `date`, `time`, `reason`. (Two parallel doctypes exist — inspect real data volumes via MCP to determine which is actively written this year; surface the active one for entry and both for history if both hold data.)
- **`Student Sick Day`** and **`Student Sick Record`**: `student`, `date`, `type` (Accident/Headache/Cough/Stomach ache/Fell down/Other), `details`, `parent_contacted` (Check), `parent_notes`, `action` (Treated at the nurses office/Parent not available/Improved), `leave_early` (Check), `leave_time`, `reported_by` (→User). Same duplication note as above.
- **`Student Permission Leave`**: `student`, `date`, `time`, `reason` (Sick/Family Event/Personal/Suspension/Other), `detail`, `supporting_document` (Attach Image).
- **`Student Leave Application`** (standard): `student`, `from_date`, `to_date`, `total_leave_days`, `attendance_based_on` (Student Group/Course Schedule), `student_group`, `course_schedule`, `mark_as_present`, `reason`.
- **Staff leave** (HR module, for the staff's own leave): `Leave Application` (`employee`, `leave_type`, `from_date`, `to_date`, `half_day`, `leave_approver`, `status`), `Leave Type`, `Leave Allocation` (balances). Employees see/apply for their own; `Leave Approver`/HR see their reports' applications and approve/reject via workflow actions.

### 5.5 Student records / logs

- **`Student Log`**: `student`, `type` (General/Academic/Medical/**Achievement**), `date`, `academic_year`, `academic_term`, `program`, `student_batch`, `log` (rich text). Achievements = `type = 'Achievement'`.
- **`Student Activity`**: `student`, `student_group`, `activity_type` (Club/Sport/Volunteer/Achievement/Note), `activity_date`, `reported_by`, `title`, `role`, `description`.
- **`Student Incident`** and **`Student Discipline Incident`**: `student`, `incident_date`, `status` (Open/Closed), `incident_type`, (`severity` Low/Medium/High on the Discipline one), `description`, `reported_by`, `parent_response`, `resolution`, `supporting_image`.
- **`Student Evaluation`** (staff evaluates a student; feeds the parent-facing hub): `student_group`, `students` (→Student), `class` (→Course), `reviewer`, `review_date`, ~25 Rating fields (homework, participation, tests, proficiency, attendance, discipline, maths, science, reading, writing, critical_thinking, creativity, leadership, respect, hygiene, emotional_regulation, …), behavior checkboxes (`breaking_rules`, `fight`, `incomplete_school_items`, `homework_not_done`), `achievements`, `feedback` (rich text).
- **`Student Hub Evaluation`**: like the above but with `status` (Unread/Read/Replied) and `parent_response` — an evaluation delivered to parents.

### 5.6 Feedback & messaging (visibility is the whole point — get it right)

- **`Student Feedback`** (comes FROM the student hub): `student`, `student_name`, `status` (Open/In Review/Resolved/Closed), `category`/`subcategory`/`specific_issue` (Selects populated dynamically from **`Feedback Settings`.`taxonomy_json`** / **`Feedback Taxonomy`.`taxonomy`** JSON), `details`, `attachment`. **Visible only to administrators** in this app; they triage by updating `status`.
- **`Teacher Parent Message`**: `student`, `student_group`, `teacher` (→**User**), `message_date`, `status` (Unread/Read/Responded), `subject`, `message`, `parent_response`, `parent_response_date`, `teacher_followup`, `teacher_followup_date`, plus broadcast child tables `student_groups` / `students`. **Teachers see only messages where `teacher = session.user`**; they compose new ones (to a student, or broadcast to their groups), read parent responses, and write follow-ups. Admins see all.
- **`Teacher Evaluation`** (students evaluating teachers, FROM the student hub): `student_group`, `instructors` (→Instructor), `reviewer` (→Student), `review_date`, Ratings (`respect`, `exams`, `communication_skill`, `followup`, `homework`, `knowledge`), `feedback`. **A teacher sees only aggregate stats of their own evaluations (averages per criterion, count, trend) — never the reviewer identity.** Leadership sees per-teacher aggregates across the school; raw rows visible to admins only.
- **NEW doctype to create — `Staff Feedback`** (staff → school): fields `feedback_type` (Select: Suggestion/Complaint/Facility/Academic/HR/Other), `subject` (Data), `details` (Long Text), `submitted_by` (Link User, default session user, read-only), `anonymous` (Check — when set, hide `submitted_by` in all UI), `status` (Select: Open/In Review/Resolved/Closed), `admin_notes` (Text). Permissions: any staff role can **create**; only `System Manager`/`Education Manager` can **read all**; the author can read own submissions via `if_owner` read permission. Create it via Frappe MCP with those role permissions.

### 5.7 Notifications

- **`App Notification`** (existing, used for the student hub): `title`, `status` (Draft/Sent/Failed), `sent_date`, `notification_category` (General/Academic/Announcements/Urgent/Fees/Events/Examinations), `message`, `send_to_all_students` (Check), child tables `student_groups` (**App Notification Student Group**) and `students` (**App Notification Student**). Admins compose/manage these from the app (this is how the school pushes to students/parents).
- **In-app staff notifications**: read `Notification Log` (Frappe core) for the logged-in user (`for_user = session.user`) — this gives assignment/mention/share/energy alerts for free. Render as the app's bell feed; mark read via `frappe.client.set_value` or the core method.
- **Web Push**: see Section 8. Also note `Push Notification Settings` (Integrations) and HRMS `PWA Notification` exist on the site — inspect them via MCP and prefer wiring into what's already configured before adding new infrastructure.

---

## 6. Feature Modules

Selected academic **Year** and **Term** are global context (persistent picker in the header, defaulting to the current year/term — determine "current" from `Academic Year`/`Academic Term` dates). Every list below is implicitly filtered by them where the doctype has those fields.

### 6.1 Dashboard (role-adaptive home)

- **Teacher variant**: today's schedule (their `Course Schedule` rows for today, live "now/next" highlighting using `Period Time Block` times), quick stats (groups taught, students count, unread parent responses, pending result entry), recent activity in their groups (latest logs/incidents/lates for their students), shortcuts.
- **Homeroom addition**: homeroom section snapshot — today's absents/lates/sick, term average, open incidents.
- **Leadership variant**: school-wide tiles — enrollment by program, today's late/sick counts, results distribution for the selected term, open feedback count, leave applications pending approval, teacher evaluation averages.
- **Admin addition**: feedback inbox badge, notification composer shortcut, failed `App Notification` alerts.
- Every tile deep-links into its module with filters pre-applied. Tiles render only if the underlying `can(doctype,'read')` passes.

### 6.2 Results Center (the heart of the app)

Views (all permission-scoped per Section 4.3):

1. **Section × Subject grid** ("marks sheet"): pick Student Group (+ subject auto-limited for teachers) → matrix of students (rows, ordered by `group_roll_number`) × exams (`exam` values as columns: First Test, Mid Exam, Final…) with `score`/`max_score`, computed total & percentage, color-coded bands (e.g., <50 red, 50–75 amber, >75 green — make thresholds a constant). Sticky first column, horizontal scroll on mobile, column sort, CSV export.
2. **Section overview** (homeroom/leadership): students × subjects matrix from `Student Term Report.course_summary`, plus `term_average` and `rank_in_group` columns; sortable by rank.
3. **Student detail**: one student's full result history — per-term subject breakdown, term averages, year averages (`Student Year Report`), rank trajectory, sparkline per subject across terms.
4. **Comparisons & scenarios**: subject averages across sections of the same Program (leadership), term-over-term deltas per section, top/bottom N students per group, exam-type comparison (e.g., Mid vs Final drift).
5. **Aggregation strategy**: never fetch thousands of rows to the client to compute averages. Build 2–3 small **whitelisted server methods** (or Frappe `Report`s executed via `frappe.desk.query_report.run`) for aggregates: `section_subject_matrix(group, subject, term)`, `section_overview(group, term)`, `program_comparison(program, term)`. Document them; keep raw list queries only for drill-down pages with pagination (`limit_start`/`limit_page_length`, 50/page).

### 6.3 Timetable

1. **My timetable** (teacher): week grid — periods (from `Period Time Block` of the relevant program) × days, populated from `Course Schedule` where `instructor = me` for the visible week; each cell: course, student group, room; tap → class detail (student list, jump to marks entry view for that subject/section). "Today" list view on mobile with now/next indicator.
2. **Section timetable**: pick a Student Group → its weekly grid from `Course Schedule` (fields include per-entry `color`/`class_schedule_color` — use them).
3. **Whole-school views** (leadership): by teacher (workload grid: periods/week per instructor), by room (occupancy), free-teacher finder for a given period/day.
4. Week navigation (prev/next/date-picker); reschedules show automatically since data is dated instances.

### 6.4 Attendance events: Late Days, Sick Days, Leave

- **Late days**: log a late (student picker scoped to my groups → `date` defaults today, `time` now, `reason`), submit. List/filter by section, student, date range. **Trends**: lates per weekday, repeat offenders (top N students by count this term), per-section comparison.
- **Sick days**: nurse/staff flow with the full field set (`type`, `details`, `parent_contacted`, `parent_notes`, `action`, `leave_early` + `leave_time`); `reported_by` auto-set. History per student; trends by `type` and by month.
- **Student leave**: create `Student Permission Leave` (short/partial-day, with `supporting_document` upload) and `Student Leave Application` (multi-day, `mark_as_present` option). Calendar overlay of who's on leave this week per section.
- **Staff leave (self-service)**: my `Leave Application` list + balances (`Leave Allocation` via the standard `hrms`/`erpnext` balance API — verify which is installed via MCP), apply form (leave type, dates, half-day, reason), status chips. **Approver view** (`Leave Approver`/HR): pending applications for their reports with approve/reject actions (workflow-aware: use `frappe.model.workflow.apply_workflow` if a workflow exists on the doctype — check via MCP; otherwise update `status` + submit).
- All submittable doctypes: show Draft/Submitted/Cancelled states honestly, support submit from the app when the user has `submit` permission, and use amend for corrections.

### 6.5 Student 360 profile

Reachable from anywhere a student name appears. Tabs:

- **Overview**: photo, IDs (`custom_school_id`, `custom_government_student_id`), program/section, guardians (from `Student Guardian` child table), transport mode, category.
- **Results**: the student-detail results view (6.2.3).
- **Records timeline**: merged, chronologically sorted feed of `Student Log` (badge Achievement logs with a trophy), `Student Activity`, `Student Incident` / `Student Discipline Incident` (status chips, severity), lates, sicks, leaves. Filter by record type. Staff with create rights get "+ Add log / activity / incident" here.
- **Evaluations**: `Student Evaluation` / `Student Hub Evaluation` history; create new evaluation (the big rating form — group ratings into collapsible sections: Academics, Skills, Behavior; star inputs; behavior checkboxes; feedback rich text).
- Teachers see this profile only for students in their groups.

### 6.6 Notifications management

- **Bell feed** (all staff): `Notification Log` for me, unread count, mark-read, mark-all-read.
- **Composer** (admins, `can('App Notification','create')`): create `App Notification` — title, category, message, audience (all students / pick student groups / pick students), save Draft, send (whatever server method sets it to Sent — inspect an existing Sent doc + doctype server script via MCP to find the trigger; do not invent one), resend Failed. History list with status filters.
- **Push opt-in management**: per-device subscribe/unsubscribe toggle in Settings (see Section 8).

### 6.7 Feedback & Messaging Center (visibility-critical)

Four distinct areas, each independently permission-gated:

1. **School Feedback Inbox** (admins only): `Student Feedback` (from student hub) + new `Staff Feedback` in two tabs; status triage (Open → In Review → Resolved/Closed), filters by category/status, attachment preview, taxonomy labels resolved from `Feedback Settings.taxonomy_json`.
2. **Submit Staff Feedback** (all staff): simple form → `Staff Feedback`; "my submissions" list showing status only (via `if_owner`); optional anonymous flag.
3. **Parent Messages** (teachers): inbox/sent for `Teacher Parent Message` where `teacher = me`; compose (single student or broadcast to my groups); thread view showing `message` → `parent_response` → `teacher_followup`; unread badges from `status`.
4. **Teacher Evaluations**: teacher sees own aggregates (per-criterion average stars, count, term filter, trend line — computed server-side, reviewer identity never sent to client); leadership sees a ranked table of all teachers' aggregates with drill-down; raw responses admin-only.

### 6.8 Trends & Statistics

A dedicated analytics module (leadership + admin; teachers get the subset scoped to their groups):

- **Demographics**: sex distribution (overall, per program, per section) from `Student.gender` joined through group membership; enrollment counts per program/batch; transport mode breakdown; student category breakdown; joiners/leavers over time (`joining_date`, enabled flag, `custom_reason_for_leaving_copy` breakdown).
- **Academic trends**: average percentage per subject per term (line), section performance over terms, grade distribution histograms, pass-rate by subject, year-over-year comparison.
- **Behavioral trends**: lates/sicks per month, incident counts by type/severity/status, leave patterns.
- **Engagement**: teacher evaluation averages over time; parent message response rates; feedback volume by category.
- Implement each chart on a server-side aggregate endpoint (same pattern as 6.2.5). Every chart: term/year filter, tap-to-drill-down, empty states, and skeleton loaders.

---

## 7. Permission-Driven UI — Implementation Rules

1. Build a single `PermissionsProvider` exposing `can(doctype, ptype)` (`read`/`write`/`create`/`submit`/`delete`) resolved from server probes at bootstrap, plus `roles`, `persona`, and `teachingScope`.
2. **Navigation** renders from a declarative registry: each route declares `requires: [{doctype, ptype}]` and optional `personaHint`. No permission → item absent (not disabled).
3. **Buttons/actions** (Add, Submit, Approve, Send) each check `can()`; hidden when false.
4. **Field-level**: respect Frappe's field-level permlevel where it matters (e.g., only admins see `Staff Feedback.submitted_by` when anonymous) — the server already strips fields it must; never re-add them from cached data.
5. **Live**: bootstrap re-runs on token refresh and stale focus; also catch 403s globally → toast "Your access has changed", re-run bootstrap, re-render nav.
6. Add an in-app **"View as" debug panel** for `System Manager` only, showing resolved roles/persona/scope — invaluable for verifying the matrix with the school.

---

## 8. PWA Requirements

1. **Manifest**: name "MBS Staff", short_name "MBS Staff", standalone display, portrait-primary, theme/background colors from the school brand (pick a dignified navy/gold pair; define CSS variables), maskable icons 192/512 + Apple touch icon, `id`, `start_url: /`, app shortcuts (Timetable, Results, Notifications).
2. **Service worker** (vite-plugin-pwa, `registerType: 'prompt'`):
   - Precache the app shell.
   - Runtime caching: `NetworkFirst` (fall back to cache, 24h) for GET API reads — so the timetable/results last viewed still render offline with a visible "offline — showing cached data" banner; `CacheFirst` for images/files (`/files/*`, 30 days); never cache POST/PUT or auth endpoints.
   - Update flow: when a new SW is waiting, show a "New version available — Reload" toast.
3. **Offline UX**: global online/offline indicator; mutations blocked offline with a clear message (do NOT build an offline write queue in v1 — submittable docs and permissions make replay dangerous; note it as a possible v2).
4. **Web Push notifications**:
   - Check `Push Notification Settings` and HRMS `PWA Notification` on the site via MCP first. If Frappe's push relay is configured, integrate with it. Otherwise implement standard **VAPID Web Push**: create doctype `Staff Push Subscription` (`user`, `endpoint` (unique), `p256dh`, `auth`, `device_label`, `enabled`), a whitelisted `subscribe`/`unsubscribe` method, and a small server util `notify_user(user, title, body, url)` hooked to: new `Teacher Parent Message` parent response (notify the teacher), `Leave Application` status change (notify applicant; pending → notify approver), new `Student Feedback`/`Staff Feedback` (notify admins), `App Notification` sent (optionally mirror to staff).
   - SW `push` handler shows the notification; `notificationclick` focuses/opens the deep link. Permission requested only from an explicit Settings toggle or a contextual nudge — never on first load.
5. **Installability**: custom install prompt UI (`beforeinstallprompt` on Android/desktop; instruction sheet for iOS Safari "Share → Add to Home Screen"); respect `display-mode: standalone` to hide the prompt once installed.
6. **iOS caveats**: web push requires iOS 16.4+ and installed-to-home-screen; degrade gracefully to the in-app bell feed.

---

## 9. UI / UX & Responsiveness

- **Mobile-first**; breakpoints: bottom tab bar (5 items: Home, Timetable, Results, Students, More) below `md`; collapsible sidebar + top bar at `md+`; content max-width 1280px on desktop with data-dense tables.
- Wide tables (marks grids, timetables) live in `overflow-x-auto` containers with sticky headers and sticky first column; page body never scrolls horizontally.
- **Dark mode**: class-based Tailwind dark theme, toggle + system default, persisted.
- Skeleton loaders for every list/grid; friendly empty states with the action to fill them; error states with retry.
- Pull-to-refresh feel via a refresh button that revalidates SWR keys; optimistic UI for status toggles (mark read, triage status).
- Accessibility: semantic landmarks, focus-visible rings, 44px touch targets, labels on all inputs, contrast-checked palette in both themes.
- All destructive/irreversible actions (submit, cancel, send notification) get a confirm dialog stating consequences ("Submitting locks this record").
- Numbers formatting: percentages 1 decimal; scores as stored; ranks with ordinal suffix.

---

## 10. Working Method (how you, Claude, should execute)

1. **Recon first**: with the Frappe MCP, re-verify every doctype in Section 5 (`get_doctype_info`), sample real documents, list `Academic Year`/`Academic Term` records to learn the current year/term naming, count rows in the Late/Sick "Day" vs "Record" twins to pick the active ones, and inspect `Feedback Settings.taxonomy_json` shape. Write findings to `docs/DATA_NOTES.md`.
2. **Scaffold**: Vite + TS + Tailwind + shadcn + vite-plugin-pwa + frappe-react-sdk; env-driven `VITE_FRAPPE_URL`, `VITE_OAUTH_CLIENT_ID`.
3. **Auth vertical slice**: OAuth PKCE login → bootstrap → identity chain → permissions provider → role-adaptive empty dashboard. Prove the teacher scope resolution against real data (log the resolved TeachingScope for a known instructor).
4. **Modules in order**: Timetable → Results Center → Late/Sick/Leave → Student 360 → Notifications → Feedback Center → Statistics → Dashboard tiles last (they reuse everything).
5. **Server artifacts**: keep every whitelisted method / new doctype / permission config you need in `server/` as documented Frappe fixtures or a small custom app spec, with an install guide — the site admin must be able to apply them; also create the new doctypes (`Staff Feedback`, `Staff Push Subscription` if needed) via MCP on the site when instructed.
6. **Testing**: unit-test the permission mapper and scope resolver; component-test the marks grid math (totals, percentages, banding); e2e-smoke the login redirect handling with a mocked token endpoint. Add `npm run typecheck && npm run lint && npm run test` and keep them green.
7. **Docs**: `README.md` (setup, OAuth client creation on the Frappe site, env vars, deploy), `docs/PERMISSIONS.md` (the persona/visibility matrix as implemented, plus required Frappe-side role permission & user-permission configuration), `docs/DATA_NOTES.md`, `SECURITY_NOTES.md`.
8. Commit in coherent feature-sized commits.

## 11. Definition of Done

- Lighthouse PWA audit passes (installable, SW, manifest, offline start).
- A user with only the `Instructor` role: sees exactly their groups/subjects everywhere, cannot navigate or deep-link into other sections' results (server returns 403 and the app handles it gracefully), sees their own timetable and parent messages, sees own evaluation aggregates without reviewer identities.
- A `System Manager`: sees everything including both feedback inboxes and the notification composer.
- Revoking a role in Frappe changes what the same logged-in user can see after refresh, with zero code changes.
- Works and looks right at 360px, 768px, 1024px, 1440px; both themes; keyboard navigable.
- No fieldname in the code that doesn't exist on the live site.
