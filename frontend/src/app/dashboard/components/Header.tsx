"use client";

/*
 * frontend/src/app/dashboard/components/Header.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Top bar — brand, backend health monitor, live update badge, WS status,
 * light/dark theme switch, and Poll Now trigger.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from "react";
import type { PollState, WSStatus } from "../types";
import ThemeToggle from "../../../components/ThemeToggle";
import { useToast } from "../../../context/ToastContext";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface HeaderProps {
  wsStatus: WSStatus;
  liveCount: number;
  onPollComplete?: () => void;
}

export default function Header({ wsStatus, liveCount, onPollComplete }: HeaderProps) {
  const [pollState, setPollState] = useState<PollState>("idle");
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(true);
  const { addToast } = useToast();

  // Periodic backend health check (probe every 30s)
  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch(`${BACKEND}/health`, { method: "GET" }).catch(() => null);
        if (isMounted) {
          setBackendHealthy(res ? res.ok : false);
        }
      } catch {
        if (isMounted) setBackendHealthy(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handlePollNow = async () => {
    if (pollState === "polling") return;
    setPollState("polling");
    addToast({
      type: "info",
      title: "Triggering Ingestion",
      message: "Autonomous ingestion pipeline cycle triggered...",
      duration: 3000,
    });

    try {
      const res = await fetch(`${BACKEND}/pipeline/trigger`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPollState("success");
      addToast({
        type: "success",
        title: "Pipeline Triggered",
        message: "Telemetry ingestion is actively processing new CVEs.",
        duration: 4000,
      });
      // Notify parent to reload table after a short delay
      setTimeout(() => onPollComplete?.(), 2000);
    } catch (err) {
      console.error("Poll trigger failed:", err);
      setPollState("error");
      addToast({
        type: "error",
        title: "Trigger Failed",
        message: "Unable to reach backend API pipeline.",
        duration: 5000,
      });
    } finally {
      setTimeout(() => setPollState("idle"), 3000);
    }
  };

  return (
    <>
      {/* Backend Disconnected Warning Banner */}
      {backendHealthy === false && (
        <div className="bg-red-500/15 border-b border-red-500/30 px-4 py-1.5 text-xs text-red-300 flex items-center justify-between gap-2 text-center">
          <div className="flex items-center gap-2 mx-auto">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
            <span>
              <strong>Backend Offline:</strong> Unable to connect to SOC backend at <code className="font-mono text-red-200">{BACKEND}</code>.
            </span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-[11px] underline hover:text-white transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      <header className="border-b border-white/8 dark:border-white/8 light:border-slate-200 bg-slate-900/60 dark:bg-slate-900/60 light:bg-white/80 backdrop-blur sticky top-0 z-20 transition-colors">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white dark:text-white light:text-slate-900 leading-none">
                  SOC Agent
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 light:text-slate-500 leading-none mt-0.5">
                Autonomous CVE Intelligence & Remediation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live update badge */}
            {liveCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {liveCount} live update{liveCount !== 1 ? "s" : ""}
              </div>
            )}

            {/* WS status indicator */}
            <div className="flex items-center gap-1.5 text-xs" title={`WebSocket: ${wsStatus}`}>
              <span className={`w-2 h-2 rounded-full transition-colors ${
                wsStatus === "connected" ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)] animate-pulse" :
                wsStatus === "connecting" ? "bg-yellow-400" : "bg-red-500"
              }`} />
              <span className={`${
                wsStatus === "connected" ? "text-emerald-400" :
                wsStatus === "connecting" ? "text-yellow-400" : "text-red-400"
              } capitalize hidden sm:inline font-medium`}>
                {wsStatus}
              </span>
            </div>

            {/* Dark / Light Mode Switch */}
            <ThemeToggle />

            {/* Poll Now */}
            <button
              id="btn-poll-now"
              onClick={handlePollNow}
              disabled={pollState === "polling"}
              aria-busy={pollState === "polling"}
              className={`focus-ring text-xs px-3 py-1.5 rounded-lg transition-all font-medium flex items-center gap-1.5 shadow-sm ${
                pollState === "polling"
                  ? "bg-blue-700 text-blue-200 cursor-not-allowed opacity-80"
                  : pollState === "success"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : pollState === "error"
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {pollState === "polling" && (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {pollState === "success" && "✓ Poll started"}
              {pollState === "error" && "✗ Failed — retry"}
              {pollState === "idle" && "Poll Now"}
              {pollState === "polling" && "Polling…"}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
