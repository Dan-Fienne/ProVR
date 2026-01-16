#!/usr/bin/env python
# -*- coding:utf-8 -*-
from __future__ import annotations

from typing import Optional, List
from pydantic import BaseModel, Field


class FilePath(BaseModel):
    filePath: str = Field(...)


class TokenResponse(BaseModel):
    token: str = Field(..., description="JWT 访问令牌")


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class FileInfo(BaseModel):
    filename: str
    url: str
