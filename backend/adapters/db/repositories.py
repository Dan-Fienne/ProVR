#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

from typing import Optional, Sequence
from sqlalchemy.orm import Session
from backend.adapters.db import models


def _commit(db: Session) -> None:
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def get_user_by_id(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.username == username).first()


def create_user(db: Session, username: str, password_hash: str) -> models.User:
    user = models.User(username=username, password=password_hash)
    db.add(user)
    _commit(db)
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
    _commit(db)
    db.refresh(link)
    return link


def list_user_files(db: Session, user_id: int) -> Sequence[models.UserFile]:
    return (
        db.query(models.UserFile)
        .filter(models.UserFile.user_id == user_id)
        .order_by(models.UserFile.uploaded_at.desc(), models.UserFile.id.desc())
        .all()
    )


def add_user_file(
    db: Session,
    user_id: int,
    *,
    original_filename: str,
    file_kind: Optional[str],
    storage_backend: str,
    storage_path: str,
    size: int,
    content_type: Optional[str],
    checksum_sha256: Optional[str],
) -> models.UserFile:
    rec = models.UserFile(
        user_id=user_id,
        original_filename=original_filename,
        file_kind=file_kind,
        storage_backend=storage_backend,
        storage_path=storage_path,
        size=size,
        content_type=content_type,
        checksum_sha256=checksum_sha256,
    )
    db.add(rec)
    _commit(db)
    db.refresh(rec)
    return rec


def get_user_file_by_id(db: Session, user_id: int, file_id: int) -> Optional[models.UserFile]:
    return (
        db.query(models.UserFile)
        .filter(models.UserFile.user_id == user_id, models.UserFile.id == file_id)
        .first()
    )


def get_latest_user_file_by_name(db: Session, user_id: int, filename: str) -> Optional[models.UserFile]:
    return (
        db.query(models.UserFile)
        .filter(models.UserFile.user_id == user_id, models.UserFile.original_filename == filename)
        .order_by(models.UserFile.uploaded_at.desc(), models.UserFile.id.desc())
        .first()
    )


def delete_user_file(db: Session, rec: models.UserFile) -> None:
    db.delete(rec)
    _commit(db)


def delete_user_file_by_id(db: Session, user_id: int, file_id: int) -> bool:
    rec = get_user_file_by_id(db, user_id, file_id)
    if not rec:
        return False
    delete_user_file(db, rec)
    return True


def delete_latest_user_file_by_name(db: Session, user_id: int, filename: str) -> bool:
    rec = get_latest_user_file_by_name(db, user_id, filename)
    if not rec:
        return False
    delete_user_file(db, rec)
    return True