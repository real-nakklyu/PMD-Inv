# PMDInv

PMDInv is a Florida-only internal DME inventory operations app for power wheelchairs and scooters. It tracks equipment inventory, patient assignments, Florida service regions, returns, repairs, service tickets, and audit activity.

The app is designed as a production-style Vercel deployment with a Next.js frontend, Python FastAPI backend, and Supabase for Postgres, Auth, Row Level Security, and optional storage.

## Architecture Decision

This repository uses a small monorepo with two Vercel services:

- `apps/web`: Next.js App Router, TypeScript, Tailwind CSS, React Hook Form, Zod, TanStack Table, Recharts, Supabase Auth client, and a browser barcode scanner component.
- `apps/api`: Python FastAPI service mounted at `/api`, with typed routers, schemas, repositories, workflow services, and Supabase data access.
- `supabase`: SQL migrations and seed data for Postgres enums, constraints, indexes, RLS policies, and sample Florida data.

Vercel Services keeps the deployment practical: the frontend is served at `/`, and FastAPI routes are reached through `/api`. FastAPI route handlers do not include the `/api` prefix because Vercel strips the service route prefix before forwarding.

## Folder Structure

```text
.
|-- apps
|   |-- api
|   |   |-- app
|   |   |   |-- api/routers
|   |   |   |-- core
|   |   |   |-- db
|   |   |   |-- repositories
|   |   |   |-- schemas
|   |   |   |-- services
|   |   |   `-- main.py
|   |   |-- tests
|   |   `-- pyproject.toml
|   `-- web
|       |-- src
|       |   |-- app
|       |   |-- components
|       |   |-- features
|       |   |-- lib
|       |   `-- types
|       |-- next.config.ts
|       |-- package.json
|       `-- tsconfig.json
|-- docs
|-- supabase
|   |-- migrations
|   `-- seed
|-- vercel.json
|-- package.json
`-- pnpm-workspace.yaml
```

## Tech Stack

- Frontend: Next.js App Router, React, TypeScript
- Backend/API: Python, FastAPI
- Database/Auth/Storage: Supabase Postgres, Supabase Auth, RLS, Storage
- UI: Tailwind CSS with reusable components and theme tokens
- Forms: React Hook Form + Zod
- Tables: TanStack Table
- Charts: Recharts
- Barcode scanning: `html5-qrcode`, wrapped in a reusable scanner component with permission handling and manual fallback
- Testing: Vitest for frontend, Pytest for backend
- Deployment: Vercel Services

## Domain Rules

Florida service regions are intentionally constrained to:

- Miami
- Fort Myers
- Sarasota
- Tampa
- Orlando
- Gainesville
- Jacksonville
- Tallahassee
- Destin

Equipment types are constrained to:

- `power_wheelchair`
- `scooter`

Equipment lifecycle statuses are:

- `available`
- `assigned`
- `return_in_progress`
- `in_repair`
- `retired`

Return statuses are:

- `requested`
- `scheduled`
- `pickup_pending`
- `in_transit`
- `received`
- `inspected`
- `restocked`
- `closed`
- `cancelled`

Service ticket statuses are:

- `open`
- `scheduled`
- `waiting_parts`
- `in_progress`
- `resolved`
- `closed`
- `cancelled`

Staff roles are:

- `admin`
- `dispatcher`
- `technician`
- `viewer`

## Local Setup

Install Node dependencies:

```bash
pnpm install
```

Install Python dependencies:

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
```

Create environment files:

```bash
copy .env.example .env
copy apps/web/.env.example apps/web/.env.local
copy apps/api/.env.example apps/api/.env
```

Fill in the Supabase values from your local or hosted Supabase project.

## Supabase Setup

Apply migrations with the Supabase CLI:

```bash
supabase db reset
```

The migration creates:

- normalized enums
- `profiles`
- `patients`
- `equipment`
- `assignments`
- `returns`
- `service_tickets`
- `service_ticket_updates`
- `activity_logs`
- indexes for search/filtering
- RLS helper functions and policies
- a private `service-attachments` storage bucket

Seed data lives in `supabase/seed/001_seed.sql` and contains Florida-only sample inventory, patients, assignments, returns, tickets, and activity logs.

## Running Locally

Run the frontend:

```bash
pnpm dev:web
```

Run the backend:

```bash
cd apps/api
uvicorn app.main:app --reload --port 8000
```

Run both through the workspace:

```bash
pnpm dev
```

When using Vercel Services locally, run:

```bash
vercel dev -L
```

## Environment Variables

