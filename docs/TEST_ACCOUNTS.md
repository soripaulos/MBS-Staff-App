# Test accounts, roles & live-data reconnaissance

Everything here was read from the live site (`app.makkobillischool.com`) on **2026-09-17** via the Frappe MCP. Re-verify before relying on it months from now.

**No passwords are listed and none can be retrieved** — Frappe stores them hashed. Set your own on the accounts in the shortlist below; see *Setting up the test logins* at the end of this document.

**Choose dormant accounts.** These are real staff accounts. Changing the password on one that is in active use locks that person out of their own account until they reset it. The shortlist below deliberately favours accounts that have **never been logged into**, and notes the last-login date for each.

---

## ⛔ Read this before you test anything

Four findings will make the app look broken if you don't know about them. Two are blockers.

### 1. BLOCKER — you cannot sign in from localhost

OAuth Client `ci3eeqp3lv` ("MBS Staff PWA") has exactly two redirect URIs registered:

```
https://staff.makkobillischool.com/oauth/callback
https://mbs-staff-app.pages.dev/oauth/callback
```

`http://localhost:5173/oauth/callback` is **not** registered, so `npm run dev` sign-in fails with a redirect-URI mismatch. (An earlier draft of the README claimed it was registered — that was wrong and is now corrected.)

**Fix before testing**: desk → OAuth Client → `ci3eeqp3lv` → add `http://localhost:5173/oauth/callback` to Redirect URIs. Or deploy to `mbs-staff-app.pages.dev` and test there.

### 2. BLOCKER — the app defaults to an academic year that has no data

| Academic Year | Dates | Active groups | Subject results |
|---|---|---|---|
| **2019 E.C.** | 2026-09-01 → 2027-07-30 | **0** | **0** |
| **2018 E.C.** | 2025-09-29 → 2026-07-03 | 85 | 202,262 |

`AcademicProvider` picks "the year containing today". Today is 2026-09-17, so it picks **2019 E.C.** — which is completely empty. **Every page will render empty for every user on first load.**

**Workaround while testing**: switch the year dropdown in the header to **2018 E.C.** immediately after signing in. The choice persists in `localStorage`, so you only do it once per browser.

This is a real product bug, not just a testing nuisance: on the first day of the new school year every member of staff will open the app and see nothing. The provider should fall back to the most recent year that actually has data.

Terms, both under 2018 E.C.:
- `2018 E.C. (First Semester)` — 2025-09-29 → 2026-02-08 — 101,744 results, 3,345 term reports
- `2018 E.C. (Second Semester)` — 2026-02-09 → 2026-07-03 — 100,518 results, 3,297 term reports

### 3. The timetable and "Today's classes" will be empty

`Course Schedule` has 19,070 rows but **zero dated after 2026-06-30**. Nothing is scheduled for the current week. To test the timetable, navigate back to a week in **May or June 2026**.

This also puts the scope resolver's 120-day window on a clock: the cutoff is currently 2026-05-20 and the last class was 2026-06-30, so `subjectPairs` still resolves — but **on 2026-10-28 that window closes and every teacher's subject list goes empty** unless schedules are generated for 2019 E.C. See `HANDOVER.md` §5.

### 4. The persona model does not discriminate on real data

This is the most important finding of the whole exercise.

```
Academics User    148 users     ← isLeadership, isAcademicAdmin, canBroadcast
Instructor        145 users
Employee          131
Education Manager  17           ← isLeadership, isAdmin
Director           16           ← isLeadership
HR Manager / User   7 / 7       ← isHR
Leave Approver      2
System Manager      2           ← isLeadership, isAdmin
```

`SessionProvider` treats **`Academics User` as a leadership role**. Essentially every one of the 145 teachers also holds `Academics User`. So in practice:

- **every teacher resolves to `isLeadership: true`**
- every teacher sees all 85 sections, every appeal, school-wide student search, the analytics nav item, the per-teacher evaluation table, and the broadcast composer
- **the teacher/leadership distinction the app is built around does not exist against real data**

You cannot meaningfully test teacher scoping until this is resolved. Options: drop `Academics User` from `LEADERSHIP_ROLES`/`BROADCAST_ROLES` in `src/providers/SessionProvider.tsx` (leaving Director / Education Manager / System Manager as leadership), or strip the role from teachers on the site. The first is a one-line code change; the second is a production data change affecting 148 accounts.

---

## Recommended test accounts

Every account below is **enabled**, `System User` type. "Instructor rec." means an `Instructor` doctype record linked by `custom_username` — without one, the app resolves no teaching scope at all.

### ⭐ Start here — the single best teacher account

