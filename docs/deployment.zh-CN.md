# 部署指南

[首页](../README.zh-CN.md) · [English](deployment.md)

日常账号、模型与日志管理优先使用 [WebUI](webui.zh-CN.md)。以下命令均在仓库根目录执行。

## 配置与数据

首次部署运行 `cp .env.example .env`，并将 `CODEBUDDY2API_KEY` 设置为自己的随机密钥。已有 `.env` 请保留，只按需追加配置。

| 配置 | 作用 |
|------|------|
| `CODEBUDDY2API_IMAGE` | Compose 镜像；模板默认 `codebuddy2api:local` |
| `CODEBUDDY2API_BIND` / `CODEBUDDY2API_PORT` | 本地监听与 Compose 宿主机映射；默认 `127.0.0.1:8787` |
| `CODEBUDDY2API_AUTH_PATH` | Compose 宿主机数据目录；默认 `./auth`，挂载到容器 `/data/auth` |
| `CODEBUDDY_AUTH_DIR` | 本地 Python 数据目录；默认仓库内 `auth/`。Compose 在容器内固定为 `/data/auth` |
| `CODEBUDDY_IMPORT_DIR` | 可选导入目录；默认数据目录下的 `imports/`。Compose 中请使用容器路径 |

示例文件列出了全部生效的运行时变量，包括入站/聚合字节上限、并发、工具重试与故障转移。Compose 会转发这些限制；未设置的可选项（工具元数据、来源白名单、故障转移等）仍可在 WebUI 配置。取零表示关闭聚合/并发限制或额外重试，而入站上限必须为正值。

Compose 从 `.env` 读取已声明变量，shell 变量优先。默认宿主机映射仅回环。开放远程访问前请设置随机密钥、HTTPS 与访问限制。容器内监听保持 `0.0.0.0:8787`；调整对外暴露用 `BIND/PORT`，不要改容器监听参数。

