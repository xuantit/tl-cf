# syntax=docker/dockerfile:1

# --- Build stage -----------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Install all deps (incl. dev deps needed to compile TS and run drizzle-kit)
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime stage ---------------------------------------------------------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# node_modules from the builder keeps drizzle-kit available so migrations
# can run at container start via the entrypoint.
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 9000
ENTRYPOINT ["./docker-entrypoint.sh"]
