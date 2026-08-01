#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
npm run db:migrate

echo "[entrypoint] Starting API server..."
exec node dist/server.js
