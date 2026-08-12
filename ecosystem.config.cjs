// PM2 process definitions — Windows 365 Cloud PC host, published via Cloudflare Tunnel.
// Must be .cjs because node-backend/package.json is "type": "module".
//
// Usage:
//   cd node-backend && npm run build   (backend dist/)
//   cd frontend && npm run build       (frontend dist/)
//   pm2 start ecosystem.config.cjs
//   pm2 save
//
// Cloudflare Tunnel ingress (same domain cf.mmthui.xyz):
//   /api/*  -> http://localhost:9000   (cf-backend)
//   /*      -> http://localhost:8080   (cf-frontend)

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
      // Node 24's baseline RSS is ~250MB here — 300M caused a restart loop.
      max_memory_restart: "1G",
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
        PM2_SERVE_PORT: 8080,
        PM2_SERVE_SPA: "true", // SPA fallback to index.html for client-side routing
      },
    },
    {
      // Cloudflare Tunnel — run under PM2 (as this user) instead of a Windows
      // service: the SYSTEM service can't see the user-profile config/cert.
      name: "cf-tunnel",
      script: "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
      args: ["--config", "C:\\Users\\365Sv3\\.cloudflared\\config.yml", "tunnel", "run"],
      interpreter: "none",
      autorestart: true,
    },
  ],
};
