# Deployment

[Home](../README.md) · [简体中文](deployment.zh-CN.md)

Prefer the [WebUI](webui.md) for everyday account, model and log management. Run the commands below from the repository root.

## Configuration and data

On first setup, run `cp .env.example .env` and set `CODEBUDDY2API_KEY` to your own random key. Keep an existing `.env` and add only the settings you need.

| Setting | Purpose |
|---------|---------|
| `CODEBUDDY2API_IMAGE` | Compose image; the template uses `codebuddy2api:local` |
| `CODEBUDDY2API_BIND` / `CODEBUDDY2API_PORT` | Native listener and Compose host mapping; default `127.0.0.1:8787` |
| `CODEBUDDY2API_AUTH_PATH` | Compose host data directory; defaults to `./auth`, mounted at `/data/auth` |
| `CODEBUDDY_AUTH_DIR` | Local Python data directory; defaults to the repository's `auth/`. Compose sets it to `/data/auth` inside the container |
| `CODEBUDDY_IMPORT_DIR` | Optional import directory; defaults to `imports/` under the data directory. Use container paths with Compose |

The example lists all active runtime variables, including inbound/aggregate byte limits, concurrency, tool retries and failover. Compose forwards these limits; unset optional settings (tool metadata, origin allowlist, failover and similar) remain configurable in the WebUI. Zero disables the aggregate/concurrency limit or extra retries, not the required positive inbound limit.

Compose reads declared variables from `.env`; shell variables take precedence. The default host mapping is loopback. Set a random key, HTTPS and access restrictions before allowing remote connections. Container binding remains `0.0.0.0:8787`; change host exposure using `BIND/PORT`, not container listener arguments.

