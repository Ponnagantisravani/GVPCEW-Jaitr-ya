# Dashboard workflow verification

Run `npm test` for API authentication tests. Run `npm run test:workflows` with `TEST_DATABASE_URL` set to an isolated PostgreSQL test database. The workflow test creates a random schema, applies the repository database definitions, uses synthetic accounts across all five roles, and removes its schema afterward. Never point this test at a production database.

The workflow covers login, role restrictions, student records, attendance and check-in sessions, marks validation, assignment submission, leave approval, correction requests, notices, reminders, calendar and syllabus publication, and timetable conflict rejection. It does not certify every UI interaction or external integration.
