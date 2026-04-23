# PMDInv Mobile

Expo Router based iOS/mobile client for PMDInv. This app reuses the existing Supabase Auth and FastAPI backend instead of creating a second backend.

## Local setup

1. Install workspace dependencies from the repo root:

```bash
pnpm install
```

2. Copy the mobile environment file:

```bash
copy apps\ios\.env.example apps\ios\.env
```

3. Fill in the values from the same Supabase/API environment used by the web app.

4. Start the mobile app:

```bash
pnpm --filter @pmdinv/ios start
```

Useful commands:

```bash
pnpm --filter @pmdinv/ios preflight
pnpm --filter @pmdinv/ios ios
pnpm --filter @pmdinv/ios start:tunnel
pnpm --filter @pmdinv/ios lint
pnpm --filter @pmdinv/ios typecheck
```

`preflight` validates the local iPhone env, pings the deployed API, and tells you whether EAS login is still missing for installable builds.

## Current scope

- Supabase email/password auth
- staff access request flow
- first-admin bootstrap flow
- dashboard and notifications
- inventory list and equipment detail
- returns list, return creation, status updates, and inspection checklist
- service ticket list, detail, and creation
- internal staff messaging

## Architecture notes

- Auth is handled by Supabase in React Native using `@supabase/supabase-js`.
- Operational data continues to come from the existing FastAPI API with bearer auth.
- The app is intentionally contract-driven; mobile types mirror the existing web/API shapes.
- The Account tab includes a device-readiness card so field testing can confirm backend reachability and active app profile directly from the phone.
- Documentation for the mobile build lives in [`docs/ios-app-foundation.md`](/C:/Users/User/Desktop/PMDInv/docs/ios-app-foundation.md).
- iPhone install steps live in [`docs/ios-install-guide.md`](/C:/Users/User/Desktop/PMDInv/docs/ios-install-guide.md).
