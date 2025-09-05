#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import annotations

from datetime import datetime
from logging.handlers import (
    QueueHandler,
    QueueListener,
    TimedRotatingFileHandler
)

from typing import Optional
import colorlog
from backend.craft.settings import get_settings
import logging
import gzip
import queue
import sys
import os

setting = get_settings()


def _build_formatter() -> logging.Formatter:
    return colorlog.ColoredFormatter(
        "%(log_color)s-%(asctime)s [%(levelname)s] %(name)s - %(message)s-%(reset)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        log_colors={
            "DEBUG": "white",
            "INFO": "cyan",
            "WARNING": "yellow",
            "ERROR": "red",
            "CRITICAL": "bold_red",
        },
    )


def _build_file_handler(fmt: logging.Formatter) -> logging.Handler:
    log_dir = setting.log_dir.expanduser().resolve()
    log_dir.mkdir(parents=True, exist_ok=True)
    time = datetime.now().strftime("%Y-%m-%d")
    setting.log_file = log_dir / f"{setting.log_basename}_{time}.log"

    handler: logging.Handler = TimedRotatingFileHandler(
        setting.log_file, when="midnight", backupCount=setting.log_backup_count, encoding="utf-8"
    )

    if setting.log_gzip:
        def namer(src: str) -> str:  # noqa: D401
            return src + ".gz"

        def rotator(src: str, dst: str) -> None:  # noqa: D401
            with open(src, "rb") as f_in, gzip.open(dst, "wb") as f_out:
                f_out.writelines(f_in)
            os.remove(src)

        handler.namer = namer  # type: ignore[attr-defined]
        handler.rotator = rotator  # type: ignore[attr-defined]

    handler.setFormatter(fmt)
    return handler


_INITIALISED = False
_QUEUE: Optional[queue.Queue] = None
_LISTENER: Optional[QueueListener] = None


def init_logging(force: bool = False) -> None:
    global _INITIALISED, _QUEUE, _LISTENER
    if _INITIALISED and not force:
        return

    root = logging.getLogger()
    root.setLevel(getattr(logging, setting.log_level, logging.INFO))

    if root.handlers and not force:
        _INITIALISED = True
        return

    formatter = _build_formatter()

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)

    file_handler = _build_file_handler(formatter)

    handlers = [console, file_handler]

    if setting.log_queue:
        _QUEUE = queue.Queue(maxsize=10000)
        queue_handler = QueueHandler(_QUEUE)
        root.addHandler(queue_handler)

        _LISTENER = QueueListener(_QUEUE, *handlers, respect_handler_level=True)
        _LISTENER.daemon = True
        _LISTENER.start()
    else:
        for h in handlers:
            root.addHandler(h)
    # 捕获 warnings / 异常
    logging.captureWarnings(True)

    def _excepthook(exc_type, value, tb):  # noqa: D401
        logging.getLogger("sys.excepthook").error(
            "Uncaught exception", exc_info=(exc_type, value, tb)
        )

    sys.excepthook = _excepthook  # type: ignore[assignment]
    _INITIALISED = True
    logging.getLogger(__name__).info(
        "Logging ready ➜ level=%s mode=%s queue=%s file=%s",
        setting.log_level,
        "Daily",
        setting.log_queue,
        setting.log_file,
    )


def get_logger(name: str | None = None) -> logging.Logger:
    init_logging()
    return logging.getLogger(name)
