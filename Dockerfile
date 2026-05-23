# Stage 1: Common Node.js base for Prisma-aware stages
FROM node:24-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Stage 2: Install full workspace dependencies
FROM base AS deps
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm ci

# Stage 3: Build workspace artifacts and generate Prisma client
FROM deps AS builder
COPY server ./server
COPY client ./client
RUN DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run db:generate --workspace=server
RUN npm run build

# Stage 4: Install production runtime deps for server workspace
FROM base AS production-deps
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm ci --omit=dev --workspace=server \
  && rm -rf node_modules/prisma node_modules/.bin/prisma

# Stage 5: Prisma migrator
FROM base AS migrator
ENV NODE_ENV=production
WORKDIR /app/server

COPY package*.json /app/
COPY server/package*.json ./
COPY server/prisma.config.ts ./
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=builder /app/server/prisma ./prisma

ENTRYPOINT ["npx", "prisma", "migrate", "deploy"]

# Stage 6: Distroless production runtime
FROM gcr.io/distroless/nodejs24-debian12 AS app
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS=--experimental-specifier-resolution=node

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./public

USER nonroot:nonroot
EXPOSE 3000
CMD ["server/dist/index.js"]

# Stage 7: Distroless backup worker runtime
FROM gcr.io/distroless/nodejs24-debian12 AS backup-worker
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--experimental-specifier-resolution=node

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/server/dist ./server/dist

USER nonroot:nonroot
CMD ["server/dist/backupWorker.js"]