| | |
|---|---|
| **Email** | `abel.tadesse@m.b.s` |
| **Name** | Abel Tadesse T/Hawariat |
| **Roles** | Academics User, Employee, Instructor |
| **Instructor rec.** | ✅ `Abel Tadesse T/Hawariat` |
| **Employee** | ✅ HR-EMP-00156 (Active) |
| **Homeroom** | ✅ **Grade 4 C** — 53 active students |
| **Teaches** | Maths in Grade 4 C, Grade 7 B, Grade 7 C, Grade 7 D (4 pairs, 300 sessions) |
| **Results data** | 344–416 result rows per pair |

The only account that exercises teacher scope, homeroom scope, and staff leave all at once. Last logged in 2026-02-18.

### Teachers with wide scope

| Email | Instructor rec. | Groups | Pairs (120d) | Teaches | Notes |
|---|---|---|---|---|---|
| `adanu.teklu@m.b.s` | ✅ | 11 | 11 | Physical Education, Grades 1–2 | Widest scope; good for "many sections" UI stress |
| `roza.abreham@m.b.s` | ✅ | 11 | 11 | Art (Gr 1/2/4) + PE AO | 381 sessions, results on every pair |
| `mustehamsi506@gmail.com` | ✅ | 10 | 10 | — | Also has 4 teacher evaluations |
| `kumegaruma@gmail.com` | ✅ | 5 | 5 | English, Grade 1 D–H | Logged in recently (2026-08-26) |
| `teferi.woldeyes@m.b.s` | ✅ | 9 | 9 | — | 433 sessions |

### Edge-case teacher — homeroom but zero schedule

| | |
|---|---|
| **Email** | `dagim.tahir@m.b.s` |
| **Instructor rec.** | ✅ `Dagim Tahir Mohammed` · Employee HR-EMP-00125 |
| **Homeroom** | ✅ **Grade 12 A** — 46 students |
| **Groups taught** | 4 |
| **Course Schedule rows** | **0** |

Use this to test the **empty-`subjectPairs` path**: homeroom features should work, "My timetable" and "Today's classes" should be empty, and the Results subject dropdown should be empty for non-homeroom groups. This is exactly the state every teacher will be in after 2026-10-28. Also carries 3 teacher evaluations (all rated 1.0).

### Teachers with evaluation data (for `/evaluations`)

130 `Teacher Evaluation` rows exist. Ratings are stored 0–1, confirmed (`0.111`, `0.82`, `1.0`) — so `ratingToStars` ×5 is correct.

| Email | Reviews | Avg respect | Avg knowledge |
|---|---|---|---|
| `seifudesta84@gmail.com` | 9 | 0.111 | 0.156 | ← lowest-rated, good for band colors |
| `yishurunabdu@gmail.com` | 5 | 0.82 | 0.80 |
| `kedirkemal86@gmail.com` | 5 | 0.28 | 0.38 |
| `hayimanot.andualem@m.b.s` | 4 | 0.825 | 0.90 | ← has Instructor rec. + 2 pairs |
| `afomiyagirmachew@gmail.com` | 3 | 0.967 | 0.967 | ← near-perfect, tests the top band |

### Directors / leadership

**None of these have an `Instructor` record**, so `session.instructor` is null even though they hold the `Instructor` role. Expect: no "My timetable" tab, no "Today's classes" card, teacher dashboard tiles showing 0 — while leadership features are fully available. That is a legitimate and important state to test.

| Email | Name | Roles | Employee | Last login |
|---|---|---|---|---|
| `muktar.abdulkerim@m.b.s` | Muktar Abdulkerim | Academics User, **Director**, **Education Manager**, Insights User, Instructor | ✅ HR-EMP-00096 | 2026-09-14 |
| `abdi.yonas@m.b.s` | Abdi Yonas | same | ✅ HR-EMP-00100 | 2026-09-04 |
| `engidawork.gebru@m.b.s` | Engidawork Gebru | same | ✅ HR-EMP-00097 | 2026-08-30 |
| `tolera.negassa@m.b.s` | Tolera Negassa | same | ❌ none | 2026-08-22 |
| `eyerusalem.yisfalem@m.b.s` | Eyerusalem Yisfalem | same | ❌ none | 2026-07-20 |

`tolera.negassa@m.b.s` is useful specifically because it has **no Employee record** — `/leave` should show "No employee record linked" and the Apply button should be hidden.

### HR

| Email | Roles | Employee | What it tests |
|---|---|---|---|
| `sintayehu@m.b.s` | Academics User, Accountant, Accounts Mgr/User, **HR Manager**, **HR User** | ❌ none | HR pending queue **without** being able to apply — and note: no Instructor role, so no teacher nav at all |
| `wubetmekasha21@gmail.com` | Academics User, **HR Manager**, **HR User**, Education Manager, Analytics, Instructor, Employee | ✅ HR-EMP-00224 | Both apply-for-leave and the pending queue |

### Full admin

