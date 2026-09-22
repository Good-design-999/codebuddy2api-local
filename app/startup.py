"""Resolve optional environment files and announce a saved default key once."""
from __future__ import annotations

import io
import os
from pathlib import Path
import stat

from dotenv import load_dotenv
from dotenv.parser import parse_stream
import uvicorn

from .settings import SCHEMA


def load_startup_env(path=None):
    """Load only the explicit working-directory file, without overriding process variables."""
    path = Path.cwd() / ".env" if path is None else Path(path)
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return set()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > 256 * 1024:
        raise ValueError(".env 必须是普通文件且不超过 256 KiB")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    with os.fdopen(fd, "rb") as stream:
        opened = os.fstat(stream.fileno())
        if (not stat.S_ISREG(opened.st_mode)
                or (opened.st_dev, opened.st_ino) != (metadata.st_dev, metadata.st_ino)):
            raise ValueError(".env 文件在读取期间发生变化")
        content = stream.read(256 * 1024 + 1)
    if len(content) > 256 * 1024:
        raise ValueError(".env 文件过大")
    text = content.decode("utf-8-sig")
    for binding in parse_stream(io.StringIO(text)):
        if binding.error:
            raise ValueError(f".env 第 {binding.original.line} 行语法错误")
    previous = set(os.environ)
    load_dotenv(stream=io.StringIO(text), override=False)
    return set(os.environ) - previous


def terminal_stream():
    """Open the controlling terminal, never a redirected standard stream or regular file."""
    device = "CONOUT$" if os.name == "nt" else "/dev/tty"
    fd = os.open(device, os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NOCTTY", 0))
    try:
        if not stat.S_ISCHR(os.fstat(fd).st_mode) or not os.isatty(fd):
            raise OSError("No interactive console")
        return os.fdopen(fd, "w", encoding="utf-8", buffering=1)
    except BaseException:
        os.close(fd)
        raise


def allows_open_noauth():
    """Honor the existing explicit unsafe opt-in without overriding a configured key."""
    return os.environ.get("CODEBUDDY2API_ALLOW_OPEN_NOAUTH", "").lower() in ("1", "true", "yes")


def resolve_startup_key(config, args, dotenv_keys=()):
    sources = config["settings_sources"]
    for name, spec in SCHEMA.items():
        if sources.get(name) == "environment" and spec["env"] in dotenv_keys:
            sources[name] = "dotenv"
    config["announce_default_key"] = False
    if sources.get("api_key") in ("cli", "environment", "dotenv"):
        return
    store = config["state_store"]
    key, pending = store.default_key()
    if key is None and allows_open_noauth():
        return
    if key is None and config["host"] not in ("127.0.0.1", "::1", "localhost"):
        raise ValueError("非回环监听请显式设置 API key；默认密钥仅在本地首次启动时生成")
    if key is None or pending:
        try:
            with terminal_stream():
                pass
        except OSError:
            raise ValueError("首次显示默认 API key 需要交互终端；后台运行请显式配置 CODEBUDDY2API_KEY") from None
    if key is None:
        key, pending = store.default_key(create=True)
    config["api_key"] = args.api_key = key
    sources["api_key"] = "generated"
    config["announce_default_key"] = pending


def announce_default_key(config):
    if not config.get("announce_default_key"):
        return
    with terminal_stream() as terminal:
        key = config["api_key"]
        with config["state_store"].claim_announcement(key) as claimed:
            if claimed:
                terminal.write(f"\n默认 API key：{key}\n已保存到 control.sqlite3，仅显示这一次；管理登录与 API 请求共用。\n")
                terminal.flush()
    config["announce_default_key"] = False


def run_server(app, config, *, host, port):
    if not config.get("announce_default_key"):
        return uvicorn.run(app, host=host, port=port, log_level="warning")

    class FirstStartServer(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets=sockets)
            if self.started and not self.should_exit:
                try:
                    announce_default_key(config)
                except BaseException:
                    # A failed announcement/commit must not leave a hidden-key server running.
                    self.should_exit = True
                    await self.shutdown(sockets=sockets)
                    raise

    server = FirstStartServer(uvicorn.Config(app, host=host, port=port, log_level="warning"))
    try:
        server.run()
    except KeyboardInterrupt:
        pass
    if not server.started:
        raise SystemExit(3)
