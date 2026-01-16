#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from backend.core.di import get_settings
from backend.core.settings import Settings
from backend.adapters.db.session import get_session
from backend.adapters.db import models
from backend.adapters.db import repositories as repo


def get_db() -> Session:
    return next(get_session())


def get_token(authorization: Optional[str] = Header(None, alias="Authorization")) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少或无效的 Authorization 头")
    return authorization.removeprefix("Bearer ").strip()


def current_user(
        token: str = Depends(get_token),
        db: Session = Depends(get_session),
        settings: Settings = Depends(get_settings),
) -> models.User:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algo])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token 已失效或不合法")

    uid = payload.get("uid")

    if uid is None:
        raise HTTPException(status_code=401, detail="Token 缺少 uid")
    user = repo.get_user_by_id(db, uid)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user
