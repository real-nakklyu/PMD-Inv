# PMDInv iOS App Foundation

This document tracks the first professional mobile implementation for PMDInv.

## Goal

Build a real iOS-ready client from scratch without replacing the current backend. The mobile app should reuse:

- Supabase Auth
- the FastAPI operational API
- the existing Postgres workflow rules and RLS-backed data model
- the staff messaging tables already in Supabase

## Why Expo Router

The mobile client is built in `apps/ios` using Expo Router because it gives us:

- a supported React Native baseline from Expo's official scaffold
- file-based navigation that stays easy to extend
- straightforward iOS simulator and device workflows
- a clean path to development builds and App Store packaging later

This app currently uses Expo SDK 54 because that is what the current official scaffold generated during setup on April 23, 2026, which keeps the initial project aligned with Expo's supported defaults.

## Current architecture

### Auth

- Supabase email/password auth is handled in React Native with `@supabase/supabase-js`.
- Session persistence uses AsyncStorage on native platforms.
- Mobile still respects the existing PMDInv `profiles` table and `/profiles/me` access checks.

### Data access

- Operational reads and writes go through the existing FastAPI service using bearer tokens from the active Supabase session.
- The mobile app intentionally mirrors the existing web/API contracts in `apps/ios/src/types/domain.ts`.
- The mobile API client lives in `apps/ios/src/lib/api.ts`.

### Navigation

- `app/(auth)` contains sign-in, pending approval, and first-admin bootstrap flows.
- `app/(app)/(tabs)` contains dashboard, inventory, returns, tickets, messages, and account tabs.
- Stack detail screens exist for equipment, return workflows, service tickets, and message threads.

## Implemented flows

### Authentication

- sign in
- staff access request submission
- pending approval state
- first admin bootstrap

### Operations

- dashboard summary and notifications
- inventory list
- equipment detail
- return list
- create return
- return status updates
- return inspection checklist
- service ticket list
- service ticket detail update
- create service ticket
- conversations list
- direct-message thread view
- send text message
- iPhone-style chat bubbles and fixed bottom composer
- mobile attachment picking for staff messages

## API additions made for mobile

One API improvement was added while building the mobile app:

- `GET /returns/{return_id}` in `apps/api/app/api/routers/returns.py`

This avoids forcing the mobile client to fetch and scan the entire returns list just to load one workflow.

## Environment variables

The iOS app uses:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_MESSAGING_WS_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

These were added to the shared `.env.example` and to `apps/ios/.env.example`.
An iPhone-ready local `apps/ios/.env` now points at the deployed PMDInv API and the existing hosted Supabase project.

## Install paths

Two supported install paths now exist:

- Expo Go over tunnel for immediate real-device testing
- EAS internal distribution for a standalone installable iPhone app

Detailed steps live in `docs/ios-install-guide.md`.

## Install-readiness tooling

- `pnpm --filter @pmdinv/ios preflight` validates the mobile `.env`, confirms the deployed API responds to `/health`, and reports whether EAS login is still required for installable builds.
- The Account tab includes a device-readiness card that shows the current app variant, version, backend host, Supabase host, and latest backend health check.

## Validation plan

After dependency install, validate with:

```bash
pnpm install
pnpm --filter @pmdinv/ios typecheck
pnpm --filter @pmdinv/ios lint
pnpm --filter @pmdinv/web typecheck
pnpm --filter @pmdinv/web test
cd apps/api && .\.venv\Scripts\python.exe -m pytest
```

## Known follow-up work

- native barcode scanning
- native file/image attachments for tickets and messages
- push notifications and APNs delivery
- offline queueing for weak-signal environments
- Expo/EAS account login plus Apple signing for preview or production IPA delivery
- HIPAA/security review before any real patient-data rollout
