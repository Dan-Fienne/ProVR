#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
from pathlib import Path

from backend.interfaces.api.router_settings import router_sets, register_routers
from backend.core.errors import register_exception_handlers
from backend.core.middleware import register_middlewares
from backend.core.log import configure_logging
from backend.core.lifespan import lifespan
from backend.core.di import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url=settings.docs_url,
        redoc_url=settings.redoc_url,
        openapi_url=settings.openapi_url,
        lifespan=lifespan(settings),
    )

    application.state.settings = settings
    register_middlewares(application, settings)
    register_exception_handlers(application)

    static_dir = Path(settings.static_dir)
    if static_dir.exists() and static_dir.is_dir():
        application.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    # create router
    fail_fast = bool(
        getattr(settings, "router_fail_fast", False)
        or settings.app_env in ("staging", "production")
    )
    register_routers(application, router_sets, fail_fast=fail_fast)

    return application
