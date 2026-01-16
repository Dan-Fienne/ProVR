#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from backend.core.settings import Settings, get_settings as _load_settings
from typing import Optional
import contextvars

_settings_override: contextvars.ContextVar[Optional[Settings]] = contextvars.ContextVar(
    "settings_override", default=None
)


def set_settings_override(value: Optional[Settings]) -> None:
    _settings_override.set(value)


def get_settings() -> Settings:
    override = _settings_override.get()
    if override is not None:
        return override
    return _load_settings()