| Email | Notes |
|---|---|
| `makkobillischool@gmail.com` | Your own account — **System Manager** + 60-odd roles. Sees everything including the Feedback inbox. Employee HR-EMP-00095, no Instructor record. Also the only account with `Teacher Parent Message` threads (all 4). |
| `natnaelabula6@gmail.com` | Director, Education Manager, HR Manager/User, ICT Technician, System User, Employee ✅ — a broad non-System-Manager admin |

### Minimal-access account ⭐ for negative testing

| | |
|---|---|
| **Email** | `felma8899@gmail.com` |
| **Name** | Felma Degefa |
| **Roles** | Insights User, **Scholarship Supervisor** — that's all |
| **Instructor rec.** | ❌ |
| **Employee** | ❌ |

The best account for testing the locked-down path: no teacher flags, no leadership, no HR, no employee. Should see Home / Timetable / Notifications / More and nothing else, with graceful empty states rather than errors. Watch the Network tab — `SessionProvider` swallows 403s silently, so permission failures look identical to "no data".

---

## Data available for each feature

| Feature | Live data | Testing notes |
|---|---|---|
| **Results — marks grid** | 202,262 `Student Term Subject Result` rows | Plenty. Use 2018 E.C. + either semester. |
| **Results — section overview** | 6,642 `Student Term Report` | Good coverage both terms. |
| **Results — year** | 3,349 `Student Year Report` | Available. |
| **Appeals** | 136 rows — 78 Open, 6 In Review, 33 Resolved, 19 Rejected | ⚠ see two bugs below |
| **Student feedback** | 48 rows — 46 Open, 2 In Review | Admin-only tab; good triage data. |
| **Broadcasts** | 23 `App Notification` — 11 Sent, 11 Draft, 1 Failed | Covers all three status badges. |
| **Parent messages** | **only 4 rows**, all `Responded`, all owned by `makkobillischool@gmail.com` | Any other account sees an empty list. Compose a new one to test properly. |
| **Teacher evaluations** | 130 rows across ~20 instructors | Good. Ratings confirmed 0–1. |
| **Attendance (taking)** | 4,001 `Student Attendance` | Fine — but you must pick a schedule dated ≤ 2026-06-30. |
| **Late / sick / permission** | Late Day **3**, Sick Day **5**, Permission **2** | ⚠ almost nothing; create records to test. |
| **Student leave applications** | — | Check before relying on it. |
| **Staff leave** | **0 `Leave Application` rows** | Empty for everyone. Must create one to test. |
| **Analytics** | Term reports + gender data present | Late/sick charts will be nearly empty (8 records total). |
| **Students / rosters** | 85 active groups, 3,444 students | Plenty. |

### Two appeal bugs found in the data

Both would have looked like app bugs during testing:

1. **`student_group` is NULL on all 136 appeals.** The teacher-scoping filter in `ResultsPage.tsx` builds the key `` `${r.subject}::${r.student_group}` `` and matches it against the teacher's pairs — with a null group this **never matches, so a non-leadership teacher sees zero appeals, always**. Currently masked by finding #4 (everyone is leadership). Fix the filter to fall back to subject-only matching, or populate `student_group` on the doctype.
2. **`original_max_score` is `0.0` on every row.** The appeal card renders "score 13/0". Cosmetic, but visible on the first screen a teacher opens.

### The twin-doctype question is still open

`HANDOVER.md` §11.8 flagged this. Live counts:

| | rows | | rows |
|---|---|---|---|
| `Student Late Day` | 3 | `Student Late Record` | 4 |
| `Student Sick Day` | 5 | `Student Sick Record` | 4 |

**Both are populated and both are tiny.** The row counts do not settle which is canonical — this needs a human answer from whoever runs the front desk. The app currently reads the **`Day`** variants only, so if `Record` is the live one, Attendance history, the student timeline and the Analytics late/sick charts are all reading the wrong table.

### Identity-chain coverage gap

- `Instructor` records: **106**, all 106 have `custom_username` populated ✅ (the primary auth link is healthy)
- Users holding the `Instructor` role: **145**

So **~39 users have the Instructor role but no Instructor record.** They resolve to `isTeacher: true` (via the role) with `instructor: null`, meaning no timetable, no scope, empty teacher tiles. All the directors listed above are in this group. The `Employee.user_id` fallback won't rescue them either, since no Instructor record points at their Employee.

- Active homeroom assignments: **only 2** (Grade 12 A → Dagim Tahir, Grade 4 C → Abel Tadesse). Homeroom is testable but barely represented.

---

## Suggested testing sequence

