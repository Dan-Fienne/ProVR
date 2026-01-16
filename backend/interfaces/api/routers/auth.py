#!/usr/bin/env python
# -*- coding:utf-8 -*-
#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

import urllib.parse

from fastapi import APIRouter, Depends, Form, Query
from fastapi.responses import RedirectResponse

from sqlalchemy.orm import Session

from backend.core.settings import Settings, get_settings
from backend.adapters.db.session import get_session
from backend.domain.services import auth as auth_svc
from backend.domain.services import oauth as oauth_svc

router = APIRouter(tags=["auth"])


@router.post("/api/register")
def api_register(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    token = auth_svc.register_user(username, password, db, settings)
    return {"token": token}


@router.post("/api/login")
def api_login(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    token = auth_svc.login_user(username, password, db, settings)
    return {"token": token}


# ---------- GitHub ----------
@router.get("/login/github")
async def login_github(settings: Settings = Depends(get_settings)):
    url = await oauth_svc.github_login_url(settings)
    return RedirectResponse(url)


@router.get("/auth/github/callback")
async def github_callback(
    code: str = Query(None),
    state: str = Query(None),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    if not code or not state:
        return RedirectResponse(url="/?error=invalid_code_or_state", status_code=302)
    target = await oauth_svc.github_callback(code, state, db, settings)
    return RedirectResponse(target)


# ---------- Google ----------
@router.get("/login/google")
async def login_google(settings: Settings = Depends(get_settings)):
    url = await oauth_svc.google_login_url(settings)
    return RedirectResponse(url)


@router.get("/auth/google/callback")
async def google_callback(
    code: str = Query(None),
    state: str = Query(None),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    if not code or not state:
        return RedirectResponse(url="/?error=invalid_code_or_state", status_code=302)
    target = await oauth_svc.google_callback(code, state, db, settings)
    return RedirectResponse(target)


# ---------- WeChat ----------
@router.get("/login/wechat")
async def login_wechat(settings: Settings = Depends(get_settings)):
    url = await oauth_svc.wechat_login_url(settings)
    return RedirectResponse(url)


@router.get("/auth/wechat/callback")
async def wechat_callback(
    code: str = Query(None),
    state: str = Query(None),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    if not code or not state:
        return RedirectResponse(url="/?error=invalid_code_or_state", status_code=302)
    target = await oauth_svc.wechat_callback(code, state, db, settings)
    return RedirectResponse(target)