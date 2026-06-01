#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

import datetime as dt
from typing import Optional

from pydantic import BaseModel, Field


class UserFileResponse(BaseModel):
    id: int
    original_filename: str
    filename: str
    file_kind: Optional[str] = None
    size: int
    uploaded_at: dt.datetime
    content_type: Optional[str] = None
    checksum_sha256: Optional[str] = None
    storage_backend: str
    download_url: str


class DeleteFileResponse(BaseModel):
    detail: str = Field(...)
    missing_file: bool = Field(False)