数据目录需整体挂载在可写本地存储，不要只挂载单个 SQLite 文件，也不要在多个实例间共享。升级前停止网关并备份整个目录，见[数据与备份](webui.zh-CN.md#数据与备份)。

## Docker Compose

### 使用已发布镜像

在 `.env` 中将 `CODEBUDDY2API_IMAGE` 设为 `ghcr.io/maiphucgiang/codebuddy2api:<版本>`（选择已发布的版本），然后运行：

```bash
docker compose pull
docker compose up -d --no-build
```

镜像支持 `linux/amd64` 与 `linux/arm64`。版本标签固定发行版，`latest` 跟随稳定版，`edge` 跟随 main。功能以所选版本为准；旧镜像可能不包含当前源码的 WebUI。

### 构建当前源码

```bash
docker compose build
docker compose up -d
```

构建包含 WebUI；宿主机无需安装 Node.js 和 Python。启动后打开 `http://127.0.0.1:8787/dashboard` 添加账号。

### 升级与重建

修改 `.env` 后重新执行对应的 `docker compose up -d` 以重建配置发生变化的容器。更新本地源码后需重新构建；使用发布镜像时选择并拉取新版本。仅执行 `docker compose restart` 不会应用新的环境变量。保留数据目录即可保留登录状态。

## 反向代理与 HTTPS

默认的回环映射是唯一无需额外工作的安全暴露方式。将网关放到域名反代之后时：

- 在反代终止 TLS，并转发原始 Host 与协议（nginx 配置 `proxy_set_header Host $host` 与 `X-Forwarded-Proto $scheme`）。
- WebUI 会比较浏览器 `Origin` 与网关实际看到的地址。反代改写转发的 Host/协议时（例如域名 HTTPS 访问而容器内看到 HTTP），登录会报 Origin 校验失败。此时把对外地址加入「系统设置 → 管理页额外信任来源」，或设置 `CODEBUDDY2API_ADMIN_ORIGINS` / `--admin-allowed-origins`，而不是关闭 CSRF 保护；见[管理 Origin 校验](advanced.zh-CN.md#管理-origin--csrf-开关)。
- 任何非回环暴露都必须保持鉴权（`CODEBUDDY2API_KEY`）。

## 本地 Python 运行

需要 Python 3.12+、uv，以及 Node.js 与 vp CLI 来构建界面：

```bash
uv sync --locked --no-build --python 3.12
(cd web && vp install --frozen-lockfile && vp build)
uv run --locked --no-build --env-file .env converter.py --desensitize
```

按上文配置 `.env` 后启动，打开 `/dashboard` 添加账号。修改前端源码后需重新构建 WebUI。

没有 uv 时：运行 `python3 -m venv .venv` 并激活，用 `pip install --require-hashes --only-binary=:all: -r requirements.txt` 安装依赖，以 `python3 converter.py --desensitize` 启动。**纯 Python 不会加载 `.env`**；请显式导出环境变量或传递 CLI 参数。

本地监听地址优先级为：显式 `--host/--port` > `CODEBUDDY2API_BIND/PORT` > WebUI 已保存值 > 默认值。希望由 `.env` 控制监听时去掉显式参数；修改需重启。`CODEBUDDY2API_IMAGE/AUTH_PATH` 仅用于 Compose；本地数据目录用 `CODEBUDDY_AUTH_DIR`。

## 依赖锁定

`pyproject.toml` 声明直接依赖；`uv.lock` 锁定全部解析版本。`requirements.in` 与带哈希的 `requirements.txt` 是供 pip、Docker 与 CI 使用的生成文件：

```bash
uv lock
python3 scripts/export_requirements.py
```

有意调整依赖时使用 `uv add`/`uv remove`，然后导出并核对两份锁定。日常启动使用 `--locked`，不会升级任何包。元数据与当前 `VERSION` 保持一致；发版必须同时更新两处版本字段。pip/Docker 仍要求哈希匹配与二进制 wheel，不要关闭这些校验。

Docker 构建所用的前端、Node 与 Python 镜像均按多平台摘要锁定。刷新它们时保留 `linux/amd64` 与 `linux/arm64` 支持并验证构建。锁定只能防止漂移，不能免疫未来漏洞；安全更新仍需评审后刷新。

## 命令行登录

WebUI 不可用时不启动服务也能完成浏览器登录：

```bash
uv run --locked --no-build --env-file .env converter.py login
uv run --locked --no-build --env-file .env converter.py login --site intl --no-browser
uv run --locked --no-build --env-file .env converter.py login --site intl-codebuddy --no-browser
```

第一条使用国内站。`--site intl` 选择国际 WorkBuddy（`www.workbuddy.ai`）；`--site intl-codebuddy` 选择国际 CodeBuddy（`www.codebuddy.ai`）。`--no-browser` 打印授权链接，可在其他设备打开。即使浏览器显示成功，也要等终端确认凭证已保存。链接 10 分钟过期；按 `Ctrl+C` 取消。

Docker 中使用 `docker compose exec codebuddy2api python3 converter.py login --no-browser`；按所选国际产品追加 `--site intl` 或 `--site intl-codebuddy`。镜像版本需包含对应登录选项。

登录与服务必须使用同一个 `CODEBUDDY_AUTH_DIR`。默认目录扫描会自动加载新账号；重复登录会更新同一身份。以 `--auth-file` 启动的服务只使用指定文件。

在默认本地模式且未设置 `CODEBUDDY_AUTH_DIR` 时，启动会从已登录的桌面客户端导入缺失凭证。也可以直接向管理目录放入 `.info` 文件。桌面端与网关各自的独立刷新可能互相挤掉 token；建议使用独立的浏览器登录。

## 不使用 Compose

准备 `.env` 后，构建并运行本地源码镜像：

```bash
docker build -t codebuddy2api:local .
docker run -d --name codebuddy2api -p 127.0.0.1:8787:8787 \
  --env-file .env -v "$PWD/auth:/data/auth" \
  -e CODEBUDDY_AUTH_DIR=/data/auth codebuddy2api:local
```

该命令显式使用默认端口与目录，不依赖 Compose 的端口映射。在 WebUI 添加账号，或运行 `docker exec -it codebuddy2api python3 converter.py login --no-browser`。

## 验证

`curl http://127.0.0.1:8787/health` 应返回 `{"status":"ok"}`。它只表示存活，不代表账号或模型可用；请在 WebUI 中查看。API 接入见[客户端配置](clients.zh-CN.md)，错误与重试边界见[进阶参考](advanced.zh-CN.md)。
