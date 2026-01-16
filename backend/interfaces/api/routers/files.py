#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

import hashlib
import re
import uuid
import datetime as dt
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.core.settings import Settings, get_settings
from backend.core.log import get_logger
from backend.adapters.db.session import get_session
from backend.adapters.db import models
from backend.adapters.db import repositories as repo
from backend.interfaces.api.routers.deps import current_user

router = APIRouter(tags=["files"])
logger = get_logger(__name__)


def _sanitize_filename(name: str) -> str:
    name = name.strip().replace("\\", "/")
    name = name.split("/")[-1]
    name = "".join(ch for ch in name if ch.isprintable())
    name = name.replace(" ", "_")
    if not name:
        return "file"
    return name[:200]


def _normalize_file_kind(kind: str | None) -> str:
    if not kind:
        return "generic"
    kind = kind.strip().lower()
    kind = re.sub(r"[^a-z0-9_-]+", "-", kind).strip("-")
    return kind or "generic"


def _storage_root(settings: Settings) -> Path:
    root = Path(settings.storage_local_dir).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _build_storage_path(
    settings: Settings, user_id: int, file_kind: str, original_filename: str
) -> tuple[Path, str]:
    today = dt.date.today()
    rel = Path("users") / f"user-{user_id}" / file_kind / f"{today.year}" / f"{today.month:02d}" / f"{today.day:02d}"
    stored_name = f"{uuid.uuid4().hex}__{original_filename}"
    abs_path = _storage_root(settings) / rel / stored_name
    return abs_path, str((rel / stored_name).as_posix())


async def _save_upload_to_disk(
    upload: UploadFile, dest: Path, max_size: int
) -> tuple[int, str]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = dest.with_suffix(dest.suffix + ".uploading")
    hasher = hashlib.sha256()
    size = 0

    try:
        with tmp_path.open("wb") as f:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_size:
                    raise HTTPException(413, f"文件过大，限制 {max_size // (1024 * 1024)} MB")
                hasher.update(chunk)
                f.write(chunk)
        tmp_path.replace(dest)
    except Exception:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except Exception:
                logger.warning("Failed to remove temp file", extra={"path": str(tmp_path)})
        raise

    return size, hasher.hexdigest()


def _validate_file(
    filename: str,
    content_type: str | None,
    settings: Settings,
) -> None:
    if not filename:
        raise HTTPException(400, "文件名不能为空")

    ext = Path(filename).suffix.lower()
    allowed_exts = settings.allowed_extensions or []
    if allowed_exts:
        if not ext or ext not in allowed_exts:
            raise HTTPException(400, f"不允许的文件扩展名：{ext or '无'}")

    allowed_mimes = settings.allowed_mime_types or []
    if allowed_mimes:
        if not content_type or content_type.lower() not in allowed_mimes:
            raise HTTPException(415, f"不允许的 MIME 类型：{content_type or '未知'}")


def _ensure_local_backend(settings: Settings) -> None:
    if settings.storage_backend != "local":
        raise HTTPException(501, "当前仅支持本地存储后端")


@router.post("/api/upload-file")
async def api_upload_file(
    file: UploadFile = File(...),
    file_kind: str | None = Form(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    _ensure_local_backend(settings)

    max_size = settings.max_upload_size
    original_filename = _sanitize_filename(file.filename or "")
    _validate_file(original_filename, file.content_type, settings)

    kind = _normalize_file_kind(file_kind)
    abs_path, rel_path = _build_storage_path(settings, user.id, kind, original_filename)

    size = 0
    checksum = None
    try:
        size, checksum = await _save_upload_to_disk(file, abs_path, max_size)

        rec = repo.add_user_file(
            db=db,
            user_id=user.id,
            original_filename=original_filename,
            file_kind=kind,
            storage_backend=settings.storage_backend,
            storage_path=rel_path,
            size=size,
            content_type=file.content_type,
            checksum_sha256=checksum,
        )
    except Exception:
        if abs_path.exists():
            try:
                abs_path.unlink()
            except Exception:
                logger.warning("Failed to remove file after error", extra={"path": str(abs_path)})
        raise

    return {
        "id": rec.id,
        "original_filename": rec.original_filename,
        "file_kind": rec.file_kind,
        "size": rec.size,
        "content_type": rec.content_type,
        "checksum_sha256": rec.checksum_sha256,
        "uploaded_at": rec.uploaded_at,
    }


@router.get("/api/my-files")
def api_my_files(
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
):
    files = repo.list_user_files(db, user.id)
    return [
        {
            "id": f.id,
            "original_filename": f.original_filename,
            "file_kind": f.file_kind,
            "size": f.size,
            "uploaded_at": f.uploaded_at,
            "content_type": f.content_type,
            "checksum_sha256": f.checksum_sha256,
            "storage_backend": f.storage_backend,
        }
        for f in files
    ]


@router.get("/api/file")
def api_get_file(
    file_id: int | None = Query(None),
    filename: str | None = Query(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    if file_id is not None:
        rec = repo.get_user_file_by_id(db, user.id, file_id)
    elif filename is not None:
        rec = repo.get_latest_user_file_by_name(db, user.id, filename)
    else:
        raise HTTPException(400, "需提供 file_id 或 filename")

    if not rec:
        raise HTTPException(404, "文件不存在")

    if rec.storage_backend != "local":
        raise HTTPException(501, "非本地存储文件暂不支持下载")

    root = _storage_root(settings)
    abs_path = (root / rec.storage_path).resolve()
    if not str(abs_path).startswith(str(root)):
        raise HTTPException(500, "存储路径异常")

    if not abs_path.exists():
        raise HTTPException(404, "文件不存在或已丢失")

    return FileResponse(
        path=str(abs_path),
        media_type=rec.content_type or "application/octet-stream",
        filename=rec.original_filename,
    )


@router.delete("/api/delete-file")
def api_delete_file(
    file_id: int | None = Query(None),
    filename: str | None = Query(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    if file_id is not None:
        rec = repo.get_user_file_by_id(db, user.id, file_id)
    elif filename is not None:
        rec = repo.get_latest_user_file_by_name(db, user.id, filename)
    else:
        raise HTTPException(400, "需提供 file_id 或 filename")

    if not rec:
        raise HTTPException(404, "文件不存在")

    missing_file = False
    if rec.storage_backend == "local":
        root = _storage_root(settings)
        abs_path = (root / rec.storage_path).resolve()
        if str(abs_path).startswith(str(root)) and abs_path.exists():
            try:
                abs_path.unlink()
            except Exception:
                logger.warning("Failed to delete file", extra={"path": str(abs_path)})
        else:
            missing_file = True

    repo.delete_user_file(db, rec)
    return {"detail": "删除成功", "missing_file": missing_file}