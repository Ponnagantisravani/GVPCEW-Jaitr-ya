# Dashboard access and record visibility

Sign-in selects a role returned by the server. Each dashboard verifies `/auth/me`
before rendering and rechecks when the browser account changes or the tab regains
focus. Cached role names are not authorization. Direct links to unassigned
dashboards redirect to an assigned dashboard.

Web requests include the current dashboard role. The server checks that assignment
against `user_roles` and applies only that role's permissions to the request.
An account with both student and admin access therefore sees student-scoped data
while using its student dashboard. Mobile clients without a dashboard header retain
their assigned endpoint permissions; shared portal reads default to the account's
assigned primary role.

| Dashboard | Records and operations |
| --- | --- |
| Student | Own profile, attendance, marks and leave; published subjects, assignments and timetable for own section |
| Student coordinator | Own student records; explicitly assigned classes, class rosters/profiles, attendance, performance, assignments, announcements and attendance sessions |
| Faculty | Own profile and assignments; students in published teaching assignments; subject-specific attendance/marks; leave for assigned classes |
| Academic coordinator | Only explicitly assigned departments, their timetables, publications and reports; institution-wide scope requires an explicit admin grant |
| Admin | College administration, role grants, coordinator responsibilities and account activation |

Faculty can view full class timetables only for sections they teach. A department
match alone does not grant access to its students or leave requests. Students need
an academic-section assignment and a published timetable; missing assignments show
empty data rather than falling back to the whole department. Personal browser
reminders and alert preferences are keyed by account ID.

The database check found one account explicitly assigned all five roles. That
account retains those permissions. Administrators can correct unintended grants
under User Management; this change does not guess which role assignments to delete.

## Configure responsibilities

Run `node backend/scripts/migrate-academic-access.js` for an existing installation,
or use the production migration. It adds explicit department/class grants,
account activation and revoked-token records. It preserves an existing student
coordinator's own class once. It never grants academic institution-wide access.

In **Admin → User Management**, assign the intended roles. In
**Responsibilities & Access**, select the account, choose its academic departments
or student-coordinator classes, and save. Each class includes department, year,
semester, section and academic year. A coordinator can have multiple classes.
An unassigned academic coordinator sees no departmental records. Deactivation
blocks the account immediately. Removing a responsibility also blocks old
attendance sessions for that responsibility.

Faculty access comes from published timetable assignments. The timetable screen
now saves and publishes the same database periods used for student/faculty
schedules, access checks and mobile reminders. Drafts do not grant teaching access.
Class, faculty and room conflicts are checked when saving/importing periods.

Syllabi, calendars and exams require an explicit publication audience. Existing
documents without a class audience are visible only to institution administrators
until scoped and republished. Syllabi support **Save audience as draft**; calendars
and exams support separate documents for different classes. Notifications are
sent only to the selected classes and their teachers/coordinators. Student exam
responses exclude other departments' branch columns. Faculty syllabi and calendars
are available from their own dashboard menus.

Logout revokes the bearer token on the server. Replaying that token returns 401.
Web and Android logout both call this endpoint; Android also removes local account
reminders. Each new login receives a unique token.

## Validation

From `backend`: `npm test`, `npm run test:academic-access`, and
`node scripts/check-dashboard-isolation.js`. The access test creates an isolated,
randomly named PostgreSQL schema, exercises five roles with different departments,
years and sections, and drops only that schema afterward. It does not use existing
students as test fixtures. The isolation smoke check only reads existing accounts
and never prints identities or tokens.

From `frontend`: `npm test` and `npm run build`. Android validation uses
`:testing:assembleDebug :testing:testDebugUnitTest :testing:lintDebug`.
Interactive browser checks were unavailable in this session. See
[attendance-readiness.md](attendance-readiness.md) for the remaining verification
service configuration and physical-device acceptance requirements.
