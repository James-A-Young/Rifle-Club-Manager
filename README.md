# Rifle Club Manager

Rifle Club Manager is a full-stack TypeScript app for managing club members, sign-ins, firearms, and visit logs.

It is organized as an npm workspace with:
- `client`: React + Vite frontend
- `server`: Express + Prisma + PostgreSQL backend

## Permission Model

Authorization is **entirely club-scoped**. There are no system-wide user roles.

### Club Membership Types

| Type | Description |
|------|-------------|
| **Admin** | Elevated permissions within that club only (approve members, manage invites, edit settings). |
| **Member** | Normal permissions — can sign in, view club info, manage own profile. |
| **Probationary Member** | Same permissions as Member; tracked as a separate category for administrative purposes. |

- All admin checks are performed against the user's membership in the **specific club context**.
- JWT/session payload contains only `id` and `email` — no global role.
- A user can be Admin in one club and Member (or not a member) in another.

### Invite-Only Registration

Public registration without a valid invite token is blocked. To add a new member:

1. A club admin creates an invite via the **Invites** section of the Club Dashboard.
2. The admin shares the invite link with the prospective member.
3. The invited person registers at `/register?inviteToken=<token>` using the email the invite was sent to.
4. The resulting membership is **Pending** until an admin approves it.

When Resend is configured, invite emails are sent by the backend automatically when an invite is created.

### Password Reset

- Users can request a one-time password reset link from `/forgot-password`.
- Links are single-use, time-limited, and delivered by email when Resend is configured.
- Reset completion is handled at `/reset-password`.

### First-Deploy Bootstrap

When the database has **zero users**, a one-time bootstrap flow is available at `/setup`:

1. Navigate to `/setup` in the browser (or `POST /api/auth/bootstrap` directly).
2. Provide your account details and a name for the first club.
3. The system creates your account, the club, and an **approved Admin** membership.
4. Bootstrap is **automatically disabled** once any user exists — it cannot be re-triggered.

Bootstrap API endpoint:
```
GET  /api/auth/bootstrap-status   → { bootstrapAvailable: boolean }
POST /api/auth/bootstrap          → creates first user + club, returns { token, user, club }
```

Bootstrap is blocked (403) if any user already exists.

## Tech Stack

- Node.js + npm workspaces
- React 18 + Vite
- Express
- Prisma ORM
- PostgreSQL 16
- Docker (optional, recommended for local database)
- Google Wallet API (optional, for digital membership cards)
- QR code generation and scanning

## Project Structure

```text
.
|- client/          # Frontend app (Vite)
|- server/          # Backend API (Express + Prisma)
|- docker-compose.yml
|- Dockerfile
|- .env.example
```

## Prerequisites

Install these before starting:
- Node.js 24
- npm 10+
- Docker + Docker Compose (for local PostgreSQL)
Quick checks:

```bash
node -v
npm -v
docker --version
docker compose version
```

## 1) Install Dependencies

From the repository root:

```bash
npm install
```

This installs dependencies for all workspaces (`client` and `server`).

## 2) Configure Environment Variables

Create a local env file from the example:

```bash
cp .env.example .env
```

Current variables used by the app:

```env
DATABASE_URL=postgresql://shootingmatch:shootingmatch@localhost:5432/shootingmatch
JWT_SECRET=your-super-secret-jwt-key-change-in-production
NODE_ENV=development
PORT=3000
CLIENT_ORIGIN=http://localhost:5173
TURNSTILE_SECRET_KEY=
VITE_TURNSTILE_SITE_KEY=
GA_MEASUREMENT_ID=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
GOOGLE_DRIVE_OAUTH_CLIENT_ID=
GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=
GOOGLE_DRIVE_OAUTH_REDIRECT_URI=
GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY=
```

### Optional: Google Wallet Membership Cards

To enable digital membership cards via Google Wallet:

