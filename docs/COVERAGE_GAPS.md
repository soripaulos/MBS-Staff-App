# What teachers and homerooms still can't do in the app

Compiled 2026-09-17 by diffing every doctype the `Instructor`, `Academics User`, `Director` and `Education Manager` roles can touch against what the app actually uses, then filtering to doctypes that hold real data. Ordered by how often it would bite someone in a normal week.

**Revised the same day**, after the batch of work described in `docs/PERMISSIONS.md`. Sections 1, 4, 8 and most of 9 are now closed; they are kept below with what was built, because the reasoning behind each is still the record of why it exists.

---

## 1. ~~Finish what they started~~ — **closed**

The app used to let a teacher **open** things but never **close** them.

| Gap | How it closed |
|---|---|
| Resolve a discipline incident | Tapping an incident on the student's Records tab opens it: write the resolution, or resolve and close. `parent_response` shows if the parent replied. |
| Two incident doctypes | Decided: `Student Discipline Incident` is canonical. The app no longer reads or writes `Student Incident`, and `Instructor` has no permission on it. |
| Approve a student leave application | The homeroom teacher of the child's section approves or rejects from **Attendance records → Leave requests**. A Before Save guard restricts them to `custom_status` — they decide, they do not edit what the parent wrote. |
| Amend a submitted attendance record | Deliberately *not* given to teachers. The register now saves as a draft and submits explicitly; submitting is final. `cancel` and `amend` went to the Director, surfaced as **Reopen**. |

## 2. Guardian contact details — **dropped**

Judged unnecessary: teachers message parents through the app rather than ringing them, and the messaging flow is now the front door for that.

## 3. Report cards — **dropped**

Explicitly out of scope. Teachers see results and raise corrections; rosters, promotion and report cards stay with the office.

## 4. ~~Attendance insight~~ — **closed**

`/attendance/insight` reads attendance, late, sick, permission and approved leave together for a section over a date range: attendance rate per day, a per-student table sorted worst-first, a breakdown of what is actually behind the absences, and a **register-completeness check** that names the school days with no register at all.

## 5. Marks entry at realistic speed — **not applicable any more**

Teachers are now read-only on `Student Term Subject Result` by design, so there is nothing to speed up on their side. Bulk entry remains a question for whoever does enter marks.

## 6. Cover and substitution

Still open, and still out of scope. No way to see that you're covering someone's class. `Course Schedule` has `instructor` but nothing models a substitution.

## 7. Things a homeroom teacher owns that the app ignores

- **Roster management** — add or remove a student from their section, set roll numbers. `Student Group` is read-only for Instructors by design; this may be correct, but it means roll-number fixes are a desk task.
- **`Not Promoted Student`** (188 rows) and **`Suspended Student Log`** (22 rows) — both carry real data and neither is surfaced. A homeroom teacher arguably should see that a student in their section is flagged.
- **Section-targeted announcements** — teachers can only read broadcasts. A homeroom teacher messaging just their own parents still does it one thread at a time.

## 8. ~~Tasks and assignments~~ — **closed**

`/tasks` lists the `ToDo` records allocated to the signed-in user. Instructors can tick one off or reopen it and nothing else: no `create` permission, and a Before Save guard rejects any change other than the status, so they cannot assign work to anyone or edit what a task says.

## 9. Still outstanding from earlier decisions

- ~~**Staff Feedback**~~ — built. `Staff Feedback` doctype plus `/feedback`; leadership replies and sets the status, staff see only their own.
- **Web push** — service worker handlers ship, but VAPID keys and a Frappe send hook don't exist. Every notification is in-app only. Still the one item from the original brief that has not been attempted.
- ~~**`Student Incident` vs `Student Discipline Incident`**~~ — decided, see §1.
- **The evaluation catalogue** — `docs/EVALUATION_PROPOSAL.md`, five questions pending.
- **Lesson plans** — a first pass is built (`/lessons`), pending the example documents you said you would share; the format is likely to change once those arrive.

---

## Explicitly *not* gaps

Checked and dismissed, so nobody re-opens them:

- `Quiz`, `Question`, `Topic`, `Article`, `Course Activity`, `Quiz Activity` — the LMS module. **All zero rows.** Not in use.
- `Assessment Plan`, `Assessment Result`, `Student Assessment Score` — **all zero rows**, consistent with `SPEC.md`'s note that the school does not use the assessment module.
- `Student Log` — dropped at your instruction; no longer read or written.
- `Fees`, `Fee Structure`, `Program Enrollment`, `Student Applicant`, `Guardian` (write), `User` — finance, admissions and registry work. Teachers held write access on these only through `Academics User`, which has now been removed from them. Correctly out of scope.

---

## What is left, in order

1. **Web push** (§9) — the only piece of the original brief never attempted. Needs VAPID keys and a send hook on the Frappe side; the service worker is already listening.
2. **Lesson plan format** (§9) — waiting on your example documents before the fields are settled.
3. **The evaluation catalogue** (§9) — five open questions in `EVALUATION_PROPOSAL.md`.
4. **Flags a homeroom teacher can't see** (§7) — `Not Promoted Student` and `Suspended Student Log` carry real data about their own students.
5. **Cover and substitution** (§6) — real, but nothing in the data models it yet.
