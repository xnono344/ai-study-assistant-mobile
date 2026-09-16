# Testing Nexus Study

## Automated checks

From the repository root:

```bash
pnpm install
pnpm backend:install
pnpm verify
```

`pnpm verify` runs:

1. TypeScript typecheck
2. ESLint
3. Jest (currently no frontend test files, so this validates Jest configuration only)
4. Backend tests excluding external service calls

Run Expo dependency validation:

```bash
cd frontend-mobile
pnpm dlx expo-doctor@latest
```

Run Metro production bundle checks:

```bash
pnpm exec expo export --platform android --output-dir /tmp/nexus-android-export
pnpm exec expo export --platform web --output-dir /tmp/nexus-web-export
```

## Live Gemini test

This spends quota and requires a working `GOOGLE_API_KEY` in `backend/.env`:

```bash
pnpm backend:test:live
```

A timeout or provider error in this test is an external integration failure and does not invalidate the offline suite, but it blocks claiming that live AI generation works in the current environment.

## Manual mobile test

1. Configure `frontend-mobile/.env` and `backend/.env`.
2. Apply migrations and start the backend.
3. Start Expo with `pnpm dev`.
4. Test on a physical Android device and an iOS device or simulator.
5. Check anonymous startup, Google sign in, lesson creation, upload, offline recovery, language switching including Arabic RTL, purchase and restore, account deletion, and app resume.

## Known gaps

There is no Detox E2E suite. Multiuser isolation, real Google OAuth, RevenueCat purchases, account export, biometric gating, and certificate pinning are not release verified. See the release blockers in `README.md`.
