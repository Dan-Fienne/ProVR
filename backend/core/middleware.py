#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

import uuid
from typing import Iterable, Sequence

from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response
from fastapi import FastAPI, Request

from backend.core.log import get_logger, set_request_id, reset_request_id

logger = get_logger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):

    def __init__(self, app: FastAPI, *, header_name: str = "X-Request-ID") -> None:
        super().__init__(app)
        self.header_name = header_name

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(self.header_name) or str(uuid.uuid4())
        request.state.request_id = request_id
        token = set_request_id(request_id)
        try:
            response = await call_next(request)
            response.headers[self.header_name] = request_id
            return response
        finally:
            reset_request_id(token)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(
            self,
            app: FastAPI,
            *,
            enable_hsts: bool = False,
            hsts_max_age: int = 31536000,
            hsts_include_subdomains: bool = True,
            hsts_preload: bool = False,
            csp: str | None = None,
            permissions_policy: str | None = None,
    ) -> None:
        super().__init__(app)
        self.enable_hsts = enable_hsts
        self.hsts_max_age = hsts_max_age
        self.hsts_include_subdomains = hsts_include_subdomains
        self.hsts_preload = hsts_preload
        self.csp = csp
        self.permissions_policy = permissions_policy

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("X-XSS-Protection", "1; mode=block")
        response.headers.setdefault("Referrer-Policy", "no-referrer-when-downgrade")
        if self.enable_hsts:
            parts = [f"max-age={self.hsts_max_age}"]
            if self.hsts_include_subdomains:
                parts.append("includeSubDomains")
            if self.hsts_preload:
                parts.append("preload")
            response.headers.setdefault("Strict-Transport-Security", "; ".join(parts))
        if self.csp:
            response.headers.setdefault("Content-Security-Policy", self.csp)
        if self.permissions_policy:
            response.headers.setdefault("Permissions-Policy", self.permissions_policy)
        return response


def _normalize_list(values: Iterable[str]) -> list[str]:
    return [v.strip() for v in values if v and v.strip()]


def _build_cors_origins(settings) -> list[str]:
    origins = _normalize_list(getattr(settings, "cors_origins", []) or [])
    return origins or ["*"]


def _build_allowed_hosts(settings) -> list[str]:
    hosts = _normalize_list(getattr(settings, "allowed_hosts", []) or [])
    return hosts or ["*"]


def register_middlewares(app, settings) -> None:
    request_id_header = getattr(settings, "request_id_header", "X-Request-ID")
    app.add_middleware(RequestIDMiddleware, header_name=request_id_header)

    allowed_hosts = _build_allowed_hosts(settings)
    if allowed_hosts != ["*"]:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

    cors_origins = _build_cors_origins(settings)
    cors_allow_credentials = bool(getattr(settings, "cors_allow_credentials", True))
    if cors_allow_credentials and "*" in cors_origins:
        logger.warning(
            "CORS allow_credentials=True 与 allow_origins='*' 冲突，已自动降级为 allow_credentials=False"
        )
        cors_allow_credentials = False

    cors_allow_methods: Sequence[str] = getattr(settings, "cors_allow_methods", ["*"])
    cors_allow_headers: Sequence[str] = getattr(settings, "cors_allow_headers", ["*"])
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=cors_allow_credentials,
        allow_methods=list(cors_allow_methods),
        allow_headers=list(cors_allow_headers),
    )

    gzip_min_size = int(getattr(settings, "gzip_min_size", 1024))
    app.add_middleware(GZipMiddleware, minimum_size=gzip_min_size)

    enable_security_headers = bool(getattr(settings, "enable_security_headers", True))
    if enable_security_headers:
        app.add_middleware(
            SecurityHeadersMiddleware,
            enable_hsts=bool(getattr(settings, "security_hsts", False)),
            hsts_max_age=int(getattr(settings, "security_hsts_max_age", 31536000)),
            hsts_include_subdomains=bool(
                getattr(settings, "security_hsts_include_subdomains", True)
            ),
            hsts_preload=bool(getattr(settings, "security_hsts_preload", False)),
            csp=getattr(settings, "security_csp", None),
            permissions_policy=getattr(settings, "security_permissions_policy", None),
        )
