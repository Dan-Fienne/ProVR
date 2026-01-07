#!/usr/bin/env python
# -*- coding:utf-8 -*-

from backend.core.settings import Settings, get_settings as _load_settings


def get_settings() -> Settings:
    return _load_settings()
