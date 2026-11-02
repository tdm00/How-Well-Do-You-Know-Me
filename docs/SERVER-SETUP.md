# Server setup and deployment

This runbook starts with a newly created Ubuntu 24.04 DigitalOcean Droplet and ends with automatic deployments from GitHub. The production server runs one How Well Do You Know Me app container and one Caddy container. Caddy obtains and renews the TLS certificate for `know-me.hobbybin.xyz`.

Do not run more than one app container. The app uses one SQLite database, and the TV and host live channel is held in that same process. Do not scale the app service and do not put a second Node process behind Caddy.

## Values used in this guide

| Item | Value |
| --- | --- |
| Droplet IPv4 | `165.22.236.40` |
| Hostname | `know-me.hobbybin.xyz` |
| Repository | `tdm00/How-Well-Do-You-Know-Me` |
| Deploy user | `deploy` |
| App directory | `/opt/know-me` |
| Public URL | `https://know-me.hobbybin.xyz` |

You need:

- Root SSH access to the new Droplet using an SSH key.
- Control of the DNS for `hobbybin.xyz`.
- Admin access to the GitHub repository.
- A local workstation with `ssh` and `ssh-keygen`.

Two separate SSH keys are used:

1. **GitHub Actions key:** GitHub Actions uses its private key to log in to the Droplet. Its public key is in the Droplet user's `authorized_keys`.
2. **Repository deploy key:** The Droplet uses its private key to pull the repository. Its public key is a read-only deploy key in GitHub.

Do not reuse either key for personal SSH access.

This game has no host password and no fixed room code. The host creates the room in the browser. Do not invent those values or store them in `.env` or in GitHub secrets.

## 1. Point DNS at the Droplet

At the DNS provider, create:

- Type: `A`
- Name: `know-me`
- Value: `165.22.236.40`
- TTL: `300` while setting up

Only add an `AAAA` record if IPv6 is configured and reachable on the Droplet. An incorrect `AAAA` record can prevent Caddy from obtaining a certificate.

DNS can take time to propagate. Check it from the workstation:

```bash
dig +short know-me.hobbybin.xyz A
```

Continue when it returns `165.22.236.40`. Ports 80 and 443 must be reachable before the first Caddy start.

## 2. Create the deployment user

Connect as root:

```bash
ssh root@165.22.236.40
```

Update the server and install basic administration tools:

```bash
apt update
apt full-upgrade -y
apt install -y ca-certificates curl git openssl ufw unattended-upgrades fail2ban
```

Create a non-root user. Give it a strong password and save that password in a password manager. SSH password login will be disabled, but the password is still used for `sudo`. Then copy the root user's initial SSH authorization:

```bash
adduser deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

In a second workstation terminal, verify the new account before changing SSH settings:

```bash
ssh deploy@165.22.236.40
sudo whoami
```

`sudo whoami` must print `root`. Keep the original root session open until SSH hardening is verified.

## 3. Configure the firewall and SSH

On the Droplet, allow SSH before enabling the firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Create an SSH hardening drop-in:

```bash
sudo tee /etc/ssh/sshd_config.d/99-know-me.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
```

Validate and reload SSH:

```bash
sudo sshd -t
sudo systemctl reload ssh
```

Open another new connection and confirm `deploy` can still log in:

```bash
ssh deploy@165.22.236.40
```

Do not close the original root session until this succeeds.

Enable security updates and intrusion protection:

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
sudo systemctl enable --now fail2ban
sudo systemctl status fail2ban --no-pager
```

If the DigitalOcean cloud firewall is enabled, allow inbound TCP 22, 80, and 443 there as well.

## 4. Install Docker Engine and Compose

Run the following on the Droplet as `deploy`. These commands use Docker's official Ubuntu repository:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker deploy
```

Limit Docker's local JSON logs so they cannot consume the disk:

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
sudo systemctl restart docker
```

Log out and reconnect so the new `docker` group takes effect:

```bash
exit
ssh deploy@165.22.236.40
docker version
docker compose version
docker run --rm hello-world
```

