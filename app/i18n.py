"""Minimal CLI translation layer; the WebUI keeps its own client-side catalog."""

from __future__ import annotations

import os

CHOICES = ("auto", "zh", "en")
_FALLBACK = "zh"

MESSAGES = {
    "config.usage": {
        "zh": "请指定 migrate 或 status：python3 converter.py config migrate",
        "en": "Name migrate or status: python3 converter.py config migrate",
    },
    "config.envFile": {"zh": "env 文件 : {path}", "en": "env file : {path}"},
    "config.noEnv": {"zh": "（未读取 env 文件）", "en": "(no env file)"},
    "config.target": {"zh": "目标库   : {path}", "en": "target   : {path}"},
    "config.schema": {
        "zh": "schema   : user_version={version} · revision={revision} · 账号 {accounts}",
        "en": "schema   : user_version={version} · revision={revision} · accounts {accounts}",
    },
    "config.running": {
        "zh": "运行中（pid {pid}，{age} 秒前心跳）",
        "en": "running (pid {pid}, heartbeat {age}s ago)",
    },
    "config.released": {"zh": "已释放（心跳过期）", "en": "released (stale heartbeat)"},
    "config.idle": {"zh": "无运行中实例", "en": "no running instance"},
    "config.state": {"zh": "运行状态 : {state}", "en": "state    : {state}"},
    "config.pending": {"zh": "待迁移   : {count} 项", "en": "pending  : {count}"},
    "config.unchanged": {"zh": "已一致   : {count} 项", "en": "unchanged: {count}"},
    "config.dryRun": {"zh": "dry-run：未写入任何内容", "en": "dry run: nothing was written"},
    "config.noChanges": {
        "zh": "没有需要迁移的差异；提醒开关保持原值",
        "en": "no differences to migrate; the notice flag is unchanged",
    },
    "config.written": {
        "zh": "已写入 {count} 项，revision -> {revision}，迁移提醒已关闭",
        "en": "wrote {count} item(s), revision -> {revision}, migration notice disabled",
    },
    "config.language": {
        "zh": "界面语言已保存为 {language}",
        "en": "interface language saved as {language}",
    },
    "config.removeEnv": {
        "zh": "可以删除或注释 .env 中以下行（之后这些项改为配置库提供，可在 WebUI 修改）：",
        "en": "You can delete or comment these .env lines; the WebUI then supplies and edits them:",
    },
}


def system_language() -> str:
    """Map the process locale to a supported language; default Chinese."""
    raw = (os.environ.get("LC_ALL") or os.environ.get("LC_MESSAGES") or os.environ.get("LANG") or "")
    return "zh" if raw.lower().startswith("zh") else ("en" if raw else _FALLBACK)


def resolve_language(value=None) -> str:
    """Resolve auto/zh/en (from CLI, config or locale) to `zh` or `en`."""
    if value not in CHOICES:
        return system_language()
    if value == "auto":
        return system_language()
    return value


def normalize(value):
    """Validate a stored/CLI language value, returning None when unacceptable."""
    return value if value in CHOICES else None


def tr(lang, key, **values) -> str:
    entry = MESSAGES.get(key, {})
    template = entry.get(lang) or entry.get(_FALLBACK) or key
    return template.format(**values) if values else template
