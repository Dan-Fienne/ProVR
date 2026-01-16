#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

import datetime
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from jose import jwt, JWTError
from passlib.hash import bcrypt
from sqlalchemy.orm import Session

from backend.core.settings import Settings
from backend.adapters.db import repositories as repo
from backend.adapters.db import models


def _ensure_user_upload_dir(base_dir: Path, user_id: int) -> Path:
    user_dir = base_dir / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir


def create_token(data: dict, settings: Settings) -> str:
    to_encode = data.copy()
    exp = datetime.datetime.utcnow() + datetime.timedelta(minutes=settings.token_expires_min)
    to_encode.update(exp=exp)
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algo)


def verify_token(token: str, settings: Settings) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algo])
    except JWTError:
        return None


def register_user(
        username: str,
        password: str,
        db: Session,
        settings: Settings,
) -> str:
    if repo.get_user_by_username(db, username):
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = repo.create_user(db, username=username, password_hash=bcrypt.hash(password))
    _ensure_user_upload_dir(Path(settings.uploads_dir), user.id)
    return create_token({"uid": user.id}, settings)


def login_user(
        username: str,
        password: str,
        db: Session,
        settings: Settings,
) -> str:
    user = repo.get_user_by_username(db, username)
    if not user or not bcrypt.verify(password, user.password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return create_token({"uid": user.id}, settings)