Membership in the `docker` group effectively grants root-level access. Only trusted administrators should belong to it.

## 5. Give the Droplet read-only repository access

On the Droplet, generate a dedicated repository key:

```bash
ssh-keygen -t ed25519 \
  -C "know-me production read-only" \
  -f ~/.ssh/id_ed25519_github \
  -N ""
cat ~/.ssh/id_ed25519_github.pub
```

Copy the displayed public key. In GitHub:

1. Open the `tdm00/How-Well-Do-You-Know-Me` repository.
2. Open **Settings → Deploy keys → Add deploy key**.
3. Title it `Know Me production Droplet`.
4. Paste the public key.
5. Leave **Allow write access** unchecked.
6. Add the key.

Configure SSH on the Droplet to use that key:

```bash
cat >~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com
```

On first connection, compare the shown host-key fingerprint with GitHub's published SSH fingerprints before accepting it. A successful test says authentication succeeded and that GitHub does not provide shell access.

## 6. Clone the application

Create the fixed deployment directory expected by GitHub Actions:

```bash
sudo install -d -m 755 -o deploy -g deploy /opt/know-me
git clone --branch main --single-branch \
  git@github.com:tdm00/How-Well-Do-You-Know-Me.git \
  /opt/know-me
cd /opt/know-me
git status
```

The branch must be `main`, and the working tree should be clean.

## 7. Create the environment file and persistent storage

Create the data directory before starting the containers. The clone already contains `data/sample-questions.csv`. The SQLite file will be created beside it.

```bash
cd /opt/know-me
install -d -m 700 data
umask 077
printf 'DOMAIN=know-me.hobbybin.xyz\n' > .env
chmod 600 .env
```

Confirm that the file contains only the domain, without printing extra secrets:

```bash
cut -d= -f1 .env
```

The only expected key is `DOMAIN`.

Important behavior:

- `.env` stays only on the Droplet and is ignored by Git. It holds `DOMAIN=know-me.hobbybin.xyz` and nothing else.
- `data/` stays only on the Droplet and is mounted into the app container at `/app/data`.
- Compose sets `DATABASE_PATH=/app/data/game.db`, `PORT=3000`, and `NODE_ENV=production`. They do not belong in `.env`.
- There is no host password and no fixed room code. The host creates a room from `/host`, and players join with the code shown on that screen.
- Do not add a host password, room code, or session secret to `.env` or to GitHub.

## 8. Perform the first deployment

From `/opt/know-me`, validate the rendered Compose configuration:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml config
```

Make sure the rendered `DOMAIN` is `know-me.hobbybin.xyz`. Build and start one app container and one Caddy container:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
docker compose --env-file .env -f deploy/docker-compose.yml ps
```

The app should become `healthy`, then Caddy should start. Do not start a second app container. Watch initial logs:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml logs -f \
  --tail=100 app caddy
```

Press `Ctrl-C` to stop following logs. This does not stop the containers.

Caddy proxies to the app on port 3000 and flushes responses immediately so server-sent events for the TV and host are not buffered. Certificates are stored in the named Caddy volumes.

Verify locally on the Droplet:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml exec -T app \
  node -e "fetch('http://127.0.0.1:3000/health').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1) })"
```

Verify HTTPS from the workstation:

```bash
curl -fsS https://know-me.hobbybin.xyz/health
```

The body is `{"ok":true}`.

Then open these routes in a browser:

- `https://know-me.hobbybin.xyz/` — how to play, with links to host, phone, and TV
- `https://know-me.hobbybin.xyz/host` — create the room, build teams, and judge matches
- `https://know-me.hobbybin.xyz/play` — phone join, answers, and lock
- `https://know-me.hobbybin.xyz/tv` — question, reveals, and standings

Create a room, join from two phones, put them on one team of two, lock both answers, mark a match, confirm the TV standings change, then undo that mark. Restart the app and confirm the room is still there:

```bash
cd /opt/know-me
docker compose --env-file .env -f deploy/docker-compose.yml restart app
docker compose --env-file .env -f deploy/docker-compose.yml ps
```

