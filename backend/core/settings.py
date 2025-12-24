#!/usr/bin/env python
# -*- coding:utf-8 -*-

from pydantic_settings import BaseSettings, SettingsConfigDict

from pydantic import Field
from functools import lru_cache
from typing import List, Optional
import contextvars


class Settings(BaseSettings):
    app_name: str = Field("ProVR", description="Service Name.")
    app_env: str = Field("development", description="Environment Name.")
    app_version: str = Field("0.1.0", description="Version Number")

    log_level: str = Field("debug", description="Log Level")
    log_format: str = Field("plain", description='Log format: "plain" or "json"')
    log_include_logger_name: bool = Field(True, description="Include logger name in output")
    log_capture_warnings: bool = Field(True, description="Capture Python warnings into logging")
    log_uvicorn_access: bool = Field(True, description="Enable uvicorn access log")
    log_utc: bool = Field(True, description="Use UTC timestamps in logs")
    log_service: Optional[str] = Field(None, description="Service label in logs")
    log_env: Optional[str] = Field(None, description="Environment label, e.g. dev/stage/prod")
    log_version: Optional[str] = Field(None, description="Version label in logs")

    plain_format = (
        "%(asctime)s | %(levelname)s | %(name)s | %(process)d | %(threadName)s | "
        "rid=%(request_id)s cid=%(correlation_id)s | %(message)s"
    )
    request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
        "request_id", default=None
    )
    correlation_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
        "correlation_id", default=None
    )

    app_host: str = Field("0.0.0.0", description="Host")
    app_port: int = Field("8080", description="Port")
    app_reload: bool = Field("True", description="Reload")
    allowed_hosts: List[str] = Field(default_factory=lambda: ["*"], description="CORS/Host allowlist.")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache(maxsize=None)
def get_settings() -> Settings:
    return Settings()
