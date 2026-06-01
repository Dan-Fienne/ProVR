#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.adapters.db import models
from backend.adapters.db.session import get_session
from backend.adapters.storage.local import LocalFileStorage
from backend.application.file_service import UserFileService
from backend.core.settings import Settings, get_settings
from backend.domain.files import FileServiceError, UserFileNotFound
from backend.interfaces.api.routers.deps import current_user
from backend.interfaces.api.schemas.files import DeleteFileResponse, UserFileResponse

router = APIRouter(tags=["files"])


def _service(settings: Settings) -> UserFileService:
    return UserFileService(
        storage_backend=settings.storage_backend,
        local_storage=LocalFileStorage(settings.storage_local_dir),
        max_upload_size=settings.max_upload_size,
        allowed_extensions=settings.allowed_extensions,
        allowed_mime_types=settings.allowed_mime_types,
    )


def _to_response(file) -> UserFileResponse:
    return UserFileResponse(
        id=file.id,
        original_filename=file.original_filename,
        filename=file.filename,
        file_kind=file.file_kind,
        size=file.size,
        uploaded_at=file.uploaded_at,
        content_type=file.content_type,
        checksum_sha256=file.checksum_sha256,
        storage_backend=file.storage_backend,
        download_url=f"/api/files/content?file_id={file.id}",
    )


def _raise_http(exc: FileServiceError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=str(exc))


async def _read_upload(upload: UploadFile) -> bytes:
    return await upload.read()


@router.post("/api/files", response_model=UserFileResponse)
async def api_upload_file_v2(
    file: UploadFile = File(...),
    file_kind: Optional[str] = Form(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    try:
        created = _service(settings).upload_user_file(
            db=db,
            user_id=user.id,
            original_filename=file.filename or "",
            content_type=file.content_type,
            data=await _read_upload(file),
            file_kind=file_kind,
        )
        return _to_response(created)
    except FileServiceError as exc:
        _raise_http(exc)


@router.post("/api/upload-file", response_model=UserFileResponse, deprecated=True)
async def api_upload_file_legacy(
    file: UploadFile = File(...),
    file_kind: Optional[str] = Form(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    return await api_upload_file_v2(file, file_kind, user, db, settings)


@router.post("/api/upload-pdb", response_model=UserFileResponse, deprecated=True)
async def api_upload_pdb_legacy(
    file: UploadFile = File(...),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    return await api_upload_file_v2(file, "pdb", user, db, settings)


@router.get("/api/files", response_model=list[UserFileResponse])
def api_list_files_v2(
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    return [_to_response(file) for file in _service(settings).list_user_files(db=db, user_id=user.id)]


@router.get("/api/my-files", response_model=list[UserFileResponse], deprecated=True)
def api_my_files_legacy(
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    return api_list_files_v2(user, db, settings)


@router.get("/api/files/content")
def api_get_file_content_v2(
    file_id: Optional[int] = Query(None),
    filename: Optional[str] = Query(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    try:
        content = _service(settings).get_user_file_content(
            db=db,
            user_id=user.id,
            file_id=file_id,
            filename=filename,
        )
    except FileServiceError as exc:
        _raise_http(exc)
    return FileResponse(
        path=content.path,
        media_type=content.media_type,
        filename=content.filename,
    )


@router.get("/api/file", deprecated=True)
def api_get_file_legacy(
    file_id: Optional[int] = Query(None),
    filename: Optional[str] = Query(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    return api_get_file_content_v2(file_id, filename, user, db, settings)


@router.get("/api/pdb/{pdb_id}", deprecated=True)
def api_get_pdb_legacy(
    pdb_id: str,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    base = str(pdb_id or "").strip().replace(".pdb", "")
    candidates = [f"{base}.pdb", f"{base.lower()}.pdb", f"{base.upper()}.pdb"]
    last_error: Optional[FileServiceError] = None
    for filename in dict.fromkeys(candidates):
        try:
            return api_get_file_content_v2(None, filename, user, db, settings)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            last_error = UserFileNotFound(str(exc.detail))
    if last_error:
        _raise_http(last_error)
    raise HTTPException(status_code=404, detail="File not found")


@router.delete("/api/files", response_model=DeleteFileResponse)
def api_delete_file_v2(
    file_id: Optional[int] = Query(None),
    filename: Optional[str] = Query(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    try:
        result = _service(settings).delete_user_file(
            db=db,
            user_id=user.id,
            file_id=file_id,
            filename=filename,
        )
        return DeleteFileResponse(detail=result.detail, missing_file=result.missing_file)
    except FileServiceError as exc:
        _raise_http(exc)


@router.delete("/api/delete-file", response_model=DeleteFileResponse, deprecated=True)
def api_delete_file_legacy(
    file_id: Optional[int] = Query(None),
    filename: Optional[str] = Query(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    return api_delete_file_v2(file_id, filename, user, db, settings)


@router.delete("/api/delete-pdb", response_model=DeleteFileResponse, deprecated=True)
def api_delete_pdb_legacy(
    filename: Optional[str] = Query(None),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    return api_delete_file_v2(None, filename, user, db, settings)