## 9. Create the GitHub Actions SSH key

Run this section on the administrator workstation, not on the Droplet:

```bash
ssh-keygen -t ed25519 \
  -C "know-me GitHub Actions" \
  -f ~/.ssh/know-me-actions \
  -N ""
```

Install only its public key on the Droplet:

```bash
ssh-copy-id -i ~/.ssh/know-me-actions.pub deploy@165.22.236.40
ssh -i ~/.ssh/know-me-actions deploy@165.22.236.40 \
  'cd /opt/know-me && git status --short && docker compose version'
```

The test should print no changed files and should show the Compose version.

The private key is an automation secret. Never commit it, copy it into the repository, or install it on the Droplet.

## 10. Configure GitHub Actions secrets

In GitHub, open the `tdm00/How-Well-Do-You-Know-Me` repository, then **Settings → Secrets and variables → Actions → New repository secret**, and add:

| Secret | Value |
| --- | --- |
| `DROPLET_HOST` | `165.22.236.40` |
| `DROPLET_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | Entire contents of `~/.ssh/know-me-actions`, including the `BEGIN` and `END` lines |

`DOMAIN` is not a GitHub Actions secret. It stays in `/opt/know-me/.env` on the server. There is no host password or room-code secret to add.

Delete the GitHub Actions private key from the workstation after storing it in a secure password manager or other approved secret backup:

```bash
rm ~/.ssh/know-me-actions
```

Keep the `.pub` file if desired. It is not secret.

## 11. Understand continuous delivery

The workflow in `.github/workflows/ci.yml` runs on every push and every pull request:

1. Check out the code.
2. Install Node 22.
3. Install dependencies from the lockfile.
4. Run TypeScript checks.
5. Run unit and integration tests.
6. Install Chromium and run Playwright.

The deploy job runs only for a push to `main`, and only after all tests pass. When `DROPLET_HOST` is set, it logs in to the Droplet and runs:

```bash
cd /opt/know-me
git pull --ff-only
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

The command rebuilds the application and replaces changed containers. It does not delete `.env`, `data/`, or the named Caddy volumes. The database schema is applied when the app starts.

Recommended delivery process:

1. Create a short-lived branch.
2. Push it and open a pull request.
3. Wait for the test job to pass.
4. Review and merge into `main`.
5. Watch the workflow's deploy job.
6. Verify `/health`, then a phone join and the TV.

In GitHub branch protection for `main`, require a pull request and require the test status check before merging. This prevents untested code from reaching the deployment branch.

The workflow skips deployment when `DROPLET_HOST` is absent, and that skip is a success. If tests pass but no deploy job runs, check that the three repository secrets are set and that the event was a push to `main`.

## 12. Verify a continuous deployment

After the first merge to `main`:

1. Open **GitHub → Actions**.
2. Confirm the test job passes.
3. Confirm the deploy job passes.
4. On the Droplet, compare the deployed commit:

```bash
cd /opt/know-me
git rev-parse HEAD
git log -1 --oneline
docker compose --env-file .env -f deploy/docker-compose.yml ps
```

5. From another machine:

```bash
curl -fsS https://know-me.hobbybin.xyz/health
```

## 13. Manual deployment

Use this only when GitHub Actions is unavailable or while diagnosing it:

```bash
ssh deploy@165.22.236.40
cd /opt/know-me
git status --short
git pull --ff-only
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
docker compose --env-file .env -f deploy/docker-compose.yml ps
curl -fsS https://know-me.hobbybin.xyz/health
```

Do not edit tracked source files on the server. A dirty working tree can prevent future automated deployments. Do not start a second copy of the app.

## 14. Back up the database

The database uses SQLite WAL mode. Stop the app briefly before copying `data/` so the database, WAL, and shared-memory files are a consistent set:

```bash
cd /opt/know-me
sudo install -d -m 700 /var/backups/know-me
docker compose --env-file .env -f deploy/docker-compose.yml stop app
sudo tar -C /opt/know-me -czf \
  "/var/backups/know-me/data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" \
  data
docker compose --env-file .env -f deploy/docker-compose.yml start app
docker compose --env-file .env -f deploy/docker-compose.yml ps
```

