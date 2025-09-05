#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import annotations

from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional, List
from pydantic import (
    model_validator,
    AliasPath,
    Field
)


class Settings(BaseSettings):
    # login & register OAuth
    github_client_id: Optional[str] = "Ov23li4shmBGSPtSYJ4R"
    github_client_secret: Optional[str] = "3c9524e4478af0c185c11f7b9aca2fdbeab4f126"
    github_server_metadata_url: Optional[str] = "https://github.com/.well-known/openid-configuration"
    github_scope: Optional[str] = "openid user:email"

    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None

    apple_client_id: Optional[str] = None
    apple_team_id: Optional[str] = None
    apple_key_id: Optional[str] = None
    apple_secret_key: Optional[str] = None

    # 通用
    app_name: str = Field("ProVR", validation_alias=AliasPath("app_name"))
    environment: str = Field("development", pattern="^(development|production|test)$")
    debug: bool = Field(False, description="Debug mode")

    # log
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    log_dir: Path = Field(default_factory=lambda: Path("./logs"))
    log_basename: str = "ProVR"
    log_backup_count: int = 14
    log_color: bool = True
    log_console: bool = True
    log_queue: bool = True
    log_gzip: bool = True
    log_use_concurrent: bool = True
    log_utc: bool = True
    log_file: Path = "ProVR.log"

    # api server
    host: str = Field("0.0.0.0", description="Host")
    port: int = Field("9098", description="Port")
    secret_key: str = "ProVR"
    # path
    base_dir: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[2])
    template_dir: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[2] / "frontend" / "templates")
    static_dir: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[2] / "frontend" / "static")
    # plugins
    plugins_dir: List[Path] = Field(
        default_factory=lambda: [Path(__file__).resolve().parent.parent / "backend/plugins"])
    # database
    database_user: str = "provr"
    database_pwd: str = "provrciai"
    database_host: str = "127.0.0.1:5432"
    database_url: Optional[str] = f"postgresql+asyncpg://{database_user}:{database_pwd}@{database_host}/provr"

    # redis_url: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        populate_by_name = True

    # 动态校验
    @model_validator(mode="after")
    @classmethod
    def set_debug_by_env(cls, m: Settings):
        m.debug = (m.environment == "development")
        return m

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def uvicorn_options(self) -> dict:
        return {
            "host": self.host,
            "port": self.port,
            "reload": self.debug,
            "log_level": self.log_level.lower(),
        }


# 单例模式
@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


if __name__ == '__main__':
    settings = get_settings()
    print(settings.database_url)
