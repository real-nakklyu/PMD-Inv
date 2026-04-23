# PMDInv iPhone Install Guide

This guide covers the two practical ways to run PMDInv on an iPhone.

## Option 1: Fastest path with Expo Go

Use this when you want to test the current app on your iPhone quickly without creating a standalone IPA first.

### On your computer

From the repo root:

```bash
pnpm install
pnpm --filter @pmdinv/ios preflight
pnpm --filter @pmdinv/ios start:tunnel
```

This starts Expo with a tunnel so your phone does not need to be on the same local network as your computer.

### On your iPhone

1. Install Expo Go from the App Store.
2. Open Expo Go.
3. Scan the QR code shown in the terminal.
4. Wait for PMDInv to load.
5. Sign in with your PMDInv credentials.
6. Open the Account tab and confirm the device-readiness card reports a healthy backend connection.

### Notes

- This is the fastest real-device route.
- The app uses the deployed PMDInv API at `https://pmd-inv.vercel.app/api`.
- Realtime messaging websocket is optional and currently left blank for the mobile app, so messaging works through the standard API flow.
- If Expo tunnel has a temporary ngrok issue, use `pnpm dev:ios` instead while your computer and iPhone are on the same Wi-Fi network.

## Option 2: Installable PMDInv app with EAS

Use this when you want a proper installable PMDInv app icon on your iPhone.

## Prerequisites

- Expo account
- Apple Developer account
- Your iPhone available for device registration

## First-time setup

Run these commands from `apps/ios`:

```bash
pnpm install
pnpm preflight
pnpm dlx eas-cli login
pnpm dlx eas-cli device:create
```

`device:create` registers your iPhone for ad hoc internal distribution.

## Build profiles

The app includes these EAS profiles in `apps/ios/eas.json`:

- `development`: internal development client build
- `preview`: internal installable build for testers
- `production`: App Store / TestFlight ready build profile

## Create an installable iPhone build

From `apps/ios`:

```bash
pnpm eas:ios:preview
```

When the build finishes:

1. Open the build page from the URL printed by EAS CLI.
2. Tap **Install**.
3. Open the install link on your iPhone.
4. If iOS asks, trust the profile and enable Developer Mode if required.
5. Launch PMDInv Preview from your home screen.

## Production/TestFlight build

When you are ready for TestFlight:

```bash
pnpm eas:ios:production
```

Then submit with EAS Submit or App Store Connect.

## App variants

The app now uses variant-aware config in `apps/ios/app.config.ts`:

- `PMDInv Dev`
- `PMDInv Preview`
- `PMDInv Mobile`

That keeps development, preview, and production installs from colliding on the same device.

## Current status

As of April 23, 2026:

- real-device Expo Go path is configured
- EAS build profiles are configured
- install preflight now validates the local `.env`, backend health, and EAS login state
- mobile env is wired to the deployed PMDInv backend
- local lint and typecheck pass
- local iOS export bundle succeeds
- web and API tests still pass after the mobile changes

## Remaining rollout work

- native barcode scanning
- native attachments for messages and service tickets
- APNs push notifications
- offline queueing
- App Store branding assets and release metadata
