# API image: FastAPI + 마운트된 MCP. CPU 만으로 충분.
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.5.0 /uv /usr/local/bin/uv

WORKDIR /app

# Dependency cache layer
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Project code
COPY apps ./apps
COPY workers ./workers
COPY prompts ./prompts

# Settings
ENV MEETING_NOTES_ROOT=/data \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=8088 \
    PYTHONPATH=/app

EXPOSE 8088

CMD ["/opt/venv/bin/uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8088"]
