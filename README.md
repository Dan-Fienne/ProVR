# ProVR Design Platform

ProVR is currently a FastAPI application that serves Jinja templates and browser-native ES modules from `frontend/static`.

## Current Runtime Shape

- Backend: FastAPI ASGI app exposed by `backend.app:app`.
- Pages: Jinja templates in `frontend/templates`.
- Frontend modules: browser-native ES modules loaded directly by the browser.
- Local frontend libraries: Three.js, WebXR helpers, loaders, controller profiles, and GLB assets live under `frontend/static/libs`.
- Frontend build tooling: Node.js, npm, Vite, Webpack, TypeScript, and bundlers are not part of the current workflow.

The local `frontend/static/libs` directory is intentional. The project currently keeps browser libraries in-repo because dependency fetching and network access are not reliable enough to make Node-based installs the default path.

## Install

```powershell
python -m pip install -e .
```

`pyproject.toml` records the backend runtime packages that the current code imports or requires at startup. It does not add a new frontend toolchain.

## Run

Development HTTPS command currently documented for this repository:

```powershell
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000 --ssl-keyfile server.key --ssl-certfile server.crt
```

Local HTTP smoke command:

```powershell
uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

## Baseline Validation

```powershell
git status --short
python test.py
python -c "from backend.server import create_app; app=create_app(); print(app.title)"
```

## Modernization Rules

Modernization should be incremental and behavior-preserving. Do not rewrite the application, replace the frontend delivery model, introduce Node/npm/bundler tooling, or change API/page/WebXR behavior without explicit approval.

See `AGENTS.md` and `docs/industrialization-plan.md` for the working constraints and phased modernization plan.
