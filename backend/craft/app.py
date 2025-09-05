#!/usr/bin/env python
# -*- coding: utf-8 -*-
import os

from fastapi import FastAPI

from contextlib import asynccontextmanager

from starlette.middleware.sessions import SessionMiddleware
from starlette.staticfiles import StaticFiles


from backend.craft.auth import router as auth_router
from backend.craft.settings import get_settings

from backend.craft.database import (
    lifespan_startup_hook,
    lifespan_shutdown_hook,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await lifespan_startup_hook()
    yield
    await lifespan_shutdown_hook()


def create_app() -> FastAPI:
    app = FastAPI(
        title="ProVR",
        lifespan=lifespan,
    )

    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret_key,
    )

    app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")

    app.include_router(auth_router)

    return app
