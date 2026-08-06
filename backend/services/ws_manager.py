"""
backend/services/ws_manager.py
─────────────────────────────────────────────────────────────────────────────
WebSocket connection manager — Spec R19.

Maintains the set of active WebSocket connections and provides a broadcast
method that the pipeline uses to push CVE results to the dashboard.

Thread-safety: asyncio single-thread model — no locks needed.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import json
from typing import Any

import structlog
from fastapi import WebSocket

log = structlog.get_logger(__name__)


class WebSocketManager:
    """
    Manages all active WebSocket connections.

    Usage:
        manager = WebSocketManager()

        # In WS endpoint:
        await manager.connect(websocket)
        try:
            while True:
                await websocket.receive_text()
        except:
            manager.disconnect(websocket)

        # In pipeline:
        await manager.broadcast({"event": "cve_processed", ...})
    """

    def __init__(self) -> None:
        self._active: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept a new WebSocket connection and track it."""
        await websocket.accept()
        self._active.add(websocket)
        log.info(
            "ws.client_connected",
            total_clients=len(self._active),
            client=str(websocket.client),
        )

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a disconnected WebSocket from the active set."""
        self._active.discard(websocket)
        log.info(
            "ws.client_disconnected",
            total_clients=len(self._active),
        )

    async def broadcast(self, message: dict[str, Any]) -> None:
        """
        Send a JSON message to all connected clients.

        Clients that fail to receive (disconnected mid-broadcast) are
        silently removed from the active set.
        """
        if not self._active:
            return

        payload = json.dumps(message, default=str)
        dead: set[WebSocket] = set()

        for websocket in self._active:
            try:
                await websocket.send_text(payload)
            except Exception as exc:
                log.warning(
                    "ws.send_failed",
                    error=str(exc),
                    client=str(websocket.client),
                )
                dead.add(websocket)

        # Clean up dead connections
        for ws in dead:
            self._active.discard(ws)

        if self._active:
            log.debug(
                "ws.broadcast_sent",
                recipients=len(self._active),
            )

    @property
    def connection_count(self) -> int:
        """Return the number of currently connected clients."""
        return len(self._active)


# ── Module-level singleton ────────────────────────────────────────────────────
ws_manager = WebSocketManager()
