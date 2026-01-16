#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from backend.core.settings import get_settings

router = APIRouter(tags=["pages"])

settings = get_settings()
templates = Jinja2Templates(directory=settings.templates_dir)


@router.get("/", response_class=HTMLResponse)
def page_index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("index.html", {"request": request})


@router.get("/dashboard", response_class=HTMLResponse)
def page_dashboard(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("dashboard.html", {"request": request})


@router.get("/vr", response_class=HTMLResponse)
def page_vr(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("vr.html", {"request": request})
