#!/usr/bin/env python
# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Dict, List, Type
from fastapi import APIRouter, FastAPI
from pydantic import BaseModel
from importlib.metadata import entry_points
from pathlib import Path
import importlib.util
import importlib
import inspect
import logging
import pkgutil
import sys


logger = logging.getLogger(__name__)

# 基础插件协议
class BasePlugin(BaseModel):
    name: str
    title: str
    version: str = "0.1.0"
    router: APIRouter

    class Config:
        arbitrary_types_allowed = True
        extra = "ignore"


# 插件加载器
class PluginLoader(object):
    def __init__(self, search_paths: List[Path] ) -> None:
        self.search_paths = search_paths or [Path(__file__).resolve().parent / "plugins"]
        self.registry: Dict[str, BasePlugin] = {}

    def load_all(self) -> Dict[str, BasePlugin]:
        logger.info("Loading plugins")
        self._scan_filesystem()
        self._scan_entry_points()
        logger.info("Loading plugins done, loaded %d plugins", len(self.registry))
        return self.registry

    def mount_to_app(self, app: FastAPI) -> None:
        for plugin in self.registry.values():
            prefix = f"/plugins/{plugin.name}"
            app.include_router(plugin.router, prefix=prefix, tags=[plugin.title])

    def _scan_filesystem(self) -> None:
        for base_path in self.search_paths:
            if not base_path.exists():
                continue
            sys.path.append(str(base_path))
            for module_info in pkgutil.walk_packages([str(base_path)]):
                self._try_register(module_info.name)

    def _scan_entry_points(self) -> None:
        try:
            eps = entry_points()
            if hasattr(eps, "select"):                       # Python 3.10+
                selected = eps.select(group="vr_protein.plugins")
            else:                                            # Python <3.10
                selected = eps.get("vr_protein.plugins", [])
            for ep in selected:
                self._try_register(ep.value)
        except Exception as exc:
            logger.warning("扫描 entry_points 失败: %s", exc)

    def _try_register(self, module_path: str) -> None:
        try:
            module = importlib.import_module(module_path)
        except Exception as exc:
            logger.warning(f"[Plugin Loader] Failed to load module {module_path}: {exc}")
            return

        plugin_cls_candidates = [
            member
            for _, member in inspect.getmembers(module, inspect.isclass)
            if member.__name__ == "Plugin" and issubclass(member, BasePlugin)
        ]
        if not plugin_cls_candidates:
            return

        plugin_cls: Type[BasePlugin] = plugin_cls_candidates[0]
        plugin_instance = plugin_cls()

        if plugin_instance.name in self.registry:
            logger.error(f"[Plugin Loader] Duplicate plugin name {plugin_instance.name}")
            return
        self.registry[plugin_instance.name] = plugin_instance
        logger.info(f"[Plugin Loader] Registered plugin name {plugin_instance.name}")