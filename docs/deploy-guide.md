# Deploy Guide (Self-Hosting & Operations)

## Overview
Rifle Club Manager ships as two Docker images published to Docker Hub:

| Image | Purpose |
|---|---|
| `iammind/rifle-club-manager` | Production app (distroless, non-root) |
| `iammind/rifle-club-manager-migrator` | One-shot Prisma migration runner |

No repository clone is required. You only need Docker, Docker Compose, and the files described below.

PostgreSQL is the system database. The app image runs on `gcr.io/distroless/nodejs24-debian12` as a **non-root** user (`nonroot:nonroot`) and has **no shell or Prisma CLI** — it cannot run migrations. The dedicated migrator image handles schema creation and incremental migrations before the app starts.

## Prerequisites
- Docker 24+
- Docker Compose v2
- A domain name and TLS termination strategy (recommended)
- Optional: Cloudflare Turnstile account (signup captcha)
- Optional: Google Wallet issuer/service-account credentials (membership passes)

## Environment Variables

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
> - `GOOGLE_WALLET_CLIENT_ID` is referenced by the Wallet service if present.
> - If Wallet credentials are absent, core app features still work; pass issuance is just unavailable.

## Step-by-Step Docker Compose Setup

### 1) Create a deployment directory
```bash
mkdir rifle-club-manager && cd rifle-club-manager
```

### 2) Create `docker-compose.yml`
Create the following file, replacing placeholder values marked with `# <-- change this`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: shootingmatch
      POSTGRES_PASSWORD: a-strong-password   # <-- change this
      POSTGRES_DB: shootingmatch
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shootingmatch"]
      interval: 5s
      timeout: 5s
      retries: 5

  migrator:
    image: iammind/rifle-club-manager-migrator:latest
    environment:
      DATABASE_URL: postgresql://shootingmatch:a-strong-password@db:5432/shootingmatch  # <-- match POSTGRES_PASSWORD above
    depends_on:
      db:
        condition: service_healthy
    restart: "no"

  app:
    image: iammind/rifle-club-manager:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://shootingmatch:a-strong-password@db:5432/shootingmatch  # <-- match POSTGRES_PASSWORD above
      JWT_SECRET: replace-with-32-plus-chars-of-high-entropy  # <-- change this
      NODE_ENV: production
      PORT: "3000"
      CLIENT_ORIGIN: https://your-domain.example  # <-- change this
    depends_on:
      migrator:
        condition: service_completed_successfully

volumes:
  postgres_data:
```

### How migrations work
The **migrator** service runs `prisma migrate deploy` against the database and exits with code 0 on success. Docker Compose's `service_completed_successfully` condition ensures the **app** service does not start until the migrator has finished. This means:

- On a fresh database the migrator creates all tables, enums, and indexes from scratch.
- On an existing database it applies only the new migrations since the last deployment — in order, without repeating anything (Prisma tracks applied migrations in the `_prisma_migrations` table).
- If the migrator exits non-zero (e.g. DB unreachable or SQL error) the app will not start, protecting you from running against a broken schema.

The app image has **no DDL permissions requirement** at runtime — it only needs `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the tables. If you want to enforce this at the database level, create two roles (one for the migrator with DDL, one for the app with DML only) and use separate connection strings in the compose file.

### 3) Pull images and start
```bash
docker compose pull
docker compose up -d
```

Docker Compose will:
1. Start and health-check `db`.
2. Run `migrator` (applies any pending migrations, then exits).
3. Start `app` once the migrator has completed successfully.

### 4) Verify service health
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
1. Pull the latest images:
   ```bash
   docker compose pull
   ```
2. Restart all services:
   ```bash
   docker compose up -d
   ```
   Docker Compose will re-run the migrator with the new image (applying any new migration files) before starting the updated app container.
3. Verify app startup and key workflows:
   ```bash
   docker compose ps
   curl -i http://localhost:3000
   ```
