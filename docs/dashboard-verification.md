# Dashboard verification — 13 September 2026

Implemented server-verified roles and account activation, explicit academic
department/institution responsibilities, multiple student-coordinator classes,
faculty teaching scopes, class-scoped academic publications, and token revocation
on logout. The live timetable editor publishes the same records used by attendance
access and class alarms.

Validation completed:

- 92 isolated API access checks across five roles, two departments, different
  years and sections, including allowed operations and rejected cross-scope reads
  and writes. Includes syllabus audience changes and republishing, scoped exam
  columns, active-session responsibility revocation, deactivation and logout replay.
- 109 authenticated workflow calls with synthetic records in a disposable schema:
  login, attendance, marks, assignments, submissions, leave review, notifications,
  academic documents, syllabi, attendance sessions and timetable publication.
- Five backend unit tests and 13 frontend unit tests passed.
- Production frontend build passed.
- Eight read-only checks of existing account/role combinations passed.
- Android debug APK build, 30 unit tests, and lint passed.
- Local backend restarted; `/api/health` returned `status: ok` and all five
  dashboard aliases returned HTTP 200.

The in-app browser was unavailable, so interactive browser verification was not
performed. Physical camera/Bluetooth/alarm acceptance has not been performed.

Operational setup still required:

- Assign intended roles in Admin → User Management and departments/classes in
  Responsibilities & Access. Existing explicit grants remain intact, including
  the existing account with all five roles. Incorrect grants must be corrected
  to the intended roles; the implementation does not infer a person's job.
- Scope and republish legacy syllabi/calendars/exams that have no class audience.
- Configure a compatible identity-and-liveness attendance verifier and online
  enrollment service. The readiness check currently reports both services missing.
  Automatic face attendance remains unavailable until configured. See
  [attendance-readiness.md](attendance-readiness.md) for the service contract and
  two-phone acceptance checks.

See [dashboard-access.md](dashboard-access.md) for configuration and test commands.
