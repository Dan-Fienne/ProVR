#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


class FileServiceError(RuntimeError):
    status_code = 400


class InvalidFileRequest(FileServiceError):
    status_code = 400


class FileTooLarge(FileServiceError):
    status_code = 413


class UnsupportedFileType(FileServiceError):
    status_code = 415


class UserFileNotFound(FileServiceError):
    status_code = 404


class UnsupportedStorageBackend(FileServiceError):
    status_code = 501


@dataclass(frozen=True)
class StoredFile:
    storage_path: str
    size: int
    checksum_sha256: str


@dataclass(frozen=True)
class UserFileDTO:
    id: int
    original_filename: str
    filename: str
    file_kind: Optional[str]
    storage_backend: str
    storage_path: str
    size: int
    uploaded_at: datetime
    content_type: Optional[str]
    checksum_sha256: Optional[str]


@dataclass(frozen=True)
class UserFileContent:
    file: UserFileDTO
    path: str
    media_type: str
    filename: str


@dataclass(frozen=True)
class DeleteUserFileResult:
    detail: str
    missing_file: bool


def normalize_file_kind(kind: str | None) -> str:
    if not kind:
        return "generic"
    cleaned = []
    for ch in kind.strip().lower():
        if ch.isalnum() or ch in ("_", "-"):
            cleaned.append(ch)
        elif cleaned and cleaned[-1] != "-":
            cleaned.append("-")
    return "".join(cleaned).strip("-") or "generic"

