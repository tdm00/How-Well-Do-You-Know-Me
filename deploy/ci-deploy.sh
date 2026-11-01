#!/usr/bin/env bash
# Deploy job entrypoint. Skips cleanly when droplet secrets are absent
# so pull-request CI can stay green.
set -euo pipefail

if [[ -z "${DROPLET_SSH_KEY:-}" || -z "${DROPLET_HOST:-}" || -z "${DROPLET_USER:-}" ]]; then
  echo "Droplet secrets are not configured. Skipping deploy."
  exit 0
fi

APP_DIR="${DROPLET_APP_DIR:-/var/www/do-you-know-me}"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
printf '%s\n' "$DROPLET_SSH_KEY" > "$HOME/.ssh/droplet_key"
chmod 600 "$HOME/.ssh/droplet_key"

SSH=(ssh -i "$HOME/.ssh/droplet_key" -o StrictHostKeyChecking=accept-new)
"${SSH[@]}" "$DROPLET_USER@$DROPLET_HOST" "mkdir -p '$APP_DIR'"
rsync -az \
  --exclude node_modules \
  --exclude .next \
  --exclude data \
  --exclude .git \
  --exclude playwright-report \
  --exclude test-results \
  -e "ssh -i $HOME/.ssh/droplet_key -o StrictHostKeyChecking=accept-new" \
  ./ "$DROPLET_USER@$DROPLET_HOST:$APP_DIR/"
"${SSH[@]}" "$DROPLET_USER@$DROPLET_HOST" "APP_DIR='$APP_DIR' bash '$APP_DIR/deploy/restart.sh'"
