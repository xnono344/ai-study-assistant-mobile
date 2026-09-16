# Nexus Study

Nexus Study is an Expo SDK 57 mobile client and FastAPI backend for creating AI assisted study lessons. The client targets Android and iOS, with a web bundle available for development previews.

## Current status

The repository is buildable and suitable to push as a development project. It is **not ready for a public store release**. See [Release blockers](#release-blockers).

Verified locally on 2026-09-16:

- TypeScript typecheck passes.
- ESLint passes with zero warnings.
- Expo Doctor passes all 21 checks.
- Android, iOS, and web production bundles export successfully.
- 21 offline backend tests pass.
- The live Gemini test is separated because it needs a valid key and network access.

## Structure

- `frontend-mobile/`: Expo Router, React Native, React Query, RevenueCat integration, offline SQLite cache, French/English/Arabic UI.
- `backend/`: FastAPI, SQLAlchemy, lesson processing, Google OAuth token storage, subscription webhooks, account endpoints.

The backend is included directly in this repository. It no longer depends on a machine specific symlink.

## Setup

Requirements:

- Node.js 20 or newer
- pnpm 8 or newer
- Python 3.11 or newer

```bash
pnpm install
pnpm backend:install
cp frontend-mobile/.env.example frontend-mobile/.env
cp backend/.env.example backend/.env
```

Generate the backend encryption key:

```bash
backend/venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Add that value to `backend/.env` as `ENCRYPTION_KEY` and configure the remaining values for the services you use.

Run the backend:

```bash
pnpm backend:dev
```

For a physical phone, run `hostname -I` and set `EXPO_PUBLIC_API_BASE` in `frontend-mobile/.env` to this computer's LAN address, for example `http://192.168.1.100:8000`. The phone and computer must use the same Wi-Fi network.

Install the latest Expo Go on the phone and sign in to the same Expo account in Expo Go and the CLI. Then run the mobile client from the repository root:

```bash
pnpm dev -- --lan
```

Scan the QR code with Expo Go. Expo Go can preview subscription screens, but real in-app purchases require an EAS development build.

## Verification

```bash
pnpm verify
cd frontend-mobile && pnpm dlx expo-doctor@latest
```

The default backend test command excludes external Gemini calls. Run them explicitly when credentials and network access are available:

```bash
pnpm backend:test:live
```

Additional bundle checks:

```bash
cd frontend-mobile
pnpm exec expo export --platform android --output-dir /tmp/nexus-android-export
pnpm exec expo export --platform ios --output-dir /tmp/nexus-ios-export
pnpm exec expo export --platform web --output-dir /tmp/nexus-web-export
```

## Release blockers

These are product and backend gaps rather than compile errors:

1. Lessons and progress are not yet scoped to a user in the database. A deployed multiuser service could expose shared lesson data.
2. The Ask AI endpoint still returns placeholder text, and exercise grading uses placeholder length based logic.
3. Account export currently omits lessons and progress.
4. Certificate pinning contains placeholder hashes and is not enforced by a native transport.
5. The biometric setting records a preference but does not gate the app on launch or resume.
6. Google OAuth, RevenueCat, EAS credentials, store accounts, migrations against a staging database, and physical device testing still require real service configuration.
7. Detox is listed but no E2E suite or Detox configuration is present.

Do not deploy the backend for multiple users or submit the app to a store until these are resolved and tested on real devices.
