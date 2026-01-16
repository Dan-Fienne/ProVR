#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

import datetime
import secrets
import urllib.parse
from typing import Optional, Dict, Any

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.core.settings import Settings
from backend.adapters.db import repositories as repo
from backend.adapters.db import models
from backend.domain.auth import create_token
from passlib.hash import bcrypt


class StateStore:
    def __init__(self):
        self._store: Dict[str, Dict[str, Any]] = {}

    def issue(self, next_path: str = "/vr") -> str:
        s = secrets.token_urlsafe(24)
        self._store[s] = {"next": next_path, "ts": datetime.datetime.utcnow().timestamp()}
        return s

    def pop(self, state: str) -> Optional[Dict[str, Any]]:
        return self._store.pop(state, None)


state_store = StateStore()


def login_or_create_user_by_provider(
    db: Session,
    settings: Settings,
    provider: str,
    provider_uid: str,
    default_name: Optional[str] = None,
) -> str:
    link = repo.get_provider_link(db, provider, provider_uid)
    if link:
        uid = link.user_id
    else:
        base_name = default_name or f"{provider}_{provider_uid}"
        name = base_name
        i = 1
        while repo.get_user_by_username(db, name):
            i += 1
            name = f"{base_name}_{i}"
        user = repo.create_user(db, username=name, password_hash=bcrypt.hash(secrets.token_urlsafe(16)))
        repo.link_provider(db, user_id=user.id, provider=provider, provider_uid=provider_uid)
        uid = user.id
    return create_token({"uid": uid}, settings)


async def github_login_url(settings: Settings) -> str:
    state = state_store.issue()
    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": f"{settings.oauth_redirect_base}/auth/github/callback",
        "scope": "read:user user:email",
        "state": state,
        "allow_signup": "true",
    }
    return f"{settings.github_auth_url}?{urllib.parse.urlencode(params)}"


async def github_callback(
    code: str,
    state: str,
    db: Session,
    settings: Settings,
) -> str:
    meta = state_store.pop(state)
    if not meta:
        raise HTTPException(status_code=400, detail="Invalid state")
    async with httpx.AsyncClient(headers={"Accept": "application/json"}) as client:
        token_res = await client.post(settings.github_token_url, data={
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret,
            "code": code,
            "redirect_uri": f"{settings.oauth_redirect_base}/auth/github/callback",
            "state": state
        })
        token_res.raise_for_status()
        tk = token_res.json()
        access_token = tk.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Failed to get access_token")
    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    ) as client:
        ures = await client.get(settings.github_user_url)
        ures.raise_for_status()
        uinfo = ures.json()
    provider_uid = str(uinfo.get("id"))
    default_name = uinfo.get("login") or f"github_{provider_uid}"
    token = login_or_create_user_by_provider(db, settings, "github", provider_uid, default_name)
    next_path = meta.get("next", "/vr")
    return f"{next_path}#access_token={urllib.parse.quote(token)}"


async def google_login_url(settings: Settings) -> str:
    state = state_store.issue()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": f"{settings.oauth_redirect_base}/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent"
    }
    return f"{settings.google_auth_url}?{urllib.parse.urlencode(params)}"


async def google_callback(
    code: str,
    state: str,
    db: Session,
    settings: Settings,
) -> str:
    if not state_store.pop(state):
        raise HTTPException(status_code=400, detail="Invalid state")
    async with httpx.AsyncClient() as client:
        tres = await client.post(settings.google_token_url, data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": f"{settings.oauth_redirect_base}/auth/google/callback",
            "grant_type": "authorization_code"
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        tres.raise_for_status()
        tdata = tres.json()
        access_token = tdata.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Failed to get token")
    async with httpx.AsyncClient(headers={"Authorization": f"Bearer {access_token}"}) as client:
        ures = await client.get(settings.google_userinfo_url)
        ures.raise_for_status()
        uinfo = ures.json()
    provider_uid = uinfo.get("sub")
    default_name = (uinfo.get("email") or uinfo.get("name") or f"google_{provider_uid}").split("@")[0]
    token = login_or_create_user_by_provider(db, settings, "google", provider_uid, default_name)
    return f"/vr#access_token={urllib.parse.quote(token)}"


async def wechat_login_url(settings: Settings) -> str:
    state = state_store.issue()
    params = {
        "appid": settings.wechat_app_id,
        "redirect_uri": f"{settings.oauth_redirect_base}/auth/wechat/callback",
        "response_type": "code",
        "scope": "snsapi_login",
        "state": state
    }
    return f"{settings.wechat_qr_auth_url}?{urllib.parse.urlencode(params)}#wechat_redirect"


async def wechat_callback(
    code: str,
    state: str,
    db: Session,
    settings: Settings,
) -> str:
    if not state_store.pop(state):
        raise HTTPException(status_code=400, detail="Invalid state")
    async with httpx.AsyncClient() as client:
        token_res = await client.get(settings.wechat_token_url, params={
            "appid": settings.wechat_app_id,
            "secret": settings.wechat_app_secret,
            "code": code,
            "grant_type": "authorization_code"
        })
        token_res.raise_for_status()
        tk = token_res.json()
        if "errcode" in tk and tk["errcode"] != 0:
            raise HTTPException(status_code=400, detail=f"WeChat token error: {tk}")
        access_token = tk.get("access_token")
        openid = tk.get("openid")
    if not access_token or not openid:
        raise HTTPException(status_code=400, detail="Failed to get access_token/openid")
    provider_uid = openid
    default_name = f"wx_{openid[:8]}"
    token = login_or_create_user_by_provider(db, settings, "wechat", provider_uid, default_name)
    return f"/vr#access_token={urllib.parse.quote(token)}"