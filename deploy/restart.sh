#!/usr/bin/env bash
# Run on the droplet after the app files are in place.
# Restarts the process that already sits behind the web server.
set -euo pipefail

cd "${APP_DIR:-/var/www/do-you-know-me}"
npm ci
npm run build

restarted=0
if command -v systemctl >/dev/null 2>&1 && sudo systemctl restart do-you-know-me; then
  echo "Restarted systemd unit do-you-know-me"
  restarted=1
fi
if [[ "$restarted" -eq 0 ]] && command -v pm2 >/dev/null 2>&1 && pm2 restart do-you-know-me; then
  echo "Restarted pm2 process do-you-know-me"
  restarted=1
fi
if [[ "$restarted" -eq 0 ]]; then
  echo "Could not restart a process named do-you-know-me. See DEPLOY.md."
  exit 1
fi
