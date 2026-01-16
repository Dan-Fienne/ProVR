#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

from typing import Iterable, Optional, Any
from pathlib import Path
import logging.handlers
import datetime as dt
import contextvars
import traceback
import logging
import json
import sys
import time

from backend.core.settings import Settings

_request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id", default=None
)
_correlation_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "correlation_id", default=None
)


def set_request_id(value):
    return _request_id_var.set(value)


def reset_request_id(token) -> None:
    if token is not None:
        _request_id_var.reset(token)


def get_request_id():
    return _request_id_var.get()


def set_correlation_id(value):
    return _correlation_id_var.set(value)


def reset_correlation_id(token) -> None:
    if token is not None:
        _correlation_id_var.reset(token)


def get_correlation_id():
    return _correlation_id_var.get()


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        record.correlation_id = get_correlation_id()
        return True


class BaseJsonFormatter(logging.Formatter):
    def __init__(
            self,
            *,
            service: Optional[str] = None,
            environment: Optional[str] = None,
            version: Optional[str] = None,
            utc: bool = True,
            include_logger_name: bool = True,
            log_type: str = "app",
    ):
        super().__init__()
        self.service = service
        self.environment = environment
        self.version = version
        self.utc = utc
        self.include_logger_name = include_logger_name
        self.log_type = log_type

    def formatTime(self, record: logging.LogRecord, datefmt: Optional[str] = None) -> str:  # type: ignore[override]
        ts = dt.datetime.fromtimestamp(record.created, dt.timezone.utc if self.utc else None)
        return ts.isoformat()

    def _base_payload(self, record: logging.LogRecord) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record),
            "type": self.log_type,
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
        return payload

    def _merge_extra(self, payload: dict[str, Any], record: logging.LogRecord) -> None:
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


class JsonFormatter(BaseJsonFormatter):

    def __init__(self):
        super().__init__()

    def format(self, record: logging.LogRecord) -> str:
        if record.exc_info:
            record.exc_text = self.formatException(record.exc_info)

        payload = self._base_payload(record)

        if record.exc_info:
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
            payload["exc_message"] = str(record.exc_info[1]) if record.exc_info[1] else None
            payload["traceback"] = "".join(traceback.format_exception(*record.exc_info))

        self._merge_extra(payload, record)
        return json.dumps(payload, ensure_ascii=False, default=str)


class PlainFormatter(logging.Formatter):
    def __init__(self, fmt: str, utc: bool = True) -> None:
        super().__init__(fmt=fmt, datefmt=None)
        self.converter = time.gmtime if utc else time.localtime


class AccessLogFormatter(BaseJsonFormatter):
    def __init__(
            self,
            *,
            service: Optional[str] = None,
            environment: Optional[str] = None,
            version: Optional[str] = None,
            utc: bool = True,
            include_logger_name: bool = True,
    ) -> None:
        super().__init__(
            service=service,
            environment=environment,
            version=version,
            utc=utc,
            include_logger_name=include_logger_name,
            log_type="access",
        )

    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        payload = self._base_payload(record)
        self._merge_extra(payload, record)
        return json.dumps(payload, ensure_ascii=False, default=str)


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
    setattr(handler, "_provr_configured", True)
    return handler


def _build_file_handler(
        log_path: Path,
        formatter: logging.Formatter,
        level: int,
        filters: Iterable[logging.Filter],
        *,
        when: str = "midnight",
        interval: int = 1,
        backup_count: int = 5,
        utc: bool = True,
) -> logging.Handler:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.TimedRotatingFileHandler(
        filename=str(log_path),
        when=when,
        interval=interval,
        backupCount=backup_count,
        encoding="utf-8",
        utc=utc,
    )
    handler.setLevel(level)
    handler.setFormatter(formatter)
    for f in filters:
        handler.addFilter(f)
    setattr(handler, "_provr_configured", True)
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
        "watchfiles": logging.INFO,
    }
    for name, lvl in noisy.items():
        logging.getLogger(name).setLevel(lvl)


def configure_logging(settings: Settings, *, force: bool = False) -> None:
    raw_level = getattr(settings, "log_level", "INFO")
    if isinstance(raw_level, int):
        level = raw_level
    else:
        level = getattr(logging, str(raw_level).upper(), logging.INFO)

    log_format = str(getattr(settings, "log_format", "plain")).lower()
    include_logger_name = bool(getattr(settings, "log_include_logger_name", True))
    capture_warnings = bool(getattr(settings, "log_capture_warnings", True))
    enable_access = bool(getattr(settings, "log_uvicorn_access", True))
    use_utc = bool(getattr(settings, "log_utc", True))

    log_to_file = bool(getattr(settings, "log_to_file", False))
    log_dir = Path(getattr(settings, "log_dir", "logs"))
    log_file_prefix = str(getattr(settings, "log_file_prefix", "app"))
    log_retention_days = int(getattr(settings, "log_retention_days", 5))

    rotation_when = str(getattr(settings, "log_rotation_when", "midnight"))
    rotation_interval = int(getattr(settings, "log_rotation_interval", 1))
    rotation_backup = getattr(settings, "log_rotation_backup_count", None)
    if rotation_backup is None:
        rotation_backup = log_retention_days

    root = logging.getLogger()

    if not force:
        for h in root.handlers:
            if getattr(h, "_provr_configured", False):
                return
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

    if log_to_file:
        app_log = log_dir / f"{log_file_prefix}.log"
        file_handler = _build_file_handler(
            app_log,
            formatter,
            level,
            filters,
            when=rotation_when,
            interval=rotation_interval,
            backup_count=int(rotation_backup),
            utc=use_utc,
        )
        root.addHandler(file_handler)

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
        if log_to_file:
            access_log = log_dir / f"{log_file_prefix}.access.log"
            access_file_handler = _build_file_handler(
                access_log,
                access_formatter,
                level,
                filters,
                when=rotation_when,
                interval=rotation_interval,
                backup_count=int(rotation_backup),
                utc=use_utc,
            )
            access_logger.handlers = [access_handler, access_file_handler]
        else:
            access_logger.handlers = [access_handler]
        access_logger.propagate = False
    else:
        access_logger.handlers = []
        access_logger.disabled = True

    if capture_warnings:
        logging.captureWarnings(True)

    if bool(getattr(settings, "log_silence_noisy", True)):
        _silence_noisy_loggers(level)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    return logging.getLogger(name or __name__)
