# GVPCEW College Management & Student Portal

The project now includes a Vite + React student portal and an Express + PostgreSQL API, while retaining the face-enrollment application.

## Run locally

1. Install dependencies with `npm --prefix backend ci` and `npm --prefix frontend ci`.
2. Create `backend/.env` from `backend/.env.example`. Set a working `DATABASE_URL` and a unique `JWT_SECRET`. Start PostgreSQL before starting the API.
3. For an existing database, run `npm --prefix backend run db:migrate:production`. This applies the current portal schema without resetting records. Back up production data before migrations.
4. For a fresh database, create the first administrator with the command below.
5. Start the API with `npm run dev:api` and the portal with `npm run dev`.

The portal opens at `http://localhost:5173`. Sign in with an approved college account and select an assigned role. New students register, complete face enrollment, and wait for administrator approval.

`db:init` is a destructive development reset that loads seed data; use it only for a disposable database.

For deployment, run `npm run build`, set `NODE_ENV=production`, then run `npm start`. The API serves all six built portal pages, including registration and enrollment routes. Configure `ALLOWED_ORIGINS` when using a separate frontend origin and `TRUST_PROXY` for your actual proxy setup.

Online face enrollment requires the Python recognition service, `FACE_API_URL`, and matching `FACE_SERVICE_KEY` values on both services. Dataset uploads additionally require the private object-storage settings listed in the environment example.

Run `npm test` for frontend regression and backend authentication checks (no database required), `npm run build` for all portal entry points, and `npm --prefix backend run test:syllabus` for database integration checks (requires a running, initialized database).

## First administrator

After applying the production migration, set these variables in your terminal and run:

```powershell
$env:ADMIN_NAME = 'College Administrator'
$env:ADMIN_EMAIL = 'administrator@gvpcew.ac.in'
$adminCredential = Get-Credential -UserName $env:ADMIN_EMAIL -Message 'Choose an administrator password (at least 12 characters)'
$env:ADMIN_PASSWORD = $adminCredential.GetNetworkCredential().Password
try { npm run db:create-admin } finally { Remove-Item Env:ADMIN_PASSWORD; Remove-Variable adminCredential }
```

The command creates a new account and its admin role together. It refuses to modify an existing account. Sign in with the admin role to create staff accounts, approve students, and assign portal roles. Never use the demo seed to initialize production accounts.

If database commands report `ECONNREFUSED`, start PostgreSQL and verify `DATABASE_URL` before retrying. On Windows, the installed PostgreSQL service may need to be started from Services with administrator privileges.

## Portal API

- `POST /api/auth/login`
- `GET /api/students/dashboard`, `/profile`, `/attendance`, `/marks`, `/timetable`, `/assignments`
- `GET /api/notices`, `GET /api/events`, `POST /api/events/:id/register`

All portal endpoints except login require a Bearer JWT. Student endpoints enforce the `student` role.

---

# Legacy face-enrollment system

The first working phase is the face enrollment desktop application.

## Current structure

- `face-enrollment/` contains the Windows enrollment app
- `backend/` receives enrollment data
- `database/` stores schema definitions
- `frontend/` contains the five role dashboards and account/enrollment screens

## Enrollment flow

1. Student logs in with roll number.
2. Backend returns basic student details.
3. Desktop app starts the webcam.
4. High-quality face samples are collected.
5. An embedding is generated from the samples.
6. The embedding and captured face images are uploaded to the backend.
7. The UI shows `Enrollment Successful`.

## Uploaded datasets

Classmates' local `.exe` captures are still saved on their own computers, but the app also uploads copies to the backend.

- Server folder: `backend/src/uploads/datasets/<roll_number>/`
- Legacy local captures are not publicly served. Retrieve uploaded images through the protected dataset API.
- Upload metadata is stored in PostgreSQL table `face_embeddings` under `embedding.metadata.uploaded_images`

## Private persistent dataset pipeline

Images are now intended to be stored in a **private S3-compatible bucket** (Cloudflare R2 is a good Render-compatible choice), not on Render's temporary disk. Set the values in `backend/.env.example` as Render environment variables, then run `cd backend && npm install && npm run db:migrate`. Use `npm start` as the Render start command; do not use `npm run db:init` in production because it recreates the database.

Build the desktop app with `ENROLLMENT_API_KEY` available in its environment. The upload route is `POST /api/enrollment/upload` with an `X-Enrollment-Key` header. Keep this key scoped to enrollment, rotate it if an installer is lost, and use a stronger per-device/login credential scheme before a large rollout.

From your laptop, set `DATASET_ADMIN_API_KEY` and run:

```powershell
python -m pip install -r tools/requirements.txt
python tools/sync_dataset.py --api-url https://your-render-service.onrender.com --output dataset
```

This saves new files as `dataset/<roll_number>/<image_name>` and records checksums in `dataset/.sync-state.json`; repeated runs skip files already downloaded. Protected admin routes are `GET /api/dataset/stats`, `GET /api/dataset/manifest`, and `GET /api/dataset/images/:id`, all requiring `X-Dataset-Admin-Key`.
