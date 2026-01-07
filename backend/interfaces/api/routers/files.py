#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

import io
from typing import List

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.core.settings import Settings, get_settings
from backend.adapters.db.session import get_session
from backend.adapters.db import models
from backend.adapters.db import repositories as repo
from backend.interfaces.api.deps import current_user

router = APIRouter(tags=["files"])

# 默认 20MB，可由 settings.max_upload_size 覆盖
DEFAULT_MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


@router.post("/api/upload-pdb")
async def api_upload_pdb(
    file: UploadFile = File(...),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    max_size = getattr(settings, "max_upload_size", DEFAULT_MAX_FILE_SIZE)
    filename = file.filename
    if not filename.lower().endswith((".pdb", ".cif")):
        raise HTTPException(400, "仅允许 .pdb / .cif 文件")

    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(413, f"文件过大，限制 {max_size // (1024*1024)} MB")

    rec = repo.add_user_file(
        db=db,
        user_id=user.id,
        filename=filename,
        content=content,
        content_type=file.content_type,
    )

    return {
        "id": rec.id,
        "filename": rec.filename,
        "size": rec.size,
        "content_type": rec.content_type,
        "uploaded": rec.uploaded,
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
            "filename": f.filename,
            "size": f.size,
            "uploaded": f.uploaded,
            "content_type": f.content_type,
        }
        for f in files
    ]


@router.get("/api/file")
def api_get_file(
    file_id: int | None = Query(None),
    filename: str | None = Query(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
):
    if file_id is not None:
        rec = repo.get_user_file_by_id(db, user.id, file_id)
    elif filename is not None:
        rec = repo.get_latest_user_file_by_name(db, user.id, filename)
    else:
        raise HTTPException(400, "需提供 file_id 或 filename")

    if not rec:
        raise HTTPException(404, "文件不存在")

    media_type = rec.content_type or "chemical/x-pdb"
    return StreamingResponse(
        io.BytesIO(rec.content),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{rec.filename}"',
            "Content-Length": str(rec.size),
        },
    )


@router.delete("/api/delete-pdb")
def api_delete_pdb(
    file_id: int | None = Query(None),
    filename: str | None = Query(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
):
    if file_id is not None:
        ok = repo.delete_user_file_by_id(db, user.id, file_id)
    elif filename is not None:
        ok = repo.delete_latest_user_file_by_name(db, user.id, filename)
    else:
        raise HTTPException(400, "需提供 file_id 或 filename")

    if not ok:
        raise HTTPException(404, "文件不存在")
    return {"detail": "删除成功"}