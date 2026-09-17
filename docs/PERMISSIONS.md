# Permission model — MBS Staff PWA

Rebuilt 2026-09-17 and **applied to the live site**. This supersedes the earlier version, which described client-side personas only.

The app renders from role flags; **the Frappe server decides what any request actually returns.** Roles and scope are re-read on window focus (≤60s stale), so a permission change in Frappe reaches a signed-in user without a redeploy.

---

## What changed and why

Three problems made the original model meaningless against real data.

**1. `Academics User` was treated as leadership.** 148 accounts hold it, including essentially all 145 teachers — so every teacher resolved as leadership and saw all 85 sections, every appeal, school-wide search and the broadcast composer. It is no longer a leadership role in the app, and it has been removed from teachers on the site.

**2. The `Instructor` role itself was over-permissive.** Frappe unions roles, so adding permissions elsewhere changed nothing while `Instructor` still granted delete on term/year reports and on every teacher's parent messages. The role was reshaped in place rather than replaced.

**3. Three doctypes were locked to everyone.** `Student Late Day`, `Student Sick Day` and `Student Incident` each had exactly one effective permission row — Scholarship Supervisor, read-only. When the Scholarship customization added Custom DocPerm rows, Frappe stopped honouring the standard permissions entirely (custom overrides standard wholesale; it does not merge), silently revoking Director, Instructor and System Manager. Repaired.

> **The trap, for anyone editing permissions here:** adding a single Custom DocPerm row to a doctype that has none disables *all* its standard permissions. Always rebuild the full set. Check what is actually in force with `frappe.get_meta(dt).permissions`, never the raw `tabDocPerm`.

---

## Personas

| Persona | Granted by | Adds |
|---|---|---|
| Teacher | `Instructor` role, plus an `Instructor` record linked by `custom_username` | Timetable, register, marks for taught pairs, own parent messages, own evaluation aggregates, records for own students |
| Homeroom teacher | Teacher + `Student Group.custom_homeroom_teacher` = them | Whole-section results for that group; **sole right to create late / sick / permission records** |
| Leadership | `Director`, `Education Manager`, `System Manager`, `DD Student Registrar` | All sections and results, analytics, per-teacher evaluations |
| Admin | `System Manager` or `Education Manager` | Feedback inbox, all parent messages, **grade appeals** |
| Broadcast | `System Manager`, `Education Manager`, `Director` | Compose `App Notification` |
| HR | `HR Manager`, `HR User`, `Leave Approver` | Staff leave queue |
| Employee | linked `Employee` record | Apply for own leave |

`Academics User` is **not** a persona. It remains on 17 leadership accounts, 8 unlinked teachers, 6 non-teaching staff and one HR account, where it is doing legitimate work.

---

## The `Instructor` role as it now stands

| Doctype | read | write | create | delete | submit |
|---|---|---|---|---|---|
| Student Term Subject Result | ✓ | **—** | **—** | — | — |
| Result Correction Request | ✓ (own) | ✓ (own) | ✓ | — | — |
| Student Term Report / Year Report | ✓ | — | — | — | — |
| Student, Student Group, Instructor, Course, Program, Room, Holiday List, Academic Year / Term | ✓ | — | — | — | — |
| Course Schedule | ✓ | — | — | — | — |
| Student Attendance | ✓ | ✓ | ✓ | — | ✓ (no cancel, no amend) |
| Student Late Day / Sick Day / Permission Leave | ✓ | ✓ | ✓ | — | ✓ |
| Student Leave Application | ✓ | **✓ (status only, homeroom)** | — | — | — |
| Student Activity / Discipline Incident | ✓ | ✓ | ✓ | — | — |
| Lesson Plan | ✓ | ✓ | ✓ | — | — |
| ToDo | ✓ | **✓ (status only, own)** | **—** | — | — |
| Staff Feedback | ✓ (own) | ✓ (own) | ✓ | — | — |
| Student Evaluation / Student Hub Evaluation | ✓ (own) | ✓ | ✓ | — | — |
| Teacher Parent Message | ✓ | ✓ | ✓ | **—** | — |
| Teacher Evaluation | ✓ | — | — | — | — |
| App Notification | ✓ | — | — | — | — |
| Appeal Result, Student Feedback, Student Incident | *no permission* | | | | |

Revoked wholesale: `Quiz`, `Question`, `Topic`, `Article`, `Course Activity`, `Bulk Score Entry`, `Student Score`, `Assessment Log Entry`, `Assessment Plan/Result`, `Student Assessment Score` — all verified empty or admin-only before removal.

**No delete anywhere**, including on a teacher's own parent messages.

---

## Row-level scoping

Permission Query server scripts, all prefixed `MBS - `. Each follows the site's house pattern: compute roles, set `conditions` only for a scoped teacher, otherwise leave it empty — so multiple scripts on one doctype AND together cleanly, including the pre-existing Scholarship Supervisor filters.

A user is scoped only when they hold `Instructor` and **none** of `System Manager`, `Education Manager`, `Director`, `Academics User`, `DD Student Registrar`.

