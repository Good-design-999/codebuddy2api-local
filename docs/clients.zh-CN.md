# 客户端配置

[首页](../README.zh-CN.md) · [English](clients.md)

请先在 [WebUI](webui.zh-CN.md) 添加账号。下文将 `YOUR_GATEWAY_API_KEY` 替换为网关 API key，`MODEL_ID` 替换为对外模型 ID，并按部署调整地址与端口。

## 通用设置

| 协议 | Base URL |
|------|----------|
| OpenAI Chat / Responses | `http://127.0.0.1:8787/v1` |
| Anthropic Messages | `http://127.0.0.1:8787` |

国内/国际、CLI/WorkBuddy 账号共用这些地址；后端自动选路，无需 `/cn` 或 `/intl` 前缀。客户端使用 WebUI 登录所用的 key，而非管理 Cookie。

列出可用模型：

```bash
curl http://127.0.0.1:8787/v1/models \
  -H 'Authorization: Bearer YOUR_GATEWAY_API_KEY'
```

使用响应中或 WebUI 里的 ID；各账号支持的模型不一定相同。可在界面中配置对外别名。Anthropic 模型名不会被自动猜测或映射。

## Codex CLI

将以下内容合并进 `~/.codex/config.toml`，不要覆盖已有配置。可直接复制的版本见 [`examples/codex-codebuddy.example.toml`](../examples/codex-codebuddy.example.toml)：

```toml
[model_providers.workbuddy]
name = "WorkBuddy (via local converter)"
base_url = "http://127.0.0.1:8787/v1"
wire_api = "responses"
env_key = "CODEBUDDY2API_KEY"

[profiles.workbuddy]
model = "MODEL_ID"
model_provider = "workbuddy"
```

```bash
export CODEBUDDY2API_KEY='YOUR_GATEWAY_API_KEY'
codex --profile workbuddy "your task"
```

Codex 使用 `/v1/responses`。运行时上下文与真实指令分开处理；请求超限返回 HTTP 413，而不会静默截断最新的用户请求。

## Claude Code / CC Switch

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
export ANTHROPIC_AUTH_TOKEN='YOUR_GATEWAY_API_KEY'
export ANTHROPIC_MODEL='MODEL_ID'
claude
```

- Claude Code、Anthropic SDK 与 CC Switch 的 Anthropic 提供方使用不含 `/v1/messages` 的 Base URL；SDK 会自行追加路径。只有明确要求完整端点的客户端才应包含 `/v1/messages`。
- `POST /v1/messages` 会转换为上游 Chat Completions，保留原生工具调用与推理内容。
- `--desensitize` 控制 WorkBuddy 固定 CLI 模板的适配，默认关闭，项目的 Compose 配置已启用。保留更完整指令等选项见[进阶参考](advanced.zh-CN.md)。

## 其他 OpenAI 兼容客户端

Cherry Studio、ZCode、LobeChat、NextChat、Open WebUI 或自研 SDK 客户端，统一使用上面的 Base URL、API key 与模型 ID。

生成端点为 `POST /v1/chat/completions`、`POST /v1/responses` 与 `POST /v1/messages`。需要完整 JSON 时显式设 `stream: false`，需要 SSE 时设 `stream: true`。

## 值得了解的协议行为

- `developer` 消息归一化为 `system`，不改动调用方原始载荷。
- Chat 兼容混入的 Anthropic `tool_use` / `tool_result` 历史，保留调用 ID、参数、结果图片与错误标记；普通 `thinking` 转为 `reasoning_content`，不混入正文，原生 Chat 字段保持不变。
- 字段冲突、工具结果无法关联、不支持的混合内容块及 `redacted_thinking` 在选路前返回 HTTP 400。需拆分的用户消息只能包含 `role`、`content`，且 `tool_result` 必须在普通文本/图片之前；Anthropic 思考签名不转发。
- 指定名称的函数选择会以 `required` 且仅含该函数的形式发往上游；无效名称在本地拒绝。
- 错误按客户端协议各自的形态返回（OpenAI 的 `error` 对象与 Anthropic 的 `{"type":"error"}`），状态码保留。
- `POST /v1/messages/count_tokens` 返回按字符估算的启发式结果，用于预算参考，不是精确计数。

完整的请求处理规则见[进阶参考](advanced.zh-CN.md#请求边界)。
