#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from typing import Iterable, Tuple, Optional, List
from fastapi import APIRouter, FastAPI
import importlib

from backend.core.log import get_logger

logger = get_logger(__name__)

RouterImport = Tuple[str, str]

router_sets: Iterable[RouterImport] = [
    ("backend.interfaces.api.routers.auth", "router"),
    ("backend.interfaces.api.routers.files", "router"),
    ("backend.interfaces.api.routers.pages", "router"),
    ("backend.interfaces.api.routers.docking", "router"),
]


def safe_import_router(module_path: str, attr_name: str) -> Optional[APIRouter]:
    try:
        module = importlib.import_module(module_path)
        router = getattr(module, attr_name, None)
        if router is None:
            raise AttributeError(f"Attribute '{attr_name}' not found in module '{module_path}'")
        if not isinstance(router, APIRouter):
            raise TypeError(f"Attribute '{attr_name}' in '{module_path}' is not an APIRouter")
        return router
    except Exception as exc:
        logger.warning(
            "Failed to load router '%s.%s': %s",
            module_path,
            attr_name,
            exc,
            exc_info=True,
        )
    return None


def register_routers(
        app: FastAPI,
        router_imports: Iterable[RouterImport],
        *,
        fail_fast: bool = False,
) -> tuple[List[str], List[str]]:
    registered: List[str] = []
    failed: List[str] = []
    for module_path, attr_name in router_imports:
        router = safe_import_router(module_path, attr_name)
        name = f"{module_path}.{attr_name}"
        if router:
            app.include_router(router)
            registered.append(name)
            logger.info("Registered router: %s", name)
        else:
            failed.append(name)
            logger.warning("Skipped router: %s (import failed)", name)
            if fail_fast:
                raise RuntimeError(f"Router import failed: {name}")
    return registered, failed
