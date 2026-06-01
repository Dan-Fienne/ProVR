#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from backend.adapters.db import repositories as repo
from backend.adapters.storage.local import LocalFileStorage
from backend.domain.files import (
    DeleteUserFileResult,
    FileTooLarge,
    InvalidFileRequest,
    UnsupportedFileType,
    UnsupportedStorageBackend,
    UserFileContent,
    UserFileDTO,
    UserFileNotFound,
    normalize_file_kind,
)


class UserFileService:
    def __init__(
        self,
        *,
        storage_backend: str,
        local_storage: LocalFileStorage,
        max_upload_size: int,
        allowed_extensions: Optional[Iterable[str]] = None,
        allowed_mime_types: Optional[Iterable[str]] = None,
    ) -> None:
        self.storage_backend = storage_backend
        self.local_storage = local_storage
        self.max_upload_size = int(max_upload_size)
        self.allowed_extensions = {e.lower() for e in (allowed_extensions or [])}
        self.allowed_mime_types = {m.lower() for m in (allowed_mime_types or [])}

    def upload_user_file(
        self,
        *,
        db: Session,
        user_id: int,
        original_filename: str,
        content_type: Optional[str],
        data: bytes,
        file_kind: Optional[str] = None,
    ) -> UserFileDTO:
        self._ensure_local_backend()
        filename = self.local_storage.sanitize_filename(original_filename)
        self._validate_upload(filename, content_type, data)
        kind = normalize_file_kind(file_kind)

        stored = self.local_storage.save_user_file(
            user_id=user_id,
            file_kind=kind,
            original_filename=filename,
            data=data,
        )

        try:
            rec = repo.create_user_file(
                db=db,
                user_id=user_id,
                original_filename=filename,
                file_kind=kind,
                storage_backend=self.storage_backend,
                storage_path=stored.storage_path,
                size=stored.size,
                content_type=content_type,
                checksum_sha256=stored.checksum_sha256,
            )
        except Exception:
            self.local_storage.delete(stored.storage_path)
            raise

        return self._to_dto(rec)

    def list_user_files(self, *, db: Session, user_id: int) -> list[UserFileDTO]:
        return [self._to_dto(rec) for rec in repo.list_user_files(db, user_id)]

    def get_user_file(
        self,
        *,
        db: Session,
        user_id: int,
        file_id: Optional[int] = None,
        filename: Optional[str] = None,
    ) -> UserFileDTO:
        rec = self._get_record(db=db, user_id=user_id, file_id=file_id, filename=filename)
        return self._to_dto(rec)

    def get_user_file_content(
        self,
        *,
        db: Session,
        user_id: int,
        file_id: Optional[int] = None,
        filename: Optional[str] = None,
    ) -> UserFileContent:
        rec = self._get_record(db=db, user_id=user_id, file_id=file_id, filename=filename)
        if rec.storage_backend != "local":
            raise UnsupportedStorageBackend("Only local file storage is currently supported")
        path = self.local_storage.resolve_existing_path(rec.storage_path)
        dto = self._to_dto(rec)
        return UserFileContent(
            file=dto,
            path=str(path),
            media_type=rec.content_type or "application/octet-stream",
            filename=rec.original_filename,
        )

    def delete_user_file(
        self,
        *,
        db: Session,
        user_id: int,
        file_id: Optional[int] = None,
        filename: Optional[str] = None,
    ) -> DeleteUserFileResult:
        rec = self._get_record(db=db, user_id=user_id, file_id=file_id, filename=filename)
        missing_file = False
        if rec.storage_backend == "local":
            try:
                missing_file = not self.local_storage.delete(rec.storage_path)
            except UserFileNotFound:
                missing_file = True
        repo.delete_user_file(db, rec)
        return DeleteUserFileResult(detail="delete success", missing_file=missing_file)

    def _get_record(
        self,
        *,
        db: Session,
        user_id: int,
        file_id: Optional[int],
        filename: Optional[str],
    ):
        if file_id is not None:
            rec = repo.get_user_file_by_id(db, user_id, file_id)
        elif filename:
            rec = repo.get_latest_user_file_by_name(db, user_id, filename)
        else:
            raise InvalidFileRequest("file_id or filename is required")
        if not rec:
            raise UserFileNotFound("File not found")
        return rec

    def _validate_upload(
        self,
        filename: str,
        content_type: Optional[str],
        data: bytes,
    ) -> None:
        if not filename:
            raise InvalidFileRequest("filename is required")
        if data is None:
            raise InvalidFileRequest("file content is required")
        if len(data) > self.max_upload_size:
            raise FileTooLarge(f"file exceeds max upload size: {self.max_upload_size}")

        ext = Path(filename).suffix.lower()
        if self.allowed_extensions and ext not in self.allowed_extensions:
            raise UnsupportedFileType(f"file extension is not allowed: {ext or 'none'}")

        if self.allowed_mime_types:
            actual = (content_type or "").lower()
            if actual not in self.allowed_mime_types:
                raise UnsupportedFileType(f"content type is not allowed: {content_type or 'unknown'}")

    def _ensure_local_backend(self) -> None:
        if self.storage_backend != "local":
            raise UnsupportedStorageBackend("Only local file storage is currently supported")

    @staticmethod
    def _to_dto(rec) -> UserFileDTO:
        return UserFileDTO(
            id=rec.id,
            original_filename=rec.original_filename,
            filename=rec.original_filename,
            file_kind=rec.file_kind,
            storage_backend=rec.storage_backend,
            storage_path=rec.storage_path,
            size=rec.size,
            uploaded_at=rec.uploaded_at,
            content_type=rec.content_type,
            checksum_sha256=rec.checksum_sha256,
        )

