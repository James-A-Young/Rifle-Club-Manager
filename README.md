# Rifle Club Manager

Rifle Club Manager is a full-stack TypeScript app for managing club members, sign-ins, firearms, and visit logs.

It is organized as an npm workspace with:
- `client`: React + Vite frontend
- `server`: Express + Prisma + PostgreSQL backend

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
set -a
source .env.example
set +a
npm run dev:server
```

Terminal 2 (client):

```bash
set -a
source .env.example
set +a
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
- If schema is not initialized yet, run Prisma setup once before relying on the containerized app.

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
