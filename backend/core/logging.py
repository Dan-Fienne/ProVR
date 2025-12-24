#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

from typing import Iterable, Optional

import datetime as dt
import traceback
import logging
import json
import sys

from settings import Settings, get_settings

settings: Settings = get_settings()


def set_request_id(value):
    settings.request_id_var.set(value)


def get_request_id():
    return settings.request_id_var.get()


def set_correlation_id(value):
    settings.correlation_id_var.set(value)


def get_correlation_id():
    return settings.correlation_id_var.get()


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = get_request_id()
        if not hasattr(record, "correlation_id"):
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
        _dt = dt.datetime.fromtimestamp(record.created, dt.timezone.utc if self.utc else None)
        return _dt.isoformat()

    def format(self, record: logging.LogRecord) -> str:
        if record.exc_info:
            record.exc_text = self.formatException(record.exc_info)
        elif record.exc_text:
            record.exc_text = self.formatException(record.exc_text)

        payload = {
            "ts": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "pid": record.process,
            "thread": record.threadName,
            "request_id": getattr(record, "request_id", None),
            "correlation_id": getattr(record, "correlation_id", None),
        }

        if self.include_logger_name:
            payload["logger"] = record.name

        if self.service:
            payload["service"] = self.service
        if self.environment:
            payload["env"] = self.environment
        if self.version:
            payload["version"] = self.version

        payload["module"] = record.module
        payload["filename"] = record.filename
        payload["lineno"] = record.lineno
        payload["func"] = record.funcName

        if record.exc_info:
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
            payload["exc_message"] = str(record.exc_info[1]) if record.exc_info[1] else None
            payload["traceback"] = "".join(traceback.format_exception(*record.exc_info))

        for key, value in record.__dict__.items():
            if key.startswith("_"):
                continue
            if key in payload:
                continue
            # 跳过标准字段
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
        self.utc = utc

    def converter(self, timestamp: float) -> _dt.datetime:  # type: ignore[override]
        if self.utc:
            return dt.datetime.fromtimestamp(timestamp, dt.timezone.utc)
        return dt.datetime.fromtimestamp(timestamp)


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
            if key.startswith("_"):
                continue
            if key in base:
                continue
            base[key] = value
        return json.dumps(base, ensure_ascii=False)


class AccessPlainFormatter(logging.Formatter):
    def __init__(self, utc: bool = True) -> None:
        fmt = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
        super().__init__(fmt=fmt)
        self.utc = utc

    def converter(self, timestamp: float) -> _dt.datetime:  # type: ignore[override]
        if self.utc:
            return dt.datetime.fromtimestamp(timestamp, dt.timezone.utc)
        return dt.datetime.fromtimestamp(timestamp)


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
        formatter = PlainFormatter(settings.plain_format, utc=use_utc)

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
        access_logger.handlers = [access_handler]  # 覆盖为统一格式
        access_logger.propagate = False  # 避免重复输出
    else:
        access_logger.disabled = True

    if capture_warnings:
        logging.captureWarnings(True)

    _silence_noisy_loggers(level)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    return logging.getLogger(name or __name__)
