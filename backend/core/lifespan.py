#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from typing import Any, AsyncIterator, Callable, Dict, Iterable, Optional
from fastapi import FastAPI
import contextlib
import time

from backend.core.settings import Settings
from backend.core.log import get_logger

Hook = Callable[[FastAPI, Settings, Dict[str, Any]], Any]
logger = get_logger(__name__)


async def _maybe_await(func: Hook, app: FastAPI, settings: Settings, resources: Dict[str, Any]) -> None:
    rv = func(app, settings, resources)
    if hasattr(rv, "__await__"):
        await rv


async def _init_resources(settings: Settings) -> Dict[str, Any]:
    """
    在这里集中初始化全局资源（示例）：
    """
    resources: Dict[str, Any] = {}
    return resources


async def _shutdown_resources(resources: Dict[str, Any]) -> None:
    """
    逆序清理资源，尽量容错。
    """
    for name, resource in list(resources.items())[::-1]:
        try:
            if hasattr(resource, "aclose") and callable(resource.aclose):
                await resource.aclose()
            elif hasattr(resource, "close") and callable(resource.close):
                resource.close()
        except Exception:
            logger.exception("Error while closing resource", extra={"resource": name})


def lifespan(
        settings: Settings,
        *,
        startup_hooks: Optional[Iterable[Hook]] = None,
        shutdown_hooks: Optional[Iterable[Hook]] = None,
):
    """
    FastAPI lifespan factory。
    - startup_hooks / shutdown_hooks：可传入钩子列表，用于额外的初始化或清理。
      每个 hook 签名：fn(app, settings, resources) -> None | Awaitable[None]
    """
    startup_hooks = list(startup_hooks or [])
    shutdown_hooks = list(shutdown_hooks or [])

    @contextlib.asynccontextmanager
    async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
        env = getattr(settings, "app_env", None)
        logger.info("Application starting", extra={"env": env})
        t0 = time.monotonic()
        resources: Dict[str, Any] = {}
        try:
            resources = await _init_resources(settings)
            # 启动钩子
            for hook in startup_hooks:
                await _maybe_await(hook, app, settings, resources)

            app.state.resources = resources
            app.state.settings = settings

            startup_ms = int((time.monotonic() - t0) * 1000)
            logger.info("Application started", extra={"env": env, "startup_ms": startup_ms})
            yield
        except Exception:
            logger.exception("Application failed during startup", extra={"env": env})
            raise
        finally:
            t1 = time.monotonic()
            for hook in shutdown_hooks:
                try:
                    await _maybe_await(hook, app, settings, resources)
                except Exception:
                    logger.exception("Shutdown hook failed", extra={"env": env})
            try:
                await _shutdown_resources(resources)
            except Exception:
                logger.exception("Error during resource shutdown", extra={"env": env})
            shutdown_ms = int((time.monotonic() - t1) * 1000)
            logger.info("Application shutdown complete", extra={"env": env, "shutdown_ms": shutdown_ms})

    return _lifespan
