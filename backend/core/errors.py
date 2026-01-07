#!/usr/bin/env python
# -*- coding:utf-8 -*-

from __future__ import annotations

from fastapi.responses import JSONResponse
from fastapi import FastAPI, Request
from pydantic import BaseModel


class AppError(RuntimeError):

    def __init__(self, message: str, *, code: str = "APP_ERROR", status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class ErrorPayload(BaseModel):
    code: str
    message: str


def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    payload = ErrorPayload(code=exc.code, message=str(exc))
    return JSONResponse(status_code=exc.status_code, content={"error": payload.model_dump()})


def _unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    payload = ErrorPayload(code="INTERNAL_ERROR", message="Internal server error")
    return JSONResponse(status_code=500, content={"error": payload.model_dump()})


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(Exception, _unhandled_error_handler)