# Stage 1: Install full workspace dependencies
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm ci

# Stage 2: Build workspace artifacts and generate Prisma client
FROM deps AS builder
COPY server ./server
COPY client ./client
RUN npm run db:generate --workspace=server
RUN npm run build

# Stage 3: Install production runtime deps for server workspace
FROM node:24-bookworm-slim AS production-deps
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm ci --omit=dev --workspace=server \
  && rm -rf node_modules/prisma node_modules/.bin/prisma

# Stage 4: Prisma migrator
FROM node:24-bookworm-slim AS migrator
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY server/package*.json ./server/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/server/prisma ./server/prisma

ENTRYPOINT ["npx", "prisma", "migrate", "deploy", "--schema=server/prisma/schema.prisma"]

# Stage 5: Distroless production runtime
FROM gcr.io/distroless/nodejs24-debian12 AS app
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./public

USER nonroot:nonroot
EXPOSE 3000
CMD ["server/dist/index.js"]
