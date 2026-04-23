# PMDInv iOS Build Log

## April 23, 2026

### Audit

- Confirmed the repo already has a serious backend foundation:
  - Supabase schema, constraints, and RLS
  - FastAPI operational routes
  - messaging tables and routes
  - tests for workflow rules
- Confirmed there was no pre-existing iOS or React Native app in the repo.

### Validation before mobile work

- frontend tests passed
- frontend typecheck passed
- backend tests passed
- production web build passed

### Mobile scaffold

- Created `apps/ios` from Expo's official `create-expo-app` scaffold.
- Replaced the starter Router example with PMDInv-specific routes and mobile providers.

### Mobile implementation

- Added mobile environment handling and Supabase client setup.
- Added iPhone-ready local mobile env pointing at the deployed PMDInv backend.
- Added a bearer-token API client for the existing FastAPI backend.
- Added auth flows:
  - sign in
  - request access
  - pending approval
  - first admin bootstrap
- Added operator flows:
  - dashboard
  - inventory
  - equipment detail
  - returns list/detail/create
  - service tickets list/detail/create
  - conversations list/thread
  - account screen

### Backend support

- Added `GET /returns/{return_id}` to support efficient mobile return detail loading.

### Installability work

- Added `app.config.ts` with build-variant aware app names, bundle identifiers, schemes, and iOS encryption flag.
- Added `eas.json` with development, preview, and production iOS build profiles.
- Added an install guide covering Expo Go and EAS internal distribution.
- Added a mobile preflight script that validates `.env`, checks deployed API health, and reports EAS login status.
- Added an Account tab device-readiness card so on-phone testing can confirm backend connectivity and active build profile.

### Validation after installability work

- `pnpm --filter @pmdinv/ios doctor` passed
- `pnpm --filter @pmdinv/ios preflight` confirms mobile env and deployed backend health
- `pnpm exec expo export --platform ios` completed successfully from `apps/ios`
- `pnpm exec expo-doctor` reported 17 of 17 checks passing
- Added `@expo/ngrok` so Expo tunnel no longer stops to request a global install during device startup
- Expo tunnel launch was validated locally after the ngrok dependency was added
- EAS login is still required before creating installable preview or production builds

### Messaging UX refresh

- Reworked the Messages tab to behave more like the native iPhone Messages list:
  - rounded conversation rows
  - timestamps in the list
  - unread count pills
  - quick-start staff contacts across the top
- Rebuilt the thread screen around a real chat layout:
  - left/right chat bubbles
  - day separators
  - fixed composer docked to the bottom
  - persistent attach and send controls
- Added mobile message attachment picking with `expo-document-picker`.
- Added signed attachment opening for message history so uploaded files can be opened from the iPhone chat view.
- Revalidated the messaging changes with:
  - `pnpm --filter @pmdinv/ios typecheck`
  - `pnpm --filter @pmdinv/ios lint`
  - `pnpm exec expo export --platform ios`

### Label packet support on iPhone

- Reviewed the web app label flow and confirmed the operational pattern:
  - returns and service tickets do not create separate label formats
  - both workflows rely on the shared equipment label packet
  - the label packet includes QR, equipment details, current assignment, patient info, and notes
- Implemented the same model on iPhone:
  - added a dedicated label packet screen for equipment
  - added QR preview, PDF sharing, and native print support
  - exposed label packet entry points from equipment, return, and service ticket detail screens
- Added native dependencies for the label flow:
  - `expo-print`
  - `expo-sharing`
  - `qrcode`
- Revalidated the label packet work with:
  - `pnpm --filter @pmdinv/ios typecheck`
  - `pnpm --filter @pmdinv/ios lint`
  - `pnpm exec expo-doctor`
  - `pnpm exec expo export --platform ios`
