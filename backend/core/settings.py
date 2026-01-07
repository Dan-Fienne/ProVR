#!/usr/bin/env python
# -*- coding:utf-8 -*-

from pydantic_settings import BaseSettings, SettingsConfigDict

from pydantic import Field
from functools import lru_cache
from typing import List, Optional, Sequence, ClassVar
import contextvars


class Settings(BaseSettings):
    app_name: str = Field("ProVR", description="Service Name.")
    app_env: str = Field("development", description="Environment Name.")
    app_version: str = Field("0.1.0", description="Version Number")
    app_host: str = Field("0.0.0.0", description="Host")
    app_port: int = Field(8080, description="Port")
    app_reload: bool = Field(True, description="Reload")

    docs_url: Optional[str] = Field("/docs")
    redoc_url: Optional[str] = Field("/redoc")
    openapi_url: Optional[str] = Field("/openapi.json")


    log_level: str = Field("debug", description="Log Level")
    log_format: str = Field("plain", description='Log format: "plain" or "json"')
    log_include_logger_name: bool = Field(True, description="Include logger name in output")
    log_capture_warnings: bool = Field(True, description="Capture Python warnings into logging")
    log_uvicorn_access: bool = Field(True, description="Enable uvicorn access log")
    log_utc: bool = Field(True, description="Use UTC timestamps in logs")
    log_service: Optional[str] = Field(None, description="Service label in logs")
    log_env: Optional[str] = Field(None, description="Environment label, e.g. dev/stage/prod")
    log_version: Optional[str] = Field(None, description="Version label in logs")

    cors_origins: List[str] = Field(default_factory=lambda: ["*"])
    cors_allow_credentials: bool = Field(True)
    cors_allow_methods: Sequence[str] = Field(default_factory=lambda: ["*"])
    cors_allow_headers: Sequence[str] = Field(default_factory=lambda: ["*"])
    allowed_hosts: List[str] = Field(default_factory=lambda: ["*"])
    request_id_header: str = Field("X-Request-ID")
    gzip_min_size: int = Field(1024)
    enable_security_headers: bool = Field(True)
    security_hsts: bool = Field(False)
    security_hsts_max_age: int = Field(31536000)
    security_hsts_include_subdomains: bool = Field(True)
    security_hsts_preload: bool = Field(False)

    db_url: Optional[str] = Field(
        "postgresql+psycopg://postgres:postgres@localhost:5432/provrd",
        description="完整数据库 DSN，优先级最高，如 postgresql+psycopg://user:pass@host:5432/dbname",
    )
    db_host: str = Field("localhost", description="PostgreSQL host")
    db_port: int = Field(5432, description="PostgreSQL port")
    db_user: str = Field("postgres", description="PostgreSQL user")
    db_password: str = Field("postgres", description="PostgreSQL password")
    db_name: str = Field("provrd", description="PostgreSQL database name")
    db_sslmode: str = Field("prefer", description="PostgreSQL sslmode")
    db_pool_size: int = Field(10, description="SQLAlchemy pool size")
    db_max_overflow: int = Field(10, description="SQLAlchemy max overflow")
    db_pool_timeout: int = Field(30, description="SQLAlchemy pool timeout (seconds)")
    db_pool_recycle: int = Field(1800, description="SQLAlchemy pool recycle (seconds)")
    db_echo: bool = Field(False, description="SQLAlchemy echo SQL")

    plain_format: ClassVar[str] = (
        "%(asctime)s | %(levelname)s | %(name)s | %(process)d | %(threadName)s | "
        "rid=%(request_id)s cid=%(correlation_id)s | %(message)s"
    )
    request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
        "request_id", default=None
    )
    correlation_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
        "correlation_id", default=None
    )

    jwt_secret: str = Field("CHANGE_ME", description="JWT secret")
    jwt_algo: str = Field("HS256", description="JWT algorithm")
    token_expires_min: int = Field(60 * 24 * 7, description="Token expire minutes")
    session_secret: str = Field("CHANGE_ME_TO_A_LONG_RANDOM_STRING", description="Session signing secret")
    session_cookie_name: str = Field("sessionid", description="Session cookie name")
    session_max_age: int = Field(60 * 60 * 24 * 7, description="Session max age (seconds)")

    base_dir: str = Field(".", description="Base dir for relative paths")
    templates_dir: str = Field("../client/templates", description="Jinja2 templates dir")
    static_dir: str = Field("../client/static", description="Static files dir")
    uploads_dir: str = Field("uploads", description="Uploads dir")
    uploads_mount: str = Field("/uploads", description="Uploads mount path")
    user_files_mount: str = Field("/user-files", description="User files mount path")
    data_dir: str = Field("./data", description="Working data dir for receptor/ligand")
    client_data_dir: str = Field("../client/static/data", description="Output dir for diffuse models")

    # ---- OAuth ----
    oauth_redirect_base: str = Field("http://localhost:8000", description="OAuth redirect base URL")
    github_client_id: str = Field("", description="GitHub OAuth client id")
    github_client_secret: str = Field("", description="GitHub OAuth client secret")
    github_auth_url: str = Field("https://github.com/login/oauth/authorize", description="GitHub auth URL")
    github_token_url: str = Field("https://github.com/login/oauth/access_token", description="GitHub token URL")
    github_user_url: str = Field("https://api.github.com/user", description="GitHub user API")

    google_client_id: str = Field("", description="Google OAuth client id")
    google_client_secret: str = Field("", description="Google OAuth client secret")
    google_auth_url: str = Field("https://accounts.google.com/o/oauth2/v2/auth", description="Google auth URL")
    google_token_url: str = Field("https://oauth2.googleapis.com/token", description="Google token URL")
    google_userinfo_url: str = Field("https://openidconnect.googleapis.com/v1/userinfo", description="Google userinfo URL")

    wechat_app_id: str = Field("", description="WeChat AppID")
    wechat_app_secret: str = Field("", description="WeChat AppSecret")
    wechat_qr_auth_url: str = Field("https://open.weixin.qq.com/connect/qrconnect", description="WeChat QR auth URL")
    wechat_token_url: str = Field("https://api.weixin.qq.com/sns/oauth2/access_token", description="WeChat token URL")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache(maxsize=None)
def get_settings() -> Settings:
    return Settings()


if __name__ == '__main__':
    setting = get_settings()
    print(setting.github_client_id)
