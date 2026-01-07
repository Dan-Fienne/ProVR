#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

from typing import Optional, Sequence
from sqlalchemy.orm import Session
from backend.adapters.db import models


def get_user_by_id(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.username == username).first()


def create_user(db: Session, username: str, password_hash: str) -> models.User:
    user = models.User(username=username, password=password_hash)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_provider_link(db: Session, provider: str, provider_uid: str) -> Optional[models.UserProvider]:
    return (
        db.query(models.UserProvider)
        .filter(
            models.UserProvider.provider == provider,
            models.UserProvider.provider_uid == provider_uid,
        )
        .first()
    )


def link_provider(db: Session, user_id: int, provider: str, provider_uid: str) -> models.UserProvider:
    link = models.UserProvider(user_id=user_id, provider=provider, provider_uid=provider_uid)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def list_user_files(db: Session, user_id: int) -> Sequence[models.PDBFile]:
    return (
        db.query(models.PDBFile)
        .filter(models.PDBFile.user_id == user_id)
        .order_by(models.PDBFile.uploaded.desc(), models.PDBFile.id.desc())
        .all()
    )


def add_user_file(
        db: Session,
        user_id: int,
        filename: str,
        content: bytes,
        content_type: str | None,
) -> models.PDBFile:
    rec = models.PDBFile(
        user_id=user_id,
        filename=filename,
        content=content,
        size=len(content),
        content_type=content_type,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def get_user_file_by_id(db: Session, user_id: int, file_id: int) -> Optional[models.PDBFile]:
    return (
        db.query(models.PDBFile)
        .filter(models.PDBFile.user_id == user_id, models.PDBFile.id == file_id)
        .first()
    )


def get_latest_user_file_by_name(db: Session, user_id: int, filename: str) -> Optional[models.PDBFile]:
    return (
        db.query(models.PDBFile)
        .filter(models.PDBFile.user_id == user_id, models.PDBFile.filename == filename)
        .order_by(models.PDBFile.uploaded.desc(), models.PDBFile.id.desc())
        .first()
    )


def delete_user_file_by_id(db: Session, user_id: int, file_id: int) -> bool:
    rec = get_user_file_by_id(db, user_id, file_id)
    if not rec:
        return False
    db.delete(rec)
    db.commit()
    return True


def delete_latest_user_file_by_name(db: Session, user_id: int, filename: str) -> bool:
    rec = get_latest_user_file_by_name(db, user_id, filename)
    if not rec:
        return False
    db.delete(rec)
    db.commit()
    return True
