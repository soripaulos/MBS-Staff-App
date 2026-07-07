# Permission matrix — MBS Staff PWA

The app projects Frappe roles into UI "personas". These gate what *renders*; the Frappe server decides what any request actually *returns*. Roles are re-read on window focus (≤60s stale), so permission changes in Frappe propagate to a signed-in user without redeploying.

## Personas

| Persona | Granted by roles | Adds |
|---|---|---|
| Teacher | `Instructor` role, or an `Instructor` record linked via `custom_username`/`Employee.user_id` | Timetable, attendance-taking, results for taught subject/section pairs, own parent messages, own evaluation aggregates, student records for own groups |
| Homeroom teacher | Teacher + `Student Group.custom_homeroom_teacher` = them | Whole-section overview/year results for the homeroom group |
| Leadership | any of `Academics User`, `Education Manager`, `Director`, `System Manager` | All groups & results, all appeals, per-teacher evaluation aggregates, analytics |
| Admin | `System Manager` or `Education Manager` | Feedback inbox (`Student Feedback`), all parent-message threads |
| Broadcast | `System Manager`, `Education Manager`, `Academics User`, `Director` | Compose `App Notification` drafts |
| HR | `HR Manager`, `HR User`, `Leave Approver` | Staff-leave pending queue |
| Employee | linked `Employee` record | Apply for own leave |

## Client-side data scoping (UX layer)

- **Results**: `Student Term Subject Result` queried only for the selected group; subject list limited to the teacher's `Course Schedule`-derived pairs unless homeroom/leadership.
- **Appeals**: teachers see rows matching their subject/section pairs.
- **Attendance records**: teacher lists filtered to students of their groups.
- **Parent messages**: filtered `teacher = session user` unless admin.
- **Teacher evaluations**: `reviewer` is never requested from the server; teachers query only their own rows.

## Server-side hardening (recommended on the Frappe site)

The app never bypasses DocPerms, but where the school wants row-level guarantees independent of any client:

1. **Permission query conditions** on `Student Term Subject Result`, `Student Term Report`, `Student Year Report`, `Course Schedule` restricting `Instructor`-only users to `examiner/instructor == their Instructor` or groups they belong to via `Student Group Instructor`.
2. `Teacher Parent Message`: permission query `teacher == frappe.session.user` for Instructor-only users.
3. `Teacher Evaluation`: permlevel on `reviewer` so only System Manager reads reviewer identity.
4. `Student Feedback`: read restricted to `System Manager` / `Education Manager` (already the app's assumption).
5. A future **Staff Feedback** doctype (staff → school channel) — proposed, not yet created; needs a decision on shape and anonymity policy.
