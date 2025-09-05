#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import annotations

import re
from functools import lru_cache
from types import TracebackType
from typing import AsyncGenerator, Callable, Optional, Type

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import (
AsyncEngine,
AsyncSession,
async_sessionmaker,
create_async_engine,
)
from tenacity import retry, stop_after_attempt, wait_exponential_jitter
from sqlalchemy.orm import DeclarativeBase, declared_attr
from backend.craft.settings import get_settings
from backend.craft.logger import get_logger

# Base
setting = get_settings()
logger = get_logger(__name__)

# orm
class Base(DeclarativeBase):
    @declared_attr.directive
    def __tablename__(cls) -> str:
        name = cls.__name__.lower()
        s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", name)
        return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


@lru_cache(maxsize=1)
def get_engine() -> AsyncEngine:
    engine = create_async_engine(
        setting.database_url,
        echo=False,
        pool_size=20,
        max_overflow=40,
        pool_timeout=30,
        pool_recycle=3600,
        connect_args={
            "server_settings": {"application_name": setting.app_name},
        },
    )
    logger.info("AsyncEngine created url=%s", setting.database_url)
    return engine


@lru_cache(maxsize=1)
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=get_engine(),
        expire_on_commit=False,
        autoflush=False,
        class_=AsyncSession,
    )

# lifespan hook
@retry(stop=stop_after_attempt(5), wait=wait_exponential_jitter(1, 10))
async def _ping_database() -> None:
    async with get_engine().connect() as conn:
        await conn.execute(sa.text("SELECT 1;"))
    logger.info(f"Pinging database {setting.database_url} OK")

async def lifespan_startup_hook() -> None:
    await _ping_database()

async def lifespan_shutdown_hook() -> None:
    logger.info("Closing database engine ...")
    await get_engine().dispose()

# session relay
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async_session = get_sessionmaker()()
    try:
        yield async_session
        await async_session.commit()
    except Exception:
        await async_session.rollback()
        raise
    finally:
        await async_session.close()


# transactional
class Transactional(object):
    def __init__(
            self,
            factory: Callable[[], AsyncSession] | None = None) -> None:
        self._factory = factory or get_sessionmaker()
        self.session: Optional[AsyncSession] = None

    # context-manager
    async def __aenter__(self) -> AsyncSession:
        self.session = self._factory()
        return self.session

    async def __aexit__(
            self,
            exc_type: Type[BaseException] | None = None,
            exc: BaseException | None = None,
            tb: TracebackType | None = None,
    ) -> bool | None:
        assert self.session
        if exc_type is None:
            await self.session.commit()
        else:
            await self.session.rollback()
        await self.session.close()
        return False

    def __call__(self, func):  # noqa: D401
        async def wrapper(*args, **kwargs):
            async with self as sess:
                return await func(sess, *args, **kwargs)

        return wrapper
