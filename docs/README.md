# GVPCEW College Management & Student Portal

See [the project README](../README.md) for installation, safe database migrations, first-administrator setup, local development, and deployment.

The application includes React dashboards for students, faculty, administrators, student coordinators, and academic coordinators; an Express/PostgreSQL API; and the Python face-enrollment application. Portal features include registration and approval, attendance sessions, marks, assignments, timetable management, academic documents, notices, events, and notifications.

Run `npm test` for database-independent checks and `npm run build` for the production frontend. The syllabus integration suite (`npm --prefix backend run test:syllabus`) requires a running, migrated database containing at least one user; its changes are rolled back.

See [syllabus documentation](syllabus.md) for the syllabus workflow.
