#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from typing import ClassVar, List, Optional, Sequence, Literal, Any
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator, model_validator
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus


class Settings(BaseSettings):
    # ---- App ----
    app_name: str = Field("ProVR", description="Service Name.")
    app_env: Literal["development", "testing", "staging", "production"] = Field(
        "development", description="Environment Name."
    )
    app_version: str = Field("0.1.0", description="Version Number")
    app_host: str = Field("0.0.0.0", description="Host")
    app_port: int = Field(8080, description="Port")
    app_reload: bool = Field(True, description="Reload")

    docs_url: Optional[str] = Field("/docs")
    redoc_url: Optional[str] = Field("/redoc")
    openapi_url: Optional[str] = Field("/openapi.json")

    # ---- Logging ----
    log_level: Literal["debug", "info", "warning", "error", "critical"] = Field(
        "debug", description="Log Level"
    )
    log_format: Literal["plain", "json"] = Field(
        "plain", description='Log format: "plain" or "json"'
    )
    log_include_logger_name: bool = Field(True, description="Include logger name in output")
    log_capture_warnings: bool = Field(True, description="Capture Python warnings into logging")
    log_uvicorn_access: bool = Field(True, description="Enable uvicorn access log")
    log_utc: bool = Field(True, description="Use UTC timestamps in logs")
    log_service: Optional[str] = Field(None, description="Service label in logs")
    log_env: Optional[str] = Field(None, description="Environment label, e.g. dev/stage/prod")
    log_version: Optional[str] = Field(None, description="Version label in logs")
    log_silence_noisy: bool = Field(True, description="Silence noisy third-party loggers")

    log_to_file: bool = Field(True, description="Enable file logging with rotation")
    log_dir: str = Field("logs", description="Directory to store log files")
    log_file_prefix: str = Field("provr", description="Log filename prefix (e.g. app.log)")
    log_retention_days: int = Field(5, description="How many days of logs to keep")
    log_rotation_when: str = Field("midnight", description="TimedRotatingFileHandler 'when'")
    log_rotation_interval: int = Field(1, description="TimedRotatingFileHandler interval")
    log_rotation_backup_count: Optional[int] = Field(
        None, description="Override backup count (default: log_retention_days)"
    )

    # ---- Middleware ----
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
    security_csp: Optional[str] = Field(None, description="Content-Security-Policy value")
    security_permissions_policy: Optional[str] = Field(
        None, description="Permissions-Policy value"
    )

    # ---- Database ----
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

    # ---- Logging format template ----
    plain_format: ClassVar[str] = (
        "%(asctime)s | %(levelname)s | %(name)s | %(process)d | %(threadName)s | "
        "rid=%(request_id)s cid=%(correlation_id)s | %(message)s"
    )

    # ---- Auth / Session ----
    jwt_secret: str = Field("CHANGE_ME", description="JWT secret")
    jwt_algo: str = Field("HS256", description="JWT algorithm")
    token_expires_min: int = Field(60 * 24 * 7, description="Token expire minutes")
    session_secret: str = Field("CHANGE_ME_TO_A_LONG_RANDOM_STRING", description="Session signing secret")
    session_cookie_name: str = Field("sessionid", description="Session cookie name")
    session_max_age: int = Field(60 * 60 * 24 * 7, description="Session max age (seconds)")

    # ---- Paths ----
    base_dir: str = Field(".", description="Base dir for relative paths")
    templates_dir: str = Field("./frontend/templates", description="Jinja2 templates dir")
    static_dir: str = Field("./frontend/static", description="Static files dir")
    uploads_dir: str = Field("uploads", description="Uploads dir (legacy, unused)")
    uploads_mount: str = Field("/uploads", description="Uploads mount path (legacy)")
    user_files_mount: str = Field("/user-files", description="User files mount path (legacy)")
    data_dir: str = Field("./data", description="Working data dir for receptor/ligand")
    client_data_dir: str = Field("./frontend/static/data", description="Output dir for diffuse models")

    # ---- File Storage ----
    storage_backend: Literal["local", "object"] = Field(
        "local", description="File storage backend: local or object"
    )
    storage_local_dir: str = Field("./storage", description="Local storage base dir")
    max_upload_size: int = Field(20 * 1024 * 1024, description="Max upload size in bytes")
    allowed_extensions: Optional[List[str]] = Field(
        None, description="Allowed file extensions, e.g. .pdb,.cif,.png (empty means no limit)"
    )
    allowed_mime_types: Optional[List[str]] = Field(
        None, description="Allowed MIME types (empty means no limit)"
    )

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
    google_userinfo_url: str = Field(
        "https://openidconnect.googleapis.com/v1/userinfo",
        description="Google userinfo URL",
    )

    wechat_app_id: str = Field("", description="WeChat AppID")
    wechat_app_secret: str = Field("", description="WeChat AppSecret")
    wechat_qr_auth_url: str = Field("https://open.weixin.qq.com/connect/qrconnect", description="WeChat QR auth URL")
    wechat_token_url: str = Field("https://api.weixin.qq.com/sns/oauth2/access_token", description="WeChat token URL")

    # ---- Router ----
    router_fail_fast: bool = Field(False, description="Fail fast if router import fails")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator(
        "cors_origins", "allowed_hosts", "allowed_extensions", "allowed_mime_types", mode="before"
    )
    @classmethod
    def _split_str_list(cls, v: Any) -> Any:
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @field_validator("cors_allow_methods", "cors_allow_headers", mode="before")
    @classmethod
    def _split_str_seq(cls, v: Any) -> Any:
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @field_validator("allowed_extensions", mode="after")
    @classmethod
    def _normalize_extensions(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if not v:
            return v
        out: List[str] = []
        for ext in v:
            e = ext.strip().lower()
            if not e:
                continue
            if not e.startswith("."):
                e = "." + e
            out.append(e)
        return list(dict.fromkeys(out))

    @field_validator("allowed_mime_types", mode="after")
    @classmethod
    def _normalize_mime_types(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if not v:
            return v
        out = [m.strip().lower() for m in v if m and m.strip()]
        return list(dict.fromkeys(out))

    @model_validator(mode="after")
    def _normalize_paths(self) -> "Settings":
        base = Path(self.base_dir).expanduser().resolve()

        def norm(p: str) -> str:
            pp = Path(p).expanduser()
            if not pp.is_absolute():
                pp = base / pp
            return str(pp.resolve())

        self.base_dir = str(base)
        self.templates_dir = norm(self.templates_dir)
        self.static_dir = norm(self.static_dir)
        self.uploads_dir = norm(self.uploads_dir)
        self.data_dir = norm(self.data_dir)
        self.client_data_dir = norm(self.client_data_dir)
        self.storage_local_dir = norm(self.storage_local_dir)
        return self

    @model_validator(mode="after")
    def _ensure_db_url(self) -> "Settings":
        if not self.db_url:
            user = quote_plus(self.db_user)
            pwd = quote_plus(self.db_password)
            host = self.db_host
            port = self.db_port
            name = self.db_name
            sslmode = self.db_sslmode
            self.db_url = (
                f"postgresql+psycopg://{user}:{pwd}@{host}:{port}/{name}?sslmode={sslmode}"
            )
        return self


@lru_cache(maxsize=None)
def get_settings() -> Settings:
    return Settings()


if __name__ == "__main__":
    s = get_settings()
    print(
        {
            "app_name": s.app_name,
            "env": s.app_env,
            "static_dir": s.static_dir,
            "storage_local_dir": s.storage_local_dir,
            "log_format": s.log_format,
        }
    )