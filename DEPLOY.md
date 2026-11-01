# Deploy checklist

The GitHub Action does not create a server, DNS record, or web server. It only copies this app onto a droplet you already prepared and restarts the process behind the site that is already listening for `do-you-know-me.hobbybin.xyz`.

The deploy job runs only after tests pass, and only on a push to `main`. On pull requests it does not run. If the droplet secrets are missing, the job prints a skip message and exits successfully.

## Secrets

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Required | What it is |
| --- | --- | --- |
| `DROPLET_SSH_KEY` | yes | Private SSH key that can log in. Paste the PEM, including line breaks. |
| `DROPLET_HOST` | yes | Droplet hostname or IP. |
| `DROPLET_USER` | yes | SSH user that can write the app directory. |
| `DROPLET_APP_DIR` | no | App directory. Defaults to `/var/www/do-you-know-me`. |

## What must already be true

- DNS for `do-you-know-me.hobbybin.xyz` points at the droplet.
- A web server (nginx, Caddy, or similar) is already listening on 443 for that hostname and proxies to `127.0.0.1:3000`.
- For live updates, turn proxy buffering off for this site. Example nginx location:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header Connection "";
  proxy_buffering off;
  proxy_cache off;
}
```

- Node.js 22, npm, `rsync`, and build tools for `better-sqlite3` (`python3`, `make`, `g++`) are installed.
- The SSH user can write `DROPLET_APP_DIR`. The `data/` directory is left in place so the SQLite file survives a deploy.
- Exactly one Node process serves the app. SQLite and the live channel are in that process. Do not run multiple instances.
- A process named `do-you-know-me` is already defined. The restart script tries `sudo systemctl restart do-you-know-me`, then `pm2 restart do-you-know-me`.
- If you use systemd, passwordless sudo for that restart is required. A sample unit is `deploy/do-you-know-me.service`. Copy and edit it yourself. The Action will not install it.

## What the Action does

1. Run unit, integration, and end-to-end tests.
2. On `main` only, `rsync` the repo to the droplet (skipping `node_modules`, `.next`, and `data`).
3. On the droplet, `npm ci`, `npm run build`, and restart `do-you-know-me`.
