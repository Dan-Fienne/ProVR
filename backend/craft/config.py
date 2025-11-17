#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import (
    model_validator,
    computed_field,
    BaseModel,
    SecretStr,
    HttpUrl,
    Field,
)

from typing import Literal, List, Optional, Any
from backend.tools.base import get_root
from functools import lru_cache
from pathlib import Path


class OAuthProvider(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[SecretStr] = None
    scope: Optional[str] = None
    metadata_url: Optional[HttpUrl] = None

    @property
    def enabled(self) -> bool:
        return bool(self.client_id and self.client_secret)


class DataBaseConfig(BaseModel):
    user: str = "provr"
    password: SecretStr = SecretStr("provrciai")
    host: str = "127.0.0.1"
    port: int = 5432
    name: str = "provr"
    driver: Literal["psycopg2", "asyncpg"] = "psycopg2"
    echo: bool = False
    pool_size: int = 10
    max_overflow: int = 20
    pool_timeout: int = 30
    pool_recycle: int = 1800
    url: Optional[str] = None

    @model_validator(mode="after")
    def build_url(self):
        if self.url:
            return self
        scheme = "postgresql+asyncpg" if self.driver == "asyncpg" else "postgresql+psycopg2"
        pwd = self.password.get_secret_value()
        self.url = f"{scheme}://{self.user}:{pwd}@{self.host}:{self.port}/{self.name}"
        return self


class LoggingConfig(BaseModel):
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    dir: Path = Field(default_factory=lambda: Path("./logs"))
    basename: str = "ProVR"
    backup_count: int = 14
    color: bool = True
    console: bool = True
    queue: bool = True
    gzip: bool = True
    use_concurrent: bool = True
    utc: bool = True
    file: Path = Path("ProVR.log")


class CorsConfig(BaseModel):
    origins: List[str] = Field(default_factory=lambda: ["*"])
    methods: List[str] = Field(default_factory=lambda: ["*"])
    headers: List[str] = Field(default_factory=lambda: ["*"])
    allow_credentials: bool = True


class TemplateConfig(BaseModel):
    root: Path = Field(default_factory=get_root)
    base_dir: Path | None = None
    template_dir: Path | None = None
    static_dir: Path | None = None

    @model_validator(mode="after")
    def set_paths_from_root(self) -> "TemplateConfig":
        if self.base_dir is None:
            self.base_dir = self.root
        if self.template_dir is None:
            self.template_dir = self.root / "frontend" / "templates"
        if self.static_dir is None:
            self.static_dir = self.root / "frontend" / "static"
        return self


class OAuthConfig(BaseModel):
    github: OAuthProvider = OAuthProvider(
        client_id=None,
        client_secret=None,
        scope=None,
        metadata_url=None,
    )
    google: OAuthProvider = OAuthProvider(scope="openid email profile")
    apple: OAuthProvider = OAuthProvider()

    wechat_app_id: Optional[str] = None
    wechat_app_secret: Optional[SecretStr] = None
    wechat_qr_auth_url: HttpUrl = "https://open.weixin.qq.com/connect/qrconnect"
    wechat_token_url: HttpUrl = "https://api.weixin.qq.com/sns/oauth2/access_token"

    @model_validator(mode="after")
    def ensure_wechat_appid(self) -> "OAuthConfig":
        if not self.wechat_app_id:
            raise ValueError("WECHAT_APP_ID 未配置，微信扫码登录会直接返回 errcode=41002")
        return self

    @computed_field(return_type=bool)
    def wechat_enabled(self) -> bool:
        return bool(self.wechat_app_id and self.wechat_app_secret)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../../.env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    app_name: str = "ProVR"
    environment: Literal["development", "staging", "production", "test"] = "production"
    debug: bool = True

    host: str = "0.0.0.0"
    port: int = 9098
    secret_key: SecretStr = SecretStr("ProVR")

    cors: CorsConfig = CorsConfig()
    templates: TemplateConfig = TemplateConfig()
    logging: LoggingConfig = LoggingConfig()
    database: DataBaseConfig = DataBaseConfig()
    oauth: OAuthConfig = OAuthConfig()

    plugins_dir: List[Path] = Field(default_factory=lambda: [get_root() / "backend/plugins"])

    @computed_field(return_type=dict)
    def uvicorn_options(self) -> dict[str, Any]:
        return {
            "host": self.host,
            "port": self.port,
            "reload": self.debug,
            "log_level": self.logging.level.lower(),
        }

    @computed_field(return_type=bool)
    def is_production(self) -> bool:
        return self.environment == "production"


if __name__ == '__main__':
    tmp = Settings()
    print(tmp.database.url)