1. **Add the localhost redirect URI** (or deploy to Pages). Nothing works before this.
2. Set a shared password on: `abel.tadesse@m.b.s`, `muktar.abdulkerim@m.b.s`, `felma8899@gmail.com`, `sintayehu@m.b.s`.
3. Sign in as **`abel.tadesse@m.b.s`** → immediately switch year to **2018 E.C.** → log the resolved scope and check it against the table above (4 Maths pairs, homeroom Grade 4 C). This is the scope-resolver verification from `HANDOVER.md` §12.1.
4. Walk Results / Students / Attendance as that teacher. Timetable: navigate back to a June 2026 week.
5. Sign in as **`muktar.abdulkerim@m.b.s`** (Director, no Instructor record) — confirm leadership features appear and teacher-specific ones degrade cleanly.
6. Sign in as **`felma8899@gmail.com`** — confirm the minimal-access path shows empty states, not errors. Keep DevTools open.
7. Sign in as **`sintayehu@m.b.s`** — HR queue visible, Apply hidden.
8. Only after finding #4 is resolved is it worth re-running steps 3–5 to check the teacher/leadership boundary properly.

---

## Setting up the test logins

### The shortlist — six accounts, one shared password

Chosen for role coverage **and** dormancy. Four of the six have never been logged into, so changing their password inconveniences nobody.

| # | Account | Persona | Last login | Why this one |
|---|---|---|---|---|
| 1 | `abel.tadesse@m.b.s` | Teacher **+ homeroom** | 2026-02-18 | The only account combining a real Instructor record, 4 taught pairs with results, homeroom Grade 4 C (53 students) and an Employee record. Non-negotiable. |
| 2 | `adanu.teklu@m.b.s` | Wide-scope teacher | **never** | 11 groups / 11 pairs (PE, Grades 1–2), results on every pair |
| 3 | `dagim.tahir@m.b.s` | Teacher, **empty schedule** | 2026-03-21 | Homeroom Grade 12 A but zero Course Schedule rows — the empty-`subjectPairs` path |
| 4 | `girma.gadissa@m.b.s` | **Director** + Education Manager | **never** | Employee ✓, no Instructor record — leadership view with teacher features degraded |
| 5 | `haji.ketema@m.b.s` | **Director**, no Employee | **never** | Same roles as #4 but no Employee record — `/leave` should say "No employee record linked" |
| 6 | `felma8899@gmail.com` | **Minimal access** | 2026-03-05 | Insights User + Scholarship Supervisor only — the negative test |

**Swaps made from the earlier draft, and why:** `muktar.abdulkerim@m.b.s` (signed in 2026-09-14), `abdi.yonas@m.b.s` (2026-09-04) and `tolera.negassa@m.b.s` (2026-08-22) are all in active use. `girma.gadissa@m.b.s` and `haji.ketema@m.b.s` carry the identical role set (Academics User, Director, Education Manager, Insights User, Instructor) and have never signed in, so they test the same thing without locking anyone out.

### HR and System Manager — use your own account

Do **not** change `sintayehu@m.b.s` or `wubetmekasha21@gmail.com`; both are actively used, and all seven HR-role holders signed in within the last few weeks. You don't need them: `makkobillischool@gmail.com` already holds **HR Manager, HR User, Leave Approver, System Manager, Director and Education Manager**, which covers the HR queue, the feedback inbox, broadcasts and full leadership in one account you already have the password for.

### Suggested password

```
MbsStaff-Test-2026!
```

19 characters, mixed case, digit and symbol — passes Frappe's default policy. Change it if you prefer; just keep it uniform across the six so you can switch personas quickly.

### How to set it

**Preferred — bench console** (no notification emails, writes straight to `__Auth`):

```bash
bench --site app.makkobillischool.com console
```
```python
from frappe.utils.password import update_password
for u in [
    "abel.tadesse@m.b.s",
    "adanu.teklu@m.b.s",
    "dagim.tahir@m.b.s",
    "girma.gadissa@m.b.s",
    "haji.ketema@m.b.s",
    "felma8899@gmail.com",
]:
    update_password(u, "MbsStaff-Test-2026!")
frappe.db.commit()
```

**Or from the desk**: User list → open each account → Settings section → **Set New Password** → Save. Depending on your Frappe version this may queue a "password updated" notification to the account holder — watch the Email Queue if that matters, particularly for `felma8899@gmail.com`, which is a personal Gmail address.

### Afterwards

These are Director- and Education-Manager-level accounts with read access to 3,444 students' records, and they will all share one password for the duration of testing. When you're done, rotate them: either set fresh random passwords, or disable the accounts that were dormant to begin with (#2, #4, #5 had never been used). Don't leave the shared credential live.

---

## Cross-reference

- Architecture, auth flow, per-feature behaviour, full test plan → `docs/HANDOVER.md`
- Persona matrix and server-side hardening → `docs/PERMISSIONS.md`
- Verified doctype/field contract → `docs/SPEC.md` §5
