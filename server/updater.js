// server/updater.js
// ─────────────────────────────────────────────────────────────────────────────
// Read-only update checker. Compares local git commit with GitHub's latest.
// No shell commands, no code execution. Just a boolean: is there a newer version?
// ─────────────────────────────────────────────────────────────────────────────

const { execSync } = require('child_process');
const path = require('path');

const CHECK_INTERVAL = 48 * 60 * 60 * 1000; // 48 hours
const PROJECT_ROOT = path.resolve(__dirname, '..');

function getRepoSlug() {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    const match = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const repoSlug = getRepoSlug();
const API_URL = repoSlug ? `https://api.github.com/repos/${repoSlug}/commits/main` : null;

let status = {
  updateAvailable: false,
  currentCommit: '',
  checkedAt: null,
};

function getLocalCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function checkForUpdate() {
  try {
    if (!API_URL) return;

    const localCommit = getLocalCommit();
    if (!localCommit) return;

    const res = await fetch(API_URL, {
      headers: { 'User-Agent': 'tab-out-updater' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return;

    const data = await res.json();
    const remoteCommit = data.sha;

    status = {
      updateAvailable: remoteCommit && localCommit !== remoteCommit,
      currentCommit: localCommit.slice(0, 7),
      checkedAt: new Date().toISOString(),
    };

    if (status.updateAvailable) {
      console.log(`[updater] Update available (local: ${localCommit.slice(0, 7)}, remote: ${remoteCommit.slice(0, 7)})`);
    }
  } catch {
    // Fail silently -- offline, rate limited, private repo, etc.
  }
}

function startUpdateChecker() {
  checkForUpdate();
  setInterval(checkForUpdate, CHECK_INTERVAL);
}

function getUpdateStatus() {
  return status;
}

module.exports = { startUpdateChecker, getUpdateStatus };
