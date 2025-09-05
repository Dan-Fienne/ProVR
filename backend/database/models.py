#!/usr/bin/env python
# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import event, DDL, Index

from backend.craft.database import Base


class User(Base):
    # user
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()")
    )
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    pwd_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    pdb_quota: Mapped[str] = mapped_column(sa.Integer, server_default="100", nullable=False)

    created_at: Mapped[Any] = mapped_column(sa.TIMESTAMP(timezone=True),
                                            server_default=sa.text("now()"),
                                            nullable=False)
    updated_at: Mapped[Any] = mapped_column(sa.TIMESTAMP(timezone=True),
                                            server_default=sa.text("now()"),
                                            nullable=False)

    # 反向引用
    assets: Mapped[list["PDBAsset"]] = relationship(back_populates="user", cascade="all, delete")
    __table_args__ = (Index("idx_user_email_lower", sa.text("lower(email)"), unique=True),)


class PDBAsset(Base):
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()")
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        sa.ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )
    pdb_id: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    object_key: Mapped[str] = mapped_column(sa.String(512), nullable=False)
    file_size: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    atom_count: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[Any] = mapped_column(sa.TIMESTAMP(timezone=True),
                                            server_default=sa.text("now()"),
                                            nullable=False)
    updated_at: Mapped[Any] = mapped_column(sa.TIMESTAMP(timezone=True),
                                            server_default=sa.text("now()"),
                                            nullable=False)
    user: Mapped["User"] = relationship(back_populates="assets")

    __table_args__ = (
        # 多条件唯一：同个 user + pdb_id 不能重复（pdb_id 允许 NULL）
        sa.UniqueConstraint("user_id", "pdb_id", name="uq_user_pdb"),
        # 用于按用户查最近上传
        Index("idx_assets_user_created", "user_id", "created_at"),
        # pdb_id 前缀搜索
        Index(
            "idx_assets_pdb_id_pattern",
            "pdb_id",
            postgresql_ops={"pdb_id": "text_pattern_ops"},
        ),
        # meta GIN
        Index(
            "idx_assets_meta_gin",
            "meta",
            postgresql_using="gin",
            postgresql_ops={"meta": "jsonb_path_ops"},
        ),
    )


# 触发器 DDL
updated_at_fn = DDL(
    """
    CREATE OR REPLACE FUNCTION trg_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    """
)

for table in ("user", "pdb_asset"):
    updated_at_trigger = DDL(
        f"""
            CREATE TRIGGER set_updated_at_{table}
            BEFORE UPDATE ON {table}
            FOR EACH ROW
            EXECUTE FUNCTION trg_set_updated_at();
        """
    )
    # 注册到 metadata after_create
    event.listen(Base.metadata, "after_create", updated_at_trigger)

event.listen(Base.metadata, "after_create", updated_at_fn)

# 用户配额检查
quota_fn = DDL(
    """
    CREATE OR REPLACE FUNCTION trg_check_user_quota()
    RETURNS TRIGGER AS $$
    DECLARE
        cnt INTEGER;
        quota INTEGER;
    BEGIN
        SELECT pdb_quota INTO quota FROM "user" WHERE id = NEW.user_id;
        SELECT COUNT(*) INTO cnt FROM pdb_asset WHERE user_id = NEW.user_id;
        IF cnt >= quota THEN
            RAISE EXCEPTION 'Upload quota exceeded (%% > %% files)', cnt, quota;
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
"""
)

quota_trigger = DDL(
    """
    CREATE TRIGGER check_user_quota
    BEFORE INSERT ON pdb_asset
    FOR EACH ROW
    EXECUTE FUNCTION trg_check_user_quota();
"""
)

event.listen(Base.metadata, "after_create", quota_fn)
event.listen(Base.metadata, "after_create", quota_trigger)


if __name__ == '__main__':
    a = User()
    print(a.__tablename__)
