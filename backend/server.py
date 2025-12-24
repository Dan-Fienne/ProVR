#!/usr/bin/env python
# -*- coding:utf-8 -*-
from uvicorn import lifespan

from core.di import get_settings

from fastapi import FastAPI


def create_app() -> FastAPI:
    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url=settings.docs_url,
        redoc_url=settings.redoc_url,
        openapi_url=settings.openapi_url,
        lifespan=lifespan(settings),
    )

    return application

