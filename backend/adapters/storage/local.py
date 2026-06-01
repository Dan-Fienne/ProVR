#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

import datetime as dt
import hashlib
import uuid
from pathlib import Path

from backend.domain.files import StoredFile, InvalidFileRequest, UserFileNotFound


class LocalFileStorage:
    def __init__(self, root_dir: str) -> None:
        self.root = Path(root_dir).expanduser().resolve()

    def save_user_file(
        self,
        *,
        user_id: int,
        file_kind: str,
        original_filename: str,
        data: bytes,
    ) -> StoredFile:
        filename = self.sanitize_filename(original_filename)
        today = dt.date.today()
        rel_dir = (
            Path("users")
            / f"user-{user_id}"
            / file_kind
            / f"{today.year}"
            / f"{today.month:02d}"
            / f"{today.day:02d}"
        )
        stored_name = f"{uuid.uuid4().hex}__{filename}"
        rel_path = rel_dir / stored_name
        abs_path = self._resolve_write_path(rel_path)
        abs_path.parent.mkdir(parents=True, exist_ok=True)

        tmp_path = abs_path.with_suffix(abs_path.suffix + ".uploading")
        checksum = hashlib.sha256(data).hexdigest()
        try:
            with tmp_path.open("wb") as f:
                f.write(data)
            tmp_path.replace(abs_path)
        except Exception:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except Exception:
                    pass
            raise

        return StoredFile(
            storage_path=rel_path.as_posix(),
            size=len(data),
            checksum_sha256=checksum,
        )

    def resolve_existing_path(self, storage_path: str) -> Path:
        path = self._resolve_storage_path(storage_path)
        if not path.exists() or not path.is_file():
            raise UserFileNotFound("File does not exist on local storage")
        return path

    def delete(self, storage_path: str) -> bool:
        path = self._resolve_storage_path(storage_path)
        if not path.exists():
            return False
        if not path.is_file():
            raise InvalidFileRequest("Storage path is not a file")
        try:
            path.unlink()
        except FileNotFoundError:
            return False
        return True

    @staticmethod
    def sanitize_filename(name: str) -> str:
        cleaned = str(name or "").strip().replace("\\", "/").split("/")[-1]
        cleaned = "".join(ch for ch in cleaned if ch.isprintable())
        cleaned = cleaned.replace(" ", "_")
        return (cleaned or "file")[:200]

    def _resolve_write_path(self, rel_path: Path) -> Path:
        self.root.mkdir(parents=True, exist_ok=True)
        return self._assert_inside_root((self.root / rel_path).resolve())

    def _resolve_storage_path(self, storage_path: str) -> Path:
        if not storage_path:
            raise InvalidFileRequest("Storage path is required")
        rel_path = Path(storage_path)
        if rel_path.is_absolute():
            raise InvalidFileRequest("Absolute storage paths are not allowed")
        return self._assert_inside_root((self.root / rel_path).resolve())

    def _assert_inside_root(self, path: Path) -> Path:
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise InvalidFileRequest("Storage path escapes storage root") from exc
        return path
