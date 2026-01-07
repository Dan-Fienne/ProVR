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
    LargeBinary,
    func,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from backend.adapters.db.session import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    files: Mapped[List["PDBFile"]] = relationship(
        "PDBFile", back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
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
    __tablename__ = "pdb_files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    uploaded: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner: Mapped[User] = relationship("User", back_populates="files")
    __table_args__ = (
        Index("idx_user_filename", "user_id", "filename"),
        Index("idx_user_uploaded", "user_id", "uploaded"),
    )