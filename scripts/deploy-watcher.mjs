// Auto-deploy watcher — chạy dưới PM2 (app "cf-deploy").
// Poll origin/main mỗi 60s: có commit mới + working tree sạch → pull, build cả 2 phía, restart PM2.
// An toàn: chỉ restart sau khi CẢ HAI build thành công; tree bẩn thì bỏ qua (không clobber code đang sửa).
import { execSync } from "node:child_process";

const REPO = "C:/XT/tl-cf";
const BRANCH = "main";
const INTERVAL_MS = 60_000;

let busy = false;

const sh = (cmd, cwd = REPO) =>
  execSync(cmd, { cwd, stdio: "pipe", encoding: "utf8", timeout: 15 * 60_000 }).trim();
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

function tick() {
  if (busy) return;
  busy = true;
  try {
    sh(`git fetch origin ${BRANCH}`);
    const local = sh("git rev-parse HEAD");
    const remote = sh(`git rev-parse origin/${BRANCH}`);
    if (local === remote) return;

    const dirty = sh("git status --porcelain");
    if (dirty) {
      log(`SKIP ${remote.slice(0, 7)}: working tree có ${dirty.split("\n").length} thay đổi chưa commit`);
      return;
    }

    log(`Deploying ${local.slice(0, 7)} → ${remote.slice(0, 7)}`);
    sh(`git merge --ff-only origin/${BRANCH}`);

    // Cài lại deps chỉ khi lockfile đổi
    const changed = sh(`git diff --name-only ${local} ${remote}`);
    if (changed.includes("node-backend/package-lock.json")) {
      log("npm ci (backend)…");
      sh("npm ci", `${REPO}/node-backend`);
    }
    if (changed.includes("frontend/package-lock.json")) {
      log("npm ci (frontend)…");
      sh("npm ci", `${REPO}/frontend`);
    }

    log("Building backend…");
    sh("npm run build", `${REPO}/node-backend`);
    log("Building frontend…");
    sh("npm run build", `${REPO}/frontend`);

    sh("pm2 restart cf-backend cf-frontend");
    log(`✓ Deployed ${remote.slice(0, 7)}`);
  } catch (err) {
    // Build fail → không restart, bản cũ vẫn chạy (trừ frontend dist bị vite dọn — xem PROCESS.md)
    log(`✗ Deploy FAILED: ${err.message}`);
  } finally {
    busy = false;
  }
}

log(`Deploy watcher started — poll origin/${BRANCH} mỗi ${INTERVAL_MS / 1000}s`);
tick();
setInterval(tick, INTERVAL_MS);
