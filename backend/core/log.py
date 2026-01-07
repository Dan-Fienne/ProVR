#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

from typing import Iterable, Optional
import datetime as dt
import traceback
import logging
import json
import sys
import time

from backend.core.settings import Settings, get_settings

_settings: Settings = get_settings()


def set_request_id(value):
    _settings.request_id_var.set(value)


def get_request_id():
    return _settings.request_id_var.get()


def set_correlation_id(value):
    _settings.correlation_id_var.set(value)


def get_correlation_id():
    return _settings.correlation_id_var.get()


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        record.correlation_id = get_correlation_id()
        return True


class JsonFormatter(logging.Formatter):
    def __init__(
            self,
            *,
            service: Optional[str] = None,
            environment: Optional[str] = None,
            version: Optional[str] = None,
            utc: bool = True,
            include_logger_name: bool = True,
    ):
        super().__init__()
        self.service = service
        self.environment = environment
        self.version = version
        self.utc = utc
        self.include_logger_name = include_logger_name

    def formatTime(self, record: logging.LogRecord, datefmt: Optional[str] = None) -> str:  # type: ignore[override]
        ts = dt.datetime.fromtimestamp(record.created, dt.timezone.utc if self.utc else None)
        return ts.isoformat()

    def format(self, record: logging.LogRecord) -> str:
        if record.exc_info:
            record.exc_text = self.formatException(record.exc_info)

        payload = {
            "ts": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "pid": record.process,
            "thread": record.threadName,
            "request_id": getattr(record, "request_id", None),
            "correlation_id": getattr(record, "correlation_id", None),
            "module": record.module,
            "filename": record.filename,
            "lineno": record.lineno,
            "func": record.funcName,
        }

        if self.include_logger_name:
            payload["logger"] = record.name
        if self.service:
            payload["service"] = self.service
        if self.environment:
            payload["env"] = self.environment
        if self.version:
            payload["version"] = self.version

        if record.exc_info:
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
            payload["exc_message"] = str(record.exc_info[1]) if record.exc_info[1] else None
            payload["traceback"] = "".join(traceback.format_exception(*record.exc_info))

        for key, value in record.__dict__.items():
            if key.startswith("_") or key in payload:
                continue
            if key in (
                    "name",
                    "msg",
                    "args",
                    "levelname",
                    "levelno",
                    "pathname",
                    "filename",
                    "module",
                    "exc_info",
                    "exc_text",
                    "stack_info",
                    "lineno",
                    "funcName",
                    "created",
                    "msecs",
                    "relativeCreated",
                    "thread",
                    "threadName",
                    "processName",
                    "process",
            ):
                continue
            payload[key] = value

        return json.dumps(payload, ensure_ascii=False)


class PlainFormatter(logging.Formatter):
    def __init__(self, fmt: str, utc: bool = True) -> None:
        super().__init__(fmt=fmt, datefmt=None)
        self.converter = time.gmtime if utc else time.localtime


class AccessLogFormatter(JsonFormatter):
    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        base = {
            "ts": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
            "correlation_id": getattr(record, "correlation_id", None),
        }
        for key, value in record.__dict__.items():
            if key.startswith("_") or key in base:
                continue
            base[key] = value
        return json.dumps(base, ensure_ascii=False)


class AccessPlainFormatter(logging.Formatter):
    def __init__(self, utc: bool = True) -> None:
        fmt = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
        super().__init__(fmt=fmt, datefmt=None)
        self.converter = time.gmtime if utc else time.localtime


def _build_stream_handler(
        formatter: logging.Formatter,
        level: int,
        filters: Iterable[logging.Filter],
) -> logging.Handler:
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(formatter)
    for f in filters:
        handler.addFilter(f)
    return handler


def _silence_noisy_loggers(level: int) -> None:
    noisy = {
        "uvicorn.error": level,
        "uvicorn.access": level,
        "uvicorn.asgi": level,
        "uvicorn": level,
        "gunicorn.error": level,
        "gunicorn.access": level,
        "asyncio": logging.WARNING,
        "httpx": logging.WARNING,
        "urllib3": logging.WARNING,
        "watchfiles": logging.INFO,  # 热重载时可能较吵
    }
    for name, lvl in noisy.items():
        logging.getLogger(name).setLevel(lvl)


def configure_logging(settings: Settings, *, force: bool = False) -> None:
    level = getattr(logging, getattr(settings, "log_level", "INFO").upper(), logging.INFO)
    log_format = getattr(settings, "log_format", "plain").lower()
    include_logger_name = bool(getattr(settings, "log_include_logger_name", True))
    capture_warnings = bool(getattr(settings, "log_capture_warnings", True))
    enable_access = bool(getattr(settings, "log_uvicorn_access", True))
    use_utc = bool(getattr(settings, "log_utc", True))

    root = logging.getLogger()
    if force:
        for h in list(root.handlers):
            root.removeHandler(h)

    root.setLevel(level)

    filters = [RequestContextFilter()]

    if log_format == "json":
        formatter: logging.Formatter = JsonFormatter(
            service=getattr(settings, "log_service", None),
            environment=getattr(settings, "log_env", None),
            version=getattr(settings, "log_version", None),
            utc=use_utc,
            include_logger_name=include_logger_name,
        )
    else:
        fmt = getattr(settings, "plain_format", "%(asctime)s | %(levelname)s | %(name)s | %(message)s")
        formatter = PlainFormatter(fmt, utc=use_utc)

    handler = _build_stream_handler(formatter, level, filters)
    root.addHandler(handler)

    access_logger = logging.getLogger("uvicorn.access")
    if enable_access:
        if log_format == "json":
            access_formatter: logging.Formatter = AccessLogFormatter(
                service=getattr(settings, "log_service", None),
                environment=getattr(settings, "log_env", None),
                version=getattr(settings, "log_version", None),
                utc=use_utc,
                include_logger_name=include_logger_name,
            )
        else:
            access_formatter = AccessPlainFormatter(utc=use_utc)
        access_handler = _build_stream_handler(access_formatter, level, filters)
        access_logger.handlers = [access_handler]
        access_logger.propagate = False
    else:
        access_logger.disabled = True

    if capture_warnings:
        logging.captureWarnings(True)

    _silence_noisy_loggers(level)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    return logging.getLogger(name or __name__)