| Script | Scope |
|---|---|
| `MBS - Student Scope` | Students in sections they teach or are homeroom of |
| `MBS - Term Subject Result Scope` | `examiner` = them, OR their homeroom section, OR a (course, group) pair they teach per Course Schedule |
| `MBS - Parent Message Scope` | `teacher` = session user — keyed on the field, not `owner`, so messages filed on their behalf still reach them |
| `MBS - Teacher Evaluation Scope` | `instructors` = their own Instructor record |
| `MBS - Student Late Day / Sick Day / Incident Scope` | Students in their own sections |
| `MBS - Student Discipline Incident Scope` | Students in their own sections |
| `MBS - Student Leave Application Scope` | Students in their own sections |
| `MBS - Lesson Plan Scope` | `instructor` = them, OR a section they teach or are homeroom of |

Verified against a real teacher: Abel Tadesse resolves to 4 groups, 191 students of 3,378, and 4,065 marks of 202,262.

### Reviewer anonymity

`Teacher Evaluation.reviewer` is at **permlevel 1** via Property Setter, readable only by System Manager and Education Manager. A teacher can read their own ratings without ever seeing who submitted them — enforced by the field's permission level, not by the client omitting a column.

### Homeroom-only writes

Permission queries scope reads, not writes. Creating or modifying `Student Late Day`, `Student Sick Day` and `Student Permission Leave` is gated by **Before Save** server scripts (`MBS - … Homeroom Guard`) that reject anyone who is not the homeroom teacher of that student's section, leadership excepted. The app hides the corresponding controls to match, so the guard is a backstop rather than the first thing a teacher meets.

### Write guards on the newer flows

Frappe's permission model is per-doctype, not per-field, so anything of the form "may change *this* field and nothing else" is a Before Save script. All follow the same shape: work out whether the actor is a plain `Instructor`, and if so compare the incoming doc against what is stored.

| Script | What it enforces |
|---|---|
| `MBS - Leave Application Homeroom Guard` | Teachers cannot create a leave request, and may change only `custom_status` — the parent's own words are immutable. Must be homeroom of that student's section. |
| `MBS - Discipline Incident Guard` | May only file or resolve incidents for students in sections they teach; stamps `reported_by`. |
| `MBS - ToDo Instructor Guard` | Cannot create a ToDo; may change only `status`, and only on a task allocated to them. |
| `MBS - Result Correction Guard` | Forces `requested_by` and `status: Open` on creation; must teach the section; the request locks once a reviewer moves it off Open. Stamps `reviewed_by` / `reviewed_on` for reviewers. |
| `MBS - Staff Feedback Guard` | Staff cannot set their own status or write their own response; stamps `responded_by`. |
| `MBS - Lesson Plan Guard` | Only for sections they teach, only under their own name; computes `coverage` from the objectives table so the number is never hand-entered. |

### Attendance: submit locks, only the Director reopens

`Instructor` holds `submit` on `Student Attendance` but **not `cancel` or `amend`**, so a submitted register is final for the teacher who took it. A `Director` row was added carrying `cancel` and `amend`; the app surfaces this as a *Reopen* button on submitted rows, visible only to them. Correcting a submitted day is therefore cancel-and-re-enter, which leaves the original in the record as a cancelled document rather than overwriting it.

The same reasoning applies to marks: `Instructor` write and create on `Student Term Subject Result` were **revoked**, making teachers read-only on results. A teacher who spots a wrong score raises a `Result Correction Request`; applying it cancels the submitted row and enters a replacement linked by `amended_from`, which only Education Manager and System Manager can do.

---

## Doctypes added for the app

Created 2026-09-17, module `Education`, all `custom: 1`.

| Doctype | Purpose |
|---|---|
| `Result Correction Request` | A teacher's request to change a submitted mark. Fetches student, section, subject, exam and the recorded score straight off the `Student Term Subject Result` it points at, so nothing is retyped. |
| `Lesson Plan` + `Lesson Plan Objective` | One plan per lesson, with an objectives table carrying an outcome and a carry-forward flag. |
| `Staff Feedback` | The staff→school channel, mirroring the existing `Student Feedback`. |
| `Teacher Parent Message Entry` | Child table (`custom_conversation`) that turns the one-message-one-reply doctype into a thread without breaking the three fields the parents' app reads. |

---

## Still outstanding

- Permission Query scripts not yet written for: `Student Group`, `Course Schedule`, `Student Attendance`, `Student Term Report`, `Student Year Report`, `Student Permission Leave`, `Student Activity`. Reads on these are currently unscoped for teachers.
- `Appeal Result.student_group` is NULL on all 136 rows, and `original_max_score` is 0 on all of them. The new `Result Correction Request` avoids the same trap by fetching both from the linked result row rather than storing a copy.
- `Student Incident` and `Student Discipline Incident` both still exist on the site. The app reads and writes **only** `Student Discipline Incident`; nothing has been migrated off the other, and `Instructor` has no permission on it.
