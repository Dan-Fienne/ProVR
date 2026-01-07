#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

import uuid

from typing import Iterable, Optional, Sequence

from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response
from fastapi import FastAPI, Request

from backend.core.log import get_logger, set_request_id

logger = get_logger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    header_name = "X-Request-ID"

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(self.header_name) or str(uuid.uuid4())
        request.state.request_id = request_id
        set_request_id(request_id)
        response = await call_next(request)
        response.headers[self.header_name] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(
            self,
            app: FastAPI,
            *,
            enable_hsts: bool = False,
            hsts_max_age: int = 31536000,
            hsts_include_subdomains: bool = True,
            hsts_preload: bool = False,
    ) -> None:
        super().__init__(app)
        self.enable_hsts = enable_hsts
        self.hsts_max_age = hsts_max_age
        self.hsts_include_subdomains = hsts_include_subdomains
        self.hsts_preload = hsts_preload

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
    RequestIDMiddleware.header_name = request_id_header
    app.add_middleware(RequestIDMiddleware)

    allowed_hosts = _build_allowed_hosts(settings)
    if allowed_hosts != ["*"]:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

    cors_origins = _build_cors_origins(settings)
    cors_allow_credentials = bool(getattr(settings, "cors_allow_credentials", True))
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
        )
