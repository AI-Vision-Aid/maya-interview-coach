"""ASGI composition: existing Flask website plus an official Streamable HTTP MCP endpoint."""

from contextlib import asynccontextmanager

from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.middleware.wsgi import WSGIMiddleware
from starlette.routing import Mount

from app import app as flask_app
from ability_ai.interview_coach_mcp import mcp


@asynccontextmanager
async def lifespan(_app):
    async with mcp.session_manager.run():
        yield


security = TransportSecuritySettings(
    allowed_hosts=["localhost", "localhost:8099", "127.0.0.1", "127.0.0.1:8099"],
    allowed_origins=["http://localhost:8099", "http://127.0.0.1:8099"],
)

application = Starlette(
    lifespan=lifespan,
    routes=[
        Mount("/mcp", app=mcp.streamable_http_app(streamable_http_path="/", json_response=True,
                                                    transport_security=security)),
        Mount("/", app=WSGIMiddleware(flask_app)),
    ],
)
