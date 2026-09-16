# codebuddy2api

Use your **WorkBuddy / CodeBuddy (Tencent)** subscription as local **OpenAI- and Anthropic-compatible APIs**.

[中文文档](README.zh-CN.md)

- Chat Completions, Responses and Anthropic Messages, with tool calling and streaming.
- Built-in **WebUI** for browser login, models, credentials, logs and settings — no desktop client required.
- Automatic multi-account routing across domestic and international sites, with credential refresh.
- Per-account automation: domestic check-in then Buddy travel by default, with independent switches; international check-in is opt-in.

## Quick start

Requires Git and Docker Compose. The prebuilt GHCR image includes the WebUI; no local build is needed.

```bash
git clone https://github.com/maiphucgiang/codebuddy2api.git
cd codebuddy2api
cp .env.example .env
```

Edit `.env`: set `CODEBUDDY2API_KEY` to your own random key and pick the image. Preserve an existing `.env` on upgrades:

```dotenv
CODEBUDDY2API_IMAGE=ghcr.io/maiphucgiang/codebuddy2api:latest
```

```bash
docker compose pull
docker compose up -d --no-build
```

`latest` tracks stable releases; pin a published version tag for reproducible deployments. Image features belong to that version, not to unmerged source branches.

First use:

1. Open **http://127.0.0.1:8787/dashboard** and sign in with your API key.
2. In **Credentials**, add a domestic or international account through browser login, or import an `.info` file.
3. In **Models**, find an available model and use its public ID in your client.

The template binds to localhost only. Configure HTTPS and restrict network access before allowing remote connections; keep and securely back up the `auth/` data directory. To run current source or log in from a terminal instead, see the [deployment guide](docs/deployment.md).

## Client setup

| Protocol | Base URL |
|----------|----------|
| OpenAI Chat / Responses | `http://127.0.0.1:8787/v1` |
| Anthropic Messages | `http://127.0.0.1:8787` |

- **API key:** the same key used to sign in to the WebUI.
- **Model:** a public ID from the WebUI or `GET /v1/models`.
- All accounts share these URLs; no region parameter is needed. Anthropic SDKs append `/v1/messages` themselves, so leave it out of the Base URL.

[Codex CLI, Claude Code / CC Switch and other client examples →](docs/clients.md)

## Project structure

```
.
├── converter.py         # Gateway entry: protocol adaptation, routing, scheduling
├── app/                 # Management API, credentials, catalogs, audit and policy modules
├── web/                 # WebUI frontend (React/TypeScript; build output served by the gateway)
├── tests/               # Offline regression suites
├── docs/                # User guides, English and Chinese
├── examples/            # Client configuration examples
├── scripts/             # Version and dependency-lock tooling
├── Dockerfile           # Multi-stage image: frontend build + Python runtime
├── docker-compose.yml   # Recommended deployment
├── .env.example         # Every runtime environment variable, annotated
└── .github/workflows/   # CI: tests, image publishing, CodeQL
```

## Documentation

| Guide | Contents |
|-------|----------|
| [WebUI guide](docs/webui.md) | Accounts, model routing, audit logs, settings and backups |
| [Deployment](docs/deployment.md) | Published images, upgrades, reverse proxy/HTTPS, local setup and CLI login |
| [Client configuration](docs/clients.md) | Codex CLI, Claude Code, CC Switch and generic clients |
| [Advanced reference](docs/advanced.md) | Options, APIs, model scheduling, request limits and troubleshooting |

## FAQ

- **WebUI sign-in fails behind an HTTPS domain/reverse proxy?** Trust your public origin via `admin_allowed_origins` — see [Management Origin checks](docs/advanced.md#management-origin--csrf-switch).
- **No Docker on the server?** Run the terminal login and the gateway with Python directly — see [Local Python setup](docs/deployment.md#local-python-setup).
- **Where is my data?** Everything lives in `auth/` (or `/data/auth` in Docker): credentials, settings and log databases — see [Data and backups](docs/webui.md#data-and-backups).
- **Which image tag should I use?** `latest` follows stable releases, `edge` follows main, version tags pin one release — see [Published images](docs/deployment.md#use-published-images).

## Disclaimer

For personal learning only — no commercial use. Not affiliated with Tencent, WorkBuddy, CodeBuddy, OpenAI, or Anthropic. This project only calls official APIs of accounts you are logged into; use it solely with subscriptions you legally own. You are solely responsible for your account, credentials, and all associated risks.

## License

[MIT](LICENSE)

## Community

Thanks to the [LINUX DO](https://linux.do) community for providing an open and friendly platform for technical discussions.