1. Create a [Google Wallet business account](https://pay.google.com) and enable API access
2. Generate a service account key in JSON format
3. Extract these fields and add to `.env`:

```env
GOOGLE_WALLET_ISSUER_ID=<issuer_id>
GOOGLE_WALLET_ISSUER_EMAIL=<service_account_email>
GOOGLE_WALLET_PRIVATE_KEY=<private_key_pem>
GOOGLE_WALLET_PRIVATE_KEY_ID=<key_id>
GOOGLE_WALLET_PROJECT_ID=<project_id>
```

When configured, members can:
- Generate QR-coded membership passes with live visit counts
- Add passes to Google Wallet / Apple Wallet via "Save to Wallet" button
- Sign in via QR code at kiosks (tablet-based Camera API scanning)

Club admins can configure:
- Club branding (logo URL, primary/secondary/accent colors)
- Toggle pass issuing on/off
- Toggle membership card kiosk sign-in on/off

Without Google Wallet credentials, the app functions normally; pass issuing is simply unavailable.

### Optional: Google Drive Nightly Backups

Club admins can link a Google Drive account and enable nightly backups from **Club Settings**.

Backups currently include:
- Sign-in history CSV
- Sales ledger CSV
- Competition results CSV

Behavior:
- Files are produced per dataset per month (`YYYY-MM`)
- Current-month files are month-to-date and are updated nightly
- Existing monthly files are only replaced when CSV content fingerprint changes
- No-write runs are recorded as skipped (unchanged)

Required environment variables:

```env
GOOGLE_DRIVE_OAUTH_CLIENT_ID=<google_oauth_client_id>
GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=<google_oauth_client_secret>
GOOGLE_DRIVE_OAUTH_REDIRECT_URI=<public_callback_url_to_/api/clubs/settings/backups/google-drive/callback>
GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY=<32-byte key or base64-encoded 32-byte key>
```

Backup worker schedule tuning (optional):

```env
BACKUP_SCHEDULE_HOUR_UTC=2
BACKUP_SCHEDULE_JITTER_MS=300000
BACKUP_WORKER_CONCURRENCY=2
BACKUP_RUN_ON_STARTUP=false
```

### Optional: Cloudflare Turnstile (Signup Captcha)

To protect signup from automated abuse, configure Cloudflare Turnstile:

1. Create a Turnstile widget in Cloudflare dashboard
2. Add the **secret key** and **site key** to `.env`:

```env
TURNSTILE_SECRET_KEY=<turnstile_secret_key>
VITE_TURNSTILE_SITE_KEY=<turnstile_site_key>
```

Behavior:
- If `TURNSTILE_SECRET_KEY` is set, `POST /api/auth/register` requires a valid Turnstile token
- If `VITE_TURNSTILE_SITE_KEY` is set, the register page renders the Turnstile widget
- Leave both empty to disable captcha in local/dev environments

### Optional: Google Analytics 4 (GA4)

To enable client-side analytics pageview tracking, set either variable:

```env
GA_MEASUREMENT_ID=<your_ga4_measurement_id>
```

Notes:
- `GA_MEASUREMENT_ID` is the preferred runtime variable for server deployment.
- Use a GA4 measurement ID format like `G-XXXXXXXXXX`.

### Optional: Resend Email Delivery (Invites + Password Reset)

To enable server-side invite delivery and password reset emails:

```env
RESEND_API_KEY=<resend_api_key>
RESEND_FROM_EMAIL=<verified_sender@yourdomain.com>
```

Important: the server code does not automatically load `.env` by itself, so for local development load these vars into your shell before running server commands.

```bash
set -a
source .env
set +a
```

## 3) Start PostgreSQL

Start only the database service with Docker:

```bash
docker compose up -d db
```

Check health:

```bash
docker compose ps
```

Stop it later with:

```bash
docker compose stop db
```

## 4) Initialize the Database Schema

Generate Prisma client:

```bash
npm run db:generate
```

Apply schema to local database (development setup):

```bash
npx prisma db push --schema server/prisma/schema.prisma
```

Seed test data:

```bash
npm run db:seed
```

Seed creates demo users:
- Owner: `owner@test.com` / `Password123!`
- Member: `member@test.com` / `Password123!`

## 5) Run the App in Development

Run backend and frontend in separate terminals.

Terminal 1 (server):

```bash
npm run dev:server
```

Terminal 2 (client):

```bash
npm run dev:client
```

Default URLs:
- Frontend: http://localhost:5173
- API: http://localhost:3000

Vite proxies `/api/*` to `http://localhost:3000` in development.

Note: there is no root script named `dev:all` at the moment. Use the two-terminal workflow above.

## Available Root Scripts

```bash
npm run dev:server             # Start server in watch mode
npm run dev:client             # Start Vite dev server
npm run build                  # Build client and server
npm run build:client
npm run build:server
npm run start                  # Start built server (production mode)
npm run db:generate
npm run db:migrate
npm run db:seed
npm run test:server            # Run all backend tests
npm run test:server:unit       # Run backend unit tests
npm run test:server:integration# Run backend integration tests
npm run test:server:coverage   # Run backend tests with coverage report
```

## Production Build and Run (Without Docker)

```bash
npm run build
set -a
source .env
set +a
npm run start
```

In production, the server serves static files from `public/` (built client assets).

## Backend Testing

Backend tests use Vitest + Supertest with two layers:
- Unit tests: middleware and helper behavior
- Integration tests: API routes against PostgreSQL using Prisma migrations

Run tests locally:

```bash
# Start a local test database
docker compose up -d db
## API Endpoints

### Club Settings (Google Wallet Configuration)

Admin-only endpoints for configuring membership pass branding and controls:

```
GET    /api/clubs/:clubId/settings
POST   /api/clubs/:clubId/settings
```

Configuration options:
- `logoUrl` (string) — External URL for club logo displayed on membership card
- `primaryColor` (hex) — Background color for pass header
- `secondaryColor` (hex) — Secondary accent color
- `accentColor` (hex) — Tertiary accent color
- `passIssuingEnabled` (boolean) — Allow members to generate membership passes
- `memberCardSignInEnabled` (boolean) — Allow QR code kiosk sign-in via membership cards
- `ammoDefaultSalesSafeId` (string, nullable) — Optional ammunition safe ID preselected in the ammo sales form

### Membership Passes

Member endpoints for generating and managing digital membership cards:

```
POST   /api/users/me/membership-passes/:clubId
```

Response (when Google Wallet is configured):
- `id` — Membership pass ID
- `qrCode` — Base64-encoded PNG QR code (data URL)
- `visitCount` — Year-to-date visit count
- `addToWalletLink` — Direct URL to save pass to Google Wallet
- `addToWalletJwt` — Raw JWT for custom wallet integration

### Kiosk QR Code Sign-In

Public endpoint for tablet-based kiosk check-ins via QR scan:

```
POST   /api/visits/kiosk/qr-scan
```

Request body:
```json
{
	"qrData": "club:club-id:member:user-id",
	"clubId": "club-id"
}
```

Response on success (201):
```json
{
	"success": true,
	"visitId": "visit-id",
	"userId": "user-id",
	"clubId": "club-id",
	"timeIn": "2026-05-09T14:30:00Z",
	"message": "Successfully signed in via membership card"
}
```

## Production Build and Run (Without Docker)
# Use a dedicated test database URL
export DATABASE_URL=postgresql://shootingmatch:shootingmatch@localhost:5432/shootingmatch_test
export JWT_SECRET=test-secret

# Prepare schema and run tests
npm run db:migrate
npm run test:server:unit
npm run test:server:integration
npm run test:server:coverage
```

## Continuous Integration

GitHub Actions workflows are provided:
- `.github/workflows/ci.yml`: unit tests, integration tests, coverage artifact, workspace builds, docker build smoke
- `.github/workflows/docker-publish.yml`: buildx publish to Docker Hub with tags

Docker publish uses repository:
- `iammind/rifle-club-manager`

Tag behavior:
- `sha-<commit>` on pushes
- branch tags on branch pushes
- `latest` on default branch

Required repository secrets for publish:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## Run With Docker Compose

Build and run full stack:

```bash
docker compose up --build
```

App URL:
- http://localhost:3000

Notes:
- Docker compose provides `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, and `PORT` to the app container.
- Docker compose also provides a separate `backup-worker` container for nightly Drive backups.
- If schema is not initialized yet, run Prisma setup once before relying on the containerized app.

## Runtime Configuration

Frontend configuration (API URL, Turnstile site key) is loaded at runtime from `/api/config` endpoint:

```bash
# Local development
VITE_API_URL=http://localhost:3000 npm run dev:client

# Docker with runtime config
docker run \
  -e VITE_API_URL=https://api.example.com \
  -e VITE_TURNSTILE_SITE_KEY=your-turnstile-key \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... \
  -p 3000:3000 \
  iammind/rifle-club-manager
```

**Benefits:**
- ✅ No rebuild needed when config changes
- ✅ Docker users can pass environment variables directly
- ✅ Config values are fetched at app startup, not build time
- ✅ Easy to add new config options to `server/src/app.ts`

## Migration Note

### Removing global user roles (v2+)

Migration `20260511000000_remove_global_role_add_probationary` performs the following changes:

- Adds `PROBATIONARY_MEMBER` to the `MembershipRole` enum (backward-compatible, no row rewrites).
- Drops the `role` column from the `User` table (was `OWNER | ADMIN | MEMBER`).
- Drops the now-unused `Role` enum type.

**Before running in production:**

1. Ensure all application instances are updated before applying the migration (the old code reads `user.role`; the new code does not).
2. Apply with `npm run db:migrate` — no data will be lost; only the `role` column is removed.
3. Roll back: restore from a pre-migration snapshot if needed. SQL rollback would need to re-add the column with a default:
   ```sql
   CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
   ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'MEMBER';
   ```

## Troubleshooting

### `npm run dev:all` fails

Expected in current setup because that script is not defined. Start `dev:server` and `dev:client` separately.

### CORS errors in browser

Ensure `CLIENT_ORIGIN` in `.env` matches your frontend URL (default `http://localhost:5173`) and restart the server.

## License

This project is licensed under the **Functional Source License (FSL) 1.1** with a **Future MIT License**. 

Under the FSL-1.1 license, you may use this software for non-commercial purposes and internal business use. Commercial use that competes with the Software requires a separate license agreement.

Automatically, two years from the initial release date, this software will be licensed under the MIT License, at which point all commercial use will be permitted without restriction.

For full license details, see [LICENSE](LICENSE).


### Database connection errors

Check that PostgreSQL container is healthy:

```bash
docker compose ps
```

Then verify `DATABASE_URL` points to `localhost:5432` for local dev.

### Prisma client out of date

Regenerate after schema changes:

```bash
npm run db:generate
```
