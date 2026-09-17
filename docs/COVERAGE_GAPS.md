# What teachers and homerooms still can't do in the app

Compiled 2026-09-17 by diffing every doctype the `Instructor`, `Academics User`, `Director` and `Education Manager` roles can touch against what the app actually uses, then filtering to doctypes that hold real data. Ordered by how often it would bite someone in a normal week.

---

## 1. Finish what they started — the follow-up half is missing

The app lets a teacher **open** things but never **close** them. Every one of these is a record a teacher creates today with no way to resolve it.

| Gap | Where it stalls |
|---|---|
| **Resolve a discipline incident** | A teacher can file a `Student Discipline Incident`, but `resolution`, `parent_response` and moving `status` to Closed are desk-only. Incidents accumulate as Open forever. |
| **Resolve a `Student Incident`** | Same, and there are two incident doctypes with overlapping purpose — worth deciding which is canonical. |
| **Approve a student leave application** | `Student Leave Application` is read-only in the app. A homeroom teacher can see a parent's request and do nothing about it. `custom_status` (Pending/Approved) is the field; approving in-app is a small change with real daily value. |
| **Amend a submitted attendance record** | Submitted records show "saved" and are locked. Correcting yesterday's mistake means the desk. Frappe's cancel+amend could be exposed for the homeroom teacher's own section. |

**This is the highest-value cluster.** It's not new features so much as completing loops the app already opens.

## 2. Guardian contact details

The student profile lists guardian *names* but no phone number or email. `Guardian` holds **8,601** records with contact fields. A homeroom teacher's single most common task — ring a parent about an absence — sends them out of the app. Worth adding to the Student 360 overview, read-only, for guardians of their own students.

## 3. Report cards

**3,350 `Student Report Card` records exist**, plus `Report Card Generator`. This is the school's QR-verifiable report card system and the app doesn't touch it at all. A homeroom teacher can't view, download or share their section's report cards. Currently `Academics User` only, so it needs an Instructor grant scoped to their own students.

## 4. Attendance insight, not just attendance entry

The app records attendance well now but answers no questions about it:

- "How many days has this student missed this term?" — no per-student attendance summary anywhere.
- "Who in my section is trending badly?" — no section attendance overview.
- "Which days am I missing a register for?" — no completeness check, so a forgotten day is invisible.

Given day-based registers now write `Student Attendance` consistently, all three are straightforward aggregations.

## 5. Marks entry at realistic speed

Results are viewable and editable in principle, but there is no efficient entry path — no column-at-a-time entry, no keyboard tabbing down a class list, no "enter Final Exam for all 53 students". `Bulk Score Entry` exists on the site (4 rows, admin-created, last touched June 2025) and may have been an attempt at this. Entering 53 × 4 exams one cell at a time on a phone is the kind of thing that sends teachers back to paper.

## 6. Cover and substitution

No way to see that you're covering someone's class, and no way to mark a lesson as not taught. `Course Schedule` has `instructor` but nothing models a substitution. Teachers currently learn about cover by being told in the corridor.

## 7. Things a homeroom teacher owns that the app ignores

- **Roster management** — add or remove a student from their section, set roll numbers. `Student Group` is read-only for Instructors by design; this may be correct, but it means roll-number fixes are a desk task.
- **`Not Promoted Student`** (188 rows) and **`Suspended Student Log`** (22 rows) — both carry real data and neither is surfaced. A homeroom teacher arguably should see that a student in their section is flagged.
- **Section-targeted announcements** — teachers can now only read broadcasts. A homeroom teacher messaging just their own parents has to do it one thread at a time through `Teacher Parent Message`.

## 8. Tasks and assignments

`ToDo` has **22 rows and the `Instructor` role has write access** — Frappe's assignment mechanism is in use, so someone is assigning work to teachers. The app never shows it, so those assignments are invisible unless the teacher opens the desk.

## 9. Still outstanding from earlier decisions

- **Staff Feedback** — the staff→school channel. Still not created; awaiting your go-ahead.
- **Web push** — service worker handlers ship, but VAPID keys and a Frappe send hook don't exist. Every notification is in-app only.
- **`Student Incident` vs `Student Discipline Incident`** — two doctypes, overlapping purpose, both live. Needs a decision.
- **The evaluation catalogue** — `docs/EVALUATION_PROPOSAL.md`, five questions pending.

---

## Explicitly *not* gaps

Checked and dismissed, so nobody re-opens them:

- `Quiz`, `Question`, `Topic`, `Article`, `Course Activity`, `Quiz Activity` — the LMS module. **All zero rows.** Not in use.
- `Assessment Plan`, `Assessment Result`, `Student Assessment Score` — **all zero rows**, consistent with `SPEC.md`'s note that the school does not use the assessment module.
- `Student Log` — dropped at your instruction; no longer read or written.
- `Fees`, `Fee Structure`, `Program Enrollment`, `Student Applicant`, `Guardian` (write), `User` — finance, admissions and registry work. Teachers held write access on these only through `Academics User`, which has now been removed from them. Correctly out of scope.

---

## If I were picking three

1. **Close the loops** (§1) — resolve incidents, approve leave. Teachers already create these; leaving them unresolvable makes the app feel half-built.
2. **Guardian phone numbers** (§2) — smallest change, largest daily payoff for a homeroom teacher.
3. **Attendance summaries** (§4) — the data is now being captured properly, so this is the first thing that turns entry into insight.
