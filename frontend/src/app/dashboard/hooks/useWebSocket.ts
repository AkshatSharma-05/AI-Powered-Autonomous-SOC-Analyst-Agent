/*
 * frontend/src/app/dashboard/hooks/useWebSocket.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Encapsulates the WebSocket connection lifecycle for the CVE live feed.
 *
 * Handles: connect, auto-reconnect on close, keepalive ping every 25 s,
 * connection status tracking, and live event counting.
 *
 * The caller provides a callback to process incoming CVE events. The filter
 * is intentionally NOT a dependency — the hook maintains a single long-lived
 * connection; filtering happens in the callback via a ref.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import type { WSStatus } from "../types";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WS_URL = BACKEND.replace(/^http/, "ws") + "/ws/cves";

interface UseWebSocketReturn {
  /** Current WebSocket connection status. */
  wsStatus: WSStatus;
  /** Count of CVE events received during this session. */
  liveCount: number;
}

/**
 * Custom hook for the live CVE WebSocket feed.
 *
 * @param onCVEProcessed - Callback invoked with the raw WS message payload
 *                         whenever a `cve_processed` event arrives.
 */
export function useWebSocket(
  onCVEProcessed: (msg: Record<string, unknown>) => void,
): UseWebSocketReturn {
  const [wsStatus, setWsStatus] = useState<WSStatus>("connecting");
  const [liveCount, setLiveCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const callbackRef = useRef(onCVEProcessed);
  useEffect(() => {
    callbackRef.current = onCVEProcessed;
  }, [onCVEProcessed]);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => setWsStatus("connected");

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.event === "cve_processed") {
              setLiveCount((c) => c + 1);
              callbackRef.current(msg);
            }
          } catch {
            /* Ignore malformed messages */
          }
        };

        ws.onclose = () => {
          setWsStatus("disconnected");
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setWsStatus("disconnected");
          ws.close();
        };
      } catch {
        setWsStatus("disconnected");
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    // Keepalive ping every 25s to survive proxies/load balancers
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 25000);

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(pingInterval);
      ws?.close();
    };
  }, []);

  return { wsStatus, liveCount };
}