Mount the entire data directory on writable local storage, not just one SQLite file, and do not share it between instances. Stop the gateway and back up the whole directory before upgrading; see [data and backups](webui.md#data-and-backups).

## Docker Compose

### Use published images

Set `CODEBUDDY2API_IMAGE` in `.env` to `ghcr.io/maiphucgiang/codebuddy2api:<version>`, choosing an existing release, then run:

```bash
docker compose pull
docker compose up -d --no-build
```

Images support `linux/amd64` and `linux/arm64`. Version tags pin releases, `latest` follows stable releases and `edge` follows main. Features depend on the selected version; older images may not include the current source's WebUI.

### Build current source

```bash
docker compose build
docker compose up -d
```

The build includes the WebUI; Node.js and Python are not required on the host. Open `http://127.0.0.1:8787/dashboard` to add accounts.

### Upgrades and recreates

After editing `.env`, repeat the appropriate `docker compose up -d` command to recreate containers whose configuration changed. Rebuild after updating local source; select and pull the new version when using published images. `docker compose restart` alone does not apply changed environment values. Preserve the data directory to retain login state.

## Reverse proxy and HTTPS

The default loopback mapping is the only safe exposure without extra work. When you put the gateway behind a reverse proxy on a domain:

- Terminate TLS at the proxy and forward the original Host and scheme (`proxy_set_header Host $host` and `X-Forwarded-Proto $scheme` in nginx).
- The WebUI compares the browser's `Origin` with the address the gateway actually sees. If the proxy rewrites the forwarded Host/scheme — for example HTTPS on the domain while the container sees HTTP — sign-in fails the Origin check. Trust your public address in **Settings → Extra trusted management origins（管理页额外信任来源）** or with `CODEBUDDY2API_ADMIN_ORIGINS` / `--admin-allowed-origins` instead of disabling CSRF protection; see [Management Origin checks](advanced.md#management-origin--csrf-switch).
- Keep authentication enabled (`CODEBUDDY2API_KEY`) for any non-loopback exposure.

## Local Python setup

Requires Python 3.12+, uv, and Node.js with the vp CLI to build the interface:

```bash
uv sync --locked --no-build --python 3.12
(cd web && vp install --frozen-lockfile && vp build)
uv run converter.py
```

Local startup does not require `.env`. Without an explicit key, the first loopback startup generates a `cb-…` default key in `auth/control.sqlite3` and displays it once in the interactive terminal after listening succeeds. Restarts reuse it without printing it again. Keep it safe: management and API requests share this key. Configure a key explicitly for first-time headless or non-loopback deployment.

Without uv, run `python3 -m venv .venv`, activate it, install dependencies with `pip install --require-hashes --only-binary=:all: -r requirements.txt`, then run `python3 converter.py`. Distribution archives include the WebUI; source installs still need the frontend build.

Both commands optionally read `.env` in the current working directory, never parent directories. Precedence: explicit CLI > process environment > `.env` > saved SQLite values > defaults. Overrides do not replace the saved default key; an explicitly empty key still locks management. Listener changes require restart; `CODEBUDDY2API_IMAGE/AUTH_PATH` are Compose-only.

### Upgrade and state migration

Stop the gateway and back up the entire data directory first. Startup imports legacy JSON sessions, cooldowns, credit/trial history, catalogs and usage into `control.sqlite3` once. Old files remain as backups and are no longer read or updated. Invalid critical state or a failed migration stops startup; repair it or restore a backup rather than deleting ledgers to bypass validation.

All runtime logs use `logs.sqlite3`; legacy `--log` / `CODEBUDDY2API_LOG` settings warn and no longer write text files. Generated keys enter private configuration, never logs. Restrict access to the data directory; use a private user directory on Windows.

Older versions cannot read the upgraded control database. Downgrades require a stopped gateway and matching state migration, not merely old code reading stale JSON. Never overwrite new claims, dispatches or session revocations with an outdated backup.

## Dependency locks

`pyproject.toml` owns direct dependencies; `uv.lock` pins all resolved versions. `requirements.in` and the hash-locked `requirements.txt` are generated compatibility files for pip, Docker and CI:

```bash
uv lock
python3 scripts/export_requirements.py
```

Use `uv add`/`uv remove` for intentional dependency changes, then export and review both locks. Normal startup uses `--locked` and never upgrades packages. Metadata stays at the current `VERSION`; releases must update both version fields. Pip/Docker still require matching hashes and binary wheels; do not disable these checks.

Docker's build frontend, Node and Python images are pinned by multi-platform digest. When refreshing them, retain `linux/amd64` and `linux/arm64` support and verify the build. Locks prevent drift, not future vulnerabilities; security updates still require reviewed refreshes.

## CLI login

When the WebUI is unavailable, browser login also works without starting the server:

```bash
uv run --locked --no-build --env-file .env converter.py login
uv run --locked --no-build --env-file .env converter.py login --site intl --no-browser
uv run --locked --no-build --env-file .env converter.py login --site intl-codebuddy --no-browser
```

The first command uses the domestic site. `--site intl` selects international WorkBuddy (`www.workbuddy.ai`); `--site intl-codebuddy` selects international CodeBuddy (`www.codebuddy.ai`). `--no-browser` prints a link you can open on another device. Even after the browser reports success, wait for the terminal to confirm that credentials were saved. Links expire after 10 minutes; press `Ctrl+C` to cancel.

In Docker, use `docker compose exec codebuddy2api python3 converter.py login --no-browser`; append `--site intl` or `--site intl-codebuddy` for the selected international product. The image must include the corresponding login option.

Login and the server must use the same `CODEBUDDY_AUTH_DIR`. Default directory scanning loads new accounts automatically; logging in again updates the same identity. A server started with `--auth-file` only uses the specified files.

With the default local mode and no `CODEBUDDY_AUTH_DIR`, startup imports missing credentials from an already logged-in desktop client. You can also add `.info` files to the managed directory. Independent desktop and gateway token refreshes may invalidate each other; prefer separate browser login.

## Without Compose

After preparing `.env`, build and run a local source image:

```bash
docker build -t codebuddy2api:local .
docker run -d --name codebuddy2api -p 127.0.0.1:8787:8787 \
  --env-file .env -v "$PWD/auth:/data/auth" \
  -e CODEBUDDY_AUTH_DIR=/data/auth codebuddy2api:local
```

This command explicitly uses the default port and directory, not Compose-specific port mappings. Add accounts in the WebUI or run `docker exec -it codebuddy2api python3 converter.py login --no-browser`.

## Verification

`curl http://127.0.0.1:8787/health` should return `{"status":"ok"}`. It checks liveness only, not account or model availability; inspect those in the WebUI. See [client configuration](clients.md) for API access and the [advanced reference](advanced.md) for errors and retry boundaries.
