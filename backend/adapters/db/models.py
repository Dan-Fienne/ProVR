#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from typing import List, Optional
import datetime

from sqlalchemy import (
    Integer,
    String,
    DateTime,
    ForeignKey,
    Index,
    func,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from backend.adapters.db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    files: Mapped[List["UserFile"]] = relationship(
        "UserFile", back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )
    providers: Mapped[List["UserProvider"]] = relationship(
        "UserProvider", back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class UserProvider(Base):
    __tablename__ = "user_providers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_uid: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user: Mapped[User] = relationship("User", back_populates="providers")
    __table_args__ = (
        Index("idx_provider_uid", "provider", "provider_uid"),
    )


class PDBFile(Base):
    __tablename__ = "user_files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_kind: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    storage_backend: Mapped[str] = mapped_column(String(32), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    checksum_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    uploaded_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner: Mapped[User] = relationship("User", back_populates="files")

    __table_args__ = (
        Index("idx_user_filename", "user_id", "original_filename"),
        Index("idx_user_uploaded", "user_id", "uploaded_at"),
        Index("idx_user_kind", "user_id", "file_kind"),
    )
