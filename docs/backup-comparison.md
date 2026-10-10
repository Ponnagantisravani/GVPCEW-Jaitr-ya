# Backup comparison and mobile layout

Compared the frontend source and backend route files from GVPCEW APP (2).zip with the current working project. Archived files were used as reference material; dependencies, credentials, datasets, and database contents were not imported.

| Role | Backup sections | Current sections | Missing menu sections |
| --- | ---: | ---: | --- |
| student | 12 | 14 | None |
| faculty | 11 | 11 | None |
| admin | 6 | 6 | None |
| academic_coordinator | 7 | 8 | None |
| student_coordinator | 5 | 5 | None |

Restored views: digital ID editing, photograph upload, front/back preview and print; complete dashboard section lists; student contact, mentor and regulation fields; faculty monthly attendance register and printing. The register uses stored attendance and supports selecting a month. Missing student details remain empty instead of using the backup's sample identity or contact values.

Mobile structure: role-specific bottom navigation with All Sections, safe-area spacing, sticky page header, scrollable navigation drawer, two-column dashboard shortcuts, single-column forms, touch targets, labeled record cards, scrollable timetable/register grids, and bottom-aligned edit dialogs. Desktop and print layouts are preserved. This is a responsive web application, not an Android/iOS native build.

Validation: production build, existing tests, and server rendering checks. Interactive phone/browser verification and live database integration still need a working browser connection and PostgreSQL.
