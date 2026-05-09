# Stage 1: Build workspace artifacts
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm ci
COPY server ./server
COPY client ./client
RUN npm run db:generate --workspace=server
RUN npm run build

# Stage 2: Install runtime deps for server workspace
FROM node:24-bookworm-slim AS runtime-deps
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm ci --omit=dev --workspace=server

# Stage 3: Distroless production runtime
FROM gcr.io/distroless/nodejs24-debian12 AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/client/dist ./public

USER nonroot:nonroot
EXPOSE 3000
CMD ["server/dist/index.js"]
