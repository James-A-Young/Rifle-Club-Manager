# Deploy Guide (Self-Hosting & Operations)

## Overview
Rifle Club Manager is a monorepo with two workspaces:
- **client**: React + Vite frontend
- **server**: Express API + Prisma ORM

In production:
- The client is built into static files and served by the server from `/public`.
- PostgreSQL is the system database.
- The Docker image is multi-stage and runs on `gcr.io/distroless/nodejs24-debian12` as a **non-root** user (`nonroot:nonroot`).

## Prerequisites
- Docker 24+
- Docker Compose v2
- A domain name and TLS termination strategy (recommended)
- Optional: Cloudflare Turnstile account (signup captcha)
- Optional: Google Wallet issuer/service-account credentials (membership passes)

## Environment Variables
Create a `.env` from `.env.example` and set values appropriately.

| Variable | Required | Description |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma. |
| `JWT_SECRET` | Yes | JWT signing secret. Must be **at least 32 characters**. |
| `NODE_ENV` | Yes | Use `production` in production deployments. |
| `PORT` | Yes | Server listen port (default `3000`). |
| `CLIENT_ORIGIN` | Yes | Allowed browser origin for CORS + CSRF origin checks. |
| `TURNSTILE_SECRET_KEY` | Optional | Enables server-side Turnstile verification on registration. |
| `VITE_TURNSTILE_SITE_KEY` | Optional | Enables Turnstile widget on the register page. |
| `VITE_GA_MEASUREMENT_ID` | Optional | GA4 measurement ID for client-side analytics. |
| `GOOGLE_WALLET_ISSUER_ID` | Optional | Google Wallet issuer ID for pass issuance. |
| `GOOGLE_WALLET_ISSUER_EMAIL` | Optional | Google service account email for Wallet API. |
| `GOOGLE_WALLET_PRIVATE_KEY` | Optional | Google service account private key (PEM, escaped newlines). |
| `GOOGLE_WALLET_PRIVATE_KEY_ID` | Optional | Private key ID associated with the service account key. |
| `GOOGLE_WALLET_PROJECT_ID` | Optional | Google Cloud project ID. |

> Notes:
> - `GOOGLE_WALLET_CLIENT_ID` is referenced by the Wallet service if present, but is not listed in `.env.example`.
> - If Wallet credentials are absent, core app features still work; pass issuance is just unavailable.

## Step-by-Step Docker Compose Setup

### 1) Clone and enter the repository
```bash
git clone https://github.com/James-A-Young/Rifle-Club-Manager.git
cd Rifle-Club-Manager
```

### 2) Create and edit `.env`
```bash
cp .env.example .env
```

Update at least:
- `DATABASE_URL` (use your production DB credentials)
- `JWT_SECRET` (>= 32 chars, high entropy)
- `NODE_ENV=production`
- `CLIENT_ORIGIN=https://your-domain.example`

### 3) Harden Docker Compose defaults
The bundled `docker-compose.yml` is functional for development but should be hardened for production:
- Change `POSTGRES_PASSWORD`
- Prefer removing `db` port publishing (`5432:5432`) unless strictly needed

### 4) Start services
```bash
docker compose up -d --build
```

### 5) Apply database migrations
The production runtime image is distroless and does not bundle Prisma CLI tooling for ad-hoc migration commands inside the app container.

Run migrations from a trusted release environment (CI or host checkout) with the same `DATABASE_URL`:
```bash
npm ci
npm run db:generate
npm run db:migrate --workspace=server
```

### 6) Verify service health
```bash
docker compose ps
curl -i http://localhost:3000
```

## Persistence (Volumes)
The Compose file uses a named volume:
- `postgres_data:/var/lib/postgresql/data`

This is where PostgreSQL data persists across container restarts.

Inspect volume wiring:
```bash
docker volume ls
docker volume inspect <project>_postgres_data
```

> Avoid bind-mounting over `/var/lib/postgresql/data` unless you fully control filesystem ownership, permissions, and backup consistency.

## Security Best Practices
- **Keep non-root execution**: do not override `USER nonroot:nonroot` in the production image.
- **Use TLS**: place a reverse proxy (Caddy/Nginx/Traefik) in front of the app.
- **Protect secrets**: rotate `JWT_SECRET` periodically; store secrets in your platform secret manager.
- **Set `NODE_ENV=production`**: this enables secure cookie behavior (`Secure`) and expected production hardening.
- **Set correct `CLIENT_ORIGIN`**: CSRF protection validates `Origin` for state-changing cookie-auth requests.
- **Restrict database exposure**: keep PostgreSQL private to the Docker network whenever possible.
- **Monitor security logs**: audit events are emitted as structured JSON to container stdout/stderr.

## Backup & Recovery

### 3-2-1 Backup Rule
Use the **3-2-1 rule**:
1. Keep at least **3 copies** of data.
2. Store copies on **2 different media/systems**.
3. Keep **1 copy off-site/offline**.

### Database dump (`pg_dump`)
Create a logical backup from the running DB container:
```bash
docker compose exec -T db pg_dump \
  -U shootingmatch \
  -d shootingmatch \
  --format=custom \
  --file=/tmp/rifle-club-manager.dump

docker compose cp db:/tmp/rifle-club-manager.dump ./backups/rifle-club-manager-$(date +%F).dump
```

### Restore from dump
```bash
cat ./backups/rifle-club-manager-YYYY-MM-DD.dump | docker compose exec -T db pg_restore \
  -U shootingmatch \
  -d shootingmatch \
  --clean \
  --if-exists
```

### Volume snapshot approach
For crash-consistent volume snapshots:
1. Stop write activity (or stop app + db).
2. Snapshot/archive the Docker volume data directory.
3. Store snapshots in immutable/off-site storage.

Example archive flow:
```bash
docker compose stop
sudo tar -czf postgres_data_$(date +%F).tar.gz /var/lib/docker/volumes/<project>_postgres_data/_data
docker compose start
```

### Suggested schedule
- Nightly `pg_dump` logical backups
- Weekly encrypted off-site copy
- Monthly restore drills to validate recovery procedures

## Upgrading
1. Pull latest code/image.
2. Rebuild and restart:
   ```bash
   docker compose up -d --build
   ```
3. Run DB migrations (`npm run db:migrate --workspace=server`) using the new release code.
4. Verify app startup and key workflows.
