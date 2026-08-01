// PM2 process file for manual (non-Docker) deployment.
// Usage from the node-backend/ directory:
//   npm install --include=dev && npm run build && npm run db:migrate
//   pm2 start ecosystem.config.cjs
//
// Environment variables are loaded from node-backend/.env automatically
// (env.ts imports "dotenv/config"), so no need to duplicate them here.
module.exports = {
  apps: [
    {
      name: "cf-backend",
      script: "dist/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
