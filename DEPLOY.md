# Deploy

Production setup, backups, rollback, and the pre-event checklist are in [docs/SERVER-SETUP.md](docs/SERVER-SETUP.md).

The site is `https://know-me.hobbybin.xyz` on `165.22.236.40`. One app container and one Caddy container run from `/opt/know-me`. The app container is a single process: SQLite and the live channel live there.

GitHub Actions runs the tests on every push and pull request. After those tests pass, a push to `main` SSHes to the droplet and runs:

```bash
cd /opt/know-me
git pull --ff-only
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

The deploy job skips cleanly when the `DROPLET_HOST` secret is missing. The other secrets are `DROPLET_USER` and `SSH_PRIVATE_KEY`. The server `.env` contains `DOMAIN=know-me.hobbybin.xyz` only. This game has no host password and no fixed room code.
