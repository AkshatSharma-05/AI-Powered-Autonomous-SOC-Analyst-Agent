"""
backend/routers/ws_router.py
─────────────────────────────────────────────────────────────────────────────
WebSocket endpoint — Spec R19, R20.

WS /ws/cves — dashboard clients connect here to receive live CVE updates.

Each message pushed by the server is a JSON-encoded CVEWebSocketMessage:
    {
        "event": "cve_processed",
        "cve_id": "CVE-2021-44228",
        "cvss_score": 10.0,
        "exploit_status": "Actively Exploited",
        "risk_score": 60.0,
        "matched_assets": ["app-server-01"],
        "is_kev_listed": true,
        "processed_at": "2024-01-01T00:00:00Z"
    }

Clients may also send a ping message ("ping") and receive a "pong" to
keep the connection alive through proxies.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.ws_manager import ws_manager

log = structlog.get_logger(__name__)

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/cves")
async def websocket_cve_feed(websocket: WebSocket) -> None:
    """
    WS /ws/cves — Live CVE update feed (R19, R20).

    Connect to receive real-time notifications when a CVE completes the
    A1 → A2 → A3 pipeline. Each message is a JSON object.
    """
    await ws_manager.connect(websocket)

    try:
        # Send a welcome message so the client knows the connection is live
        await websocket.send_json({
            "event": "connected",
            "message": "SOC Agent live feed connected. Listening for CVE events...",
            "active_connections": ws_manager.connection_count,
        })

        # Keep alive — receive messages (ping/pong, or just wait for disconnect)
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        log.info("ws.client_disconnected_cleanly")
    except Exception as exc:
        ws_manager.disconnect(websocket)
        log.warning("ws.client_error", error=str(exc))
