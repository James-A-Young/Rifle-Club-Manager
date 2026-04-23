# Stage 1: Build client
FROM node:24-alpine AS client-build
WORKDIR /app
COPY client/package*.json ./client/
COPY package*.json ./
RUN npm install --workspace=client
COPY client ./client
RUN npm run build:client

# Stage 2: Build server
FROM node:24-alpine AS server-build
WORKDIR /app
COPY server/package*.json ./server/
COPY package*.json ./
RUN npm install --workspace=server
COPY server ./server
RUN npm run build:server

# Stage 3: Production
FROM node:24-alpine AS production
WORKDIR /app
COPY --from=server-build /app/server/package*.json ./server/
COPY package*.json ./
RUN npm install --workspace=server --omit=dev
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/prisma ./server/prisma
COPY --from=client-build /app/client/dist ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
