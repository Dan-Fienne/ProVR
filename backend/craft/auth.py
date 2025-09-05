#!/usr/bin/env python
# -*- coding: utf-8 -*-

from fastapi import APIRouter, Depends, Request
from starlette.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth
from backend.craft.settings import get_settings

settings = get_settings()
router = APIRouter()
oauth = OAuth()


oauth.register(
    name="github",
    client_id=settings.github_client_id,
    client_secret=settings.github_client_secret,
    authorize_url="https://github.com/login/oauth/authorize",
    access_token_url="https://github.com/login/oauth/access_token",
    api_base_url="https://api.github.com/",
    client_kwargs={"scope": "read:user user:email"}
)
# Routes
@router.get('/login/{provider}')
async def login(request: Request, provider: str):
    redirect_uri = request.url_for('auth_callback', provider=provider)
    return await oauth.create_client(provider).authorize_redirect(request, redirect_uri)

@router.get("/auth/{provider}/callback")
async def auth_callback(request: Request, provider: str):
    oauth_client = oauth.create_client(provider)
    token = await oauth_client.authorize_access_token(request)

    if provider in ("google", "apple"):
        # 这两家是真·OIDC，响应里自带 id_token
        user = await oauth_client.parse_id_token(request, token)

    elif provider == "github":
        resp = await oauth_client.get("user", token=token)
        profile = resp.json()

        email = profile.get("email")
        if not email:
            emails_resp = await oauth_client.get("user/emails", token=token)
            emails = emails_resp.json()
            primary = next((e for e in emails if e.get("primary") and e.get("verified")), None)
            email = primary["email"] if primary else None

        user = {
            "sub": str(profile["id"]),
            "name": profile.get("name") or profile["login"],
            "email": email,
            "avatar": profile["avatar_url"],
            "provider": "github",
        }

    else:
        userinfo = await oauth_client.userinfo(token=token)
        user = userinfo
    request.session["user"] = dict(user)
    return RedirectResponse(url="/")

@router.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/")