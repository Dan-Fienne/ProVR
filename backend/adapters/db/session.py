#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

from typing import Iterator, Optional
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from backend.core.settings import Settings, get_settings
from backend.core.log import get_logger

logger = get_logger(__name__)

Base = declarative_base()


@lru_cache(maxsize=1)
def _build_engine(settings: Settings = None):
    settings = settings or get_settings()
    dsn = settings.db_url.lower()
    if not (dsn.startswith("postgresql://") or dsn.startswith("postgresql+psycopg://")):
        raise ValueError("仅支持 PostgreSQL DSN，请检查 settings.db_url")

    engine = create_engine(
        settings.db_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout,
        pool_recycle=settings.db_pool_recycle,
        pool_pre_ping=True,
        echo=settings.db_echo,
        future=True,
    )
    logger.info("PostgreSQL engine initialized", extra={"url": settings.db_url})
    return engine



def get_engine():
    return _build_engine()


SessionLocal = sessionmaker(
    bind=None,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    future=True,
)


def get_session() -> Iterator[Session]:
    engine = get_engine()
    if SessionLocal.kw["bind"] is None:  # type: ignore[attr-defined]
        SessionLocal.configure(bind=engine)
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    logger.info("DB metadata created")