Copy that archive off the Droplet. A backup that exists only on the same Droplet is not enough. Back up `.env` separately in an approved secret store. It only contains the domain, but keep the file with the rest of the server notes.

From the workstation:

```bash
scp deploy@165.22.236.40:/var/backups/know-me/data-YYYYMMDDTHHMMSSZ.tar.gz .
```

Test restoration periodically on a separate machine or temporary Droplet.

### Restore a database backup

Restoration replaces the current production data. Take a current backup first, then:

```bash
cd /opt/know-me
docker compose --env-file .env -f deploy/docker-compose.yml down
mv data "data.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
sudo tar -C /opt/know-me -xzf /path/to/data-YYYYMMDDTHHMMSSZ.tar.gz
sudo chown -R deploy:deploy data
docker compose --env-file .env -f deploy/docker-compose.yml up -d
docker compose --env-file .env -f deploy/docker-compose.yml ps
curl -fsS https://know-me.hobbybin.xyz/health
```

Do not add `--volumes` to `docker compose down`. That would delete Caddy's certificates.

## 15. Roll back application code

First identify the last known-good commit in GitHub. Back up the database before rolling back if the failed release changed saved games.

On the Droplet:

```bash
cd /opt/know-me
git status --short
git fetch origin main
git checkout main
git reset --hard LAST_KNOWN_GOOD_COMMIT
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
docker compose --env-file .env -f deploy/docker-compose.yml ps
curl -fsS https://know-me.hobbybin.xyz/health
```

Replace `LAST_KNOWN_GOOD_COMMIT` with the full commit SHA. This is safe only in the dedicated server clone, where no source changes should exist. It does not remove `.env` or `data/`.

Also revert the bad commit in GitHub and merge the revert to `main`. Otherwise the next deployment will reinstall the bad version.

## 16. Rotate keys

This game has no host password and no session secret. The values to rotate are the two SSH keys. If the hostname ever changes, edit `DOMAIN` in `/opt/know-me/.env` and recreate Caddy so it requests a certificate for the new name. Do not put a password or room code in that file.

### GitHub Actions SSH key

1. Generate a new workstation key, as in section 9, with a new filename.
2. Add its public key to `/home/deploy/.ssh/authorized_keys`.
3. Replace the `SSH_PRIVATE_KEY` GitHub secret with the new private key.
4. Run and verify a deployment.
5. Remove the old public key from `authorized_keys`.

### Repository deploy key

1. Generate a new key on the Droplet.
2. Add its public key as a new read-only GitHub deploy key on `tdm00/How-Well-Do-You-Know-Me`.
3. Update `~/.ssh/config` to use it.
4. Verify with `ssh -T git@github.com` and `git fetch`.
5. Remove the old deploy key from GitHub and delete its private key from the Droplet.

## 17. Routine operations

Check the service:

```bash
cd /opt/know-me
docker compose --env-file .env -f deploy/docker-compose.yml ps
docker compose --env-file .env -f deploy/docker-compose.yml logs \
  --tail=100 app caddy
curl -fsS https://know-me.hobbybin.xyz/health
```

`docker compose ps` should show one app container and one Caddy container.

Check capacity monthly and before a gathering:

```bash
df -h
docker system df
du -sh /opt/know-me/data
```

Install operating-system updates:

```bash
sudo apt update
sudo apt upgrade -y
```

If `/var/run/reboot-required` exists, schedule a reboot and verify the containers return because they use `restart: unless-stopped`:

```bash
sudo reboot
```

After reconnecting:

```bash
ssh deploy@165.22.236.40
cd /opt/know-me
docker compose --env-file .env -f deploy/docker-compose.yml ps
curl -fsS https://know-me.hobbybin.xyz/health
```

Remove unused image layers when disk usage grows:

```bash
docker image prune -f
docker builder prune -f
```

Never run `docker compose down --volumes` or `docker system prune --volumes`. Caddy's certificates are in named volumes, and the game database is in `/opt/know-me/data`.

