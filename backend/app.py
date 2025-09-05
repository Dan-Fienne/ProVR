#!/usr/bin/env python
# -*- coding: utf-8 -*-

from fastapi import FastAPI, Depends, Request
from fastapi.responses import JSONResponse, HTMLResponse

import sqlalchemy as sa
from pathlib import Path
from backend.craft.plugin_loader import PluginLoader
from backend.craft.settings import get_settings
from backend.craft.logger import init_logging, get_logger
from backend.craft.database import get_session
from backend.craft.app import create_app

from fastapi.templating import Jinja2Templates



init_logging()

logger = get_logger(__name__)
settings = get_settings()
app = create_app()

templates = Jinja2Templates(directory=settings.template_dir)

search_paths = [Path(__file__).resolve().parent.parent / "backend/plugins"]
loader = PluginLoader(search_paths=search_paths)
loader.load_all()
loader.mount_to_app(app)

@app.get("/ping_db")
async def ping_db(db=Depends(get_session)):
    row = await db.execute(sa.text("SELECT now()"))
    return {"server_time": row.scalar_one()}


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    user = request.session.get("user")
    return templates.TemplateResponse(
        "login.html" if not user else "base.html",
        {"request": request, "user": user},
    )