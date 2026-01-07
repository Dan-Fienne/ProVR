#!/usr/bin/env python
# -*- coding:utf-8 -*-
from backend.core.errors import register_exception_handlers
from backend.core.middleware import register_middlewares
from backend.core.log import configure_logging
from backend.core.lifespan import lifespan

from backend.core.di import get_settings

from fastapi import FastAPI


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

    register_middlewares(application, settings)
    register_exception_handlers(application)

    return application