## 18. Troubleshooting

### Deployment cannot SSH to the Droplet

- Confirm `DROPLET_HOST` is `165.22.236.40` and `DROPLET_USER` is `deploy`.
- Confirm the complete private key, including the `BEGIN` and `END` lines, is in `SSH_PRIVATE_KEY`.
- Confirm the matching public key is one line in `/home/deploy/.ssh/authorized_keys`.
- Check permissions:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

- Confirm UFW allows OpenSSH and the cloud firewall, if configured, allows TCP 22.

### `git pull` reports permission denied

On the Droplet:

```bash
ssh -T git@github.com
cd /opt/know-me
git remote -v
git fetch origin main
```

Confirm the repository deploy key still exists on `tdm00/How-Well-Do-You-Know-Me` and that its private key matches `~/.ssh/config`. Write access must stay off.

### `git pull --ff-only` refuses to update

The production clone must remain clean and on `main`:

```bash
cd /opt/know-me
git status
git branch --show-current
```

Do not delete or overwrite unexpected changes until they are understood. `.env` and `data/*.db` should not show as tracked changes.

### App is unhealthy

```bash
cd /opt/know-me
docker compose --env-file .env -f deploy/docker-compose.yml ps
docker compose --env-file .env -f deploy/docker-compose.yml logs \
  --tail=200 app
```

Common causes are a missing `DOMAIN` in `.env`, an unwritable `data/` directory, a failed image build, or an invalid database file. Check ownership with:

```bash
ls -ld /opt/know-me/data
sudo chown -R deploy:deploy /opt/know-me/data
```

Confirm only one app container is running. A second process cannot share this SQLite file and the live channel.

### The TV or host does not update live

Caddy must flush responses instead of buffering them. `deploy/Caddyfile` sets `flush_interval -1` on the proxy to port 3000. If an extra proxy was added in front of Caddy, turn buffering off there too. Then recreate Caddy:

```bash
cd /opt/know-me
docker compose --env-file .env -f deploy/docker-compose.yml up -d --force-recreate caddy
```

### HTTPS certificate is not issued

- Confirm `dig +short know-me.hobbybin.xyz A` returns `165.22.236.40`.
- Remove an incorrect `AAAA` record.
- Confirm inbound TCP 80 and 443 are open in both UFW and any DigitalOcean cloud firewall.
- Check Caddy:

```bash
cd /opt/know-me
docker compose --env-file .env -f deploy/docker-compose.yml logs \
  --tail=200 caddy
```

- Confirm `DOMAIN` in `.env` is `know-me.hobbybin.xyz`, not an `http://` or `https://` URL.

### Tests pass but deployment is skipped

The deploy job runs only on a push to `main`. Confirm `DROPLET_HOST` exists in GitHub Actions repository secrets. Pull-request workflows intentionally test without deploying. A missing `DROPLET_HOST` skips the deploy and leaves the workflow green.

### A deployment completed but the old version is visible

Check the server commit and container creation times:

```bash
cd /opt/know-me
git log -1 --oneline
docker compose --env-file .env -f deploy/docker-compose.yml ps
docker compose --env-file .env -f deploy/docker-compose.yml images
```

Then force a rebuild if necessary:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml \
  build --no-cache app
docker compose --env-file .env -f deploy/docker-compose.yml up -d app
```

## Pre-event checklist

Complete this on the same Wi-Fi the family will use:

- `curl -fsS https://know-me.hobbybin.xyz/health` returns `{"ok":true}`.
- A phone can open `/play`, enter the room code, and join with a name.
- That phone can type an answer and a prediction and lock them. After a refresh, the lock is still there.
- The host can reveal that answer and mark a match.
- The TV at `/tv` shows the question and updates the standings when the host marks the match.
- Host undo removes that mark before the next question, and the TV standings drop back.
- A fresh database backup exists somewhere other than the Droplet.
- The latest `main` deployment is green in GitHub Actions.
- The Droplet has adequate disk space and does not require a reboot.
- `docker compose ps` in `/opt/know-me` shows one app container and one Caddy container.
