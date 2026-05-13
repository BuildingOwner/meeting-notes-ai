"""Entry: FastAPI app (REST + MCP) via uvicorn.

실행: uv run python -m apps.api.server
환경: MCP_HOST (기본 127.0.0.1), MCP_PORT (기본 8088)

MCP만 standalone 으로 띄울 일이 있으면:
  uv run python -c "from apps.api.mcp_tools import mcp; mcp.run(transport='streamable-http')"
"""
from __future__ import annotations

import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "apps.api.main:app",
        host=os.environ.get("MCP_HOST", "127.0.0.1"),
        port=int(os.environ.get("MCP_PORT", "8088")),
        log_level="info",
    )