Frontend:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Backend:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `API_CORS_ORIGINS`
- `CRON_SECRET`

Next.js server routes also need `SUPABASE_SERVICE_ROLE_KEY` when using the `/staff` local bootstrap fallback and cron reminders. Never prefix the service role key with `NEXT_PUBLIC_`; it must remain server-only.

## Authentication And Authorization

Supabase Auth is the login source. The `profiles` table maps authenticated users to internal staff roles. RLS policies allow authenticated users to read operational data, while write access is role-gated:

- admins can manage everything
- dispatchers can manage patients, equipment workflows, assignments, returns, and tickets
- technicians can update service tickets and repair notes
- viewers are read-only

The FastAPI backend validates the bearer token from Supabase Auth and uses server-side Supabase access for workflow mutations. RLS remains the database guardrail for direct client reads and future client-side data access.

First admin setup is available from `/staff` after signing in with a Supabase Auth user, but only while the `profiles` table is empty. See `docs/staff-auth.md`.

## Workflow Overview

Inventory starts as `available`. Assigning a unit creates an active assignment, records `assigned_at`, and moves equipment to `assigned`.

Returns are explicit. An assigned unit cannot be silently unassigned. A return starts at `requested`, progresses through the return statuses, and only makes equipment available after `restocked` or `closed` logic marks the unit physically returned and ready.

Service tickets can be opened for any equipment and optionally linked to a patient or assignment. Completed repairs are derived from service tickets where `repair_completed = true`.

Activity logs capture meaningful events such as equipment creation, assignment, return initiation, return completion, ticket creation, status changes, and repair completion.

The current UI includes operator forms for patient creation, assignment creation, return initiation, return status updates, service ticket creation, and service ticket repair/status updates.

Inventory, assignments, returns, service tickets, and repair history include CSV export for the current loaded view. Equipment detail pages include a print action for physical files, handoffs, or repair bench paperwork.

Service tickets support photo/document attachments through Supabase Storage. Equipment detail pages support damage photo or condition document uploads using the private `service-attachments` bucket.

Overdue return reminders are implemented as a protected Vercel Cron endpoint. The route logs daily activity for return workflows that have been open longer than seven days and are not physically returned or cancelled. See `docs/notifications-cron.md`.

## Barcode Scanning Approach

The frontend uses `html5-qrcode` behind `BarcodeScanner`. The component:

- requests camera permission from the browser
- prefers the rear camera on mobile when available
- scans 1D barcodes and QR codes
- shows the scanned serial before saving
- supports retry/rescan
- provides manual entry fallback

Duplicate serial validation happens in both frontend form validation and backend/database constraints. The database has a unique index on `equipment.serial_number`.

## Testing

Run frontend tests:

```bash
pnpm --filter @pmdinv/web test
```

Run backend tests:

```bash
cd apps/api
pytest
```

Planned coverage areas:

- equipment assignment validation
- duplicate serial handling
- return state transitions
- service ticket repair completion
- dashboard analytics
- scanner wrapper behavior
- storage attachment path safety

## Deployment To Vercel

This project uses root `vercel.json` with Vercel Services:

```json
{
  "experimentalServices": {
    "web": { "entrypoint": "apps/web", "routePrefix": "/" },
    "api": { "entrypoint": "apps/api/app/main.py", "routePrefix": "/api" }
  },
  "crons": [
    { "path": "/api/cron/overdue-returns", "schedule": "0 13 * * *" }
  ]
}
```

In Vercel Project Settings, use the Services framework preset. Add all environment variables to the Vercel project. The frontend calls the backend through `/api` in production. Vercel Cron runs only on deployed production environments.

## Why This Stack

Next.js gives a fast App Router UI, strong routing conventions, and Vercel-native deployment. FastAPI gives typed Python APIs, clean OpenAPI docs, and straightforward workflow validation. Supabase provides managed Postgres, Auth, Row Level Security, and Storage without custom auth infrastructure.

## Future Improvements

- email/SMS/push delivery for overdue returns
- attachment metadata table with captions and categories
- one-reminder-per-return-per-day de-duplication
- more granular region/team permissions

## Troubleshooting

- If `/api/health` returns 404 on Vercel, confirm the project is using the Services framework preset.
- If the frontend cannot call the backend locally, verify `NEXT_PUBLIC_API_URL`.
- If auth works but data is empty, check that profiles exist for authenticated users.
- If inserts fail, inspect RLS policies and user role in `profiles`.
- If barcode scanning fails on mobile, use HTTPS or a secure localhost tunnel; browsers require a secure context for camera access.
