#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

from typing import Iterator
from functools import lru_cache
from urllib.parse import urlparse, urlunparse

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from backend.core.settings import Settings, get_settings
from backend.core.log import get_logger

logger = get_logger(__name__)

Base = declarative_base()


def _redact_dsn(dsn: str) -> str:
    try:
        u = urlparse(dsn)
        if u.username or u.password:
            host = u.hostname or ""
            port = f":{u.port}" if u.port else ""
            auth = ""
            if u.username:
                auth = f"{u.username}:***@"
            netloc = f"{auth}{host}{port}"
            return urlunparse((u.scheme, netloc, u.path, u.params, u.query, u.fragment))
    except Exception:
        pass
    return dsn


@lru_cache(maxsize=1)
def _build_engine(settings: Settings = None):
    settings = settings or get_settings()
    db_url = settings.db_url or ""
    dsn_lower = db_url.lower()

    if not (dsn_lower.startswith("postgresql://") or dsn_lower.startswith("postgresql+psycopg://")):
        raise ValueError("仅支持 PostgreSQL DSN，请检查 settings.db_url")

    engine = create_engine(
        db_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout,
        pool_recycle=settings.db_pool_recycle,
        pool_pre_ping=True,
        echo=settings.db_echo,
        future=True,
    )
    logger.info("PostgreSQL engine initialized", extra={"url": _redact_dsn(db_url)})
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
