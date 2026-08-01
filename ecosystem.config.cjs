// PM2 process definitions for the VPS (same-domain deployment).
// Must be .cjs because node-backend/package.json is "type": "module".
//
// Usage on the VPS:
//   cd node-backend && npm ci && npm run build && npm run db:migrate
//   cd ../frontend  && npm ci && npm run build
//   pm2 start ecosystem.config.cjs
//   pm2 save            # persist across reboots
//   pm2 startup         # generate the boot script (run the printed command once)
//
// Put a reverse proxy (nginx/Caddy) in front of cf.mmthui.xyz:
//   /api/*  -> http://127.0.0.1:9000
//   /       -> http://127.0.0.1:5000   (the static frontend below)

module.exports = {
  apps: [
    {
      name: "cf-backend",
      cwd: "./node-backend",
      script: "dist/server.js",
      // In-memory caches + job recovery assume a single process — keep fork mode.
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        // PORT and all secrets are read from node-backend/.env via dotenv.
      },
    },
    {
      // PM2's built-in static server (no extra package needed).
      name: "cf-frontend",
      script: "serve",
      env: {
        PM2_SERVE_PATH: "./frontend/dist",
        PM2_SERVE_PORT: 5000,
        PM2_SERVE_SPA: "true", // SPA fallback to index.html for client-side routing
      },
    },
  ],
};
