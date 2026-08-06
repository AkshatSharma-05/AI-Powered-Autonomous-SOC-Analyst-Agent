"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import AssetPanel from "./components/AssetPanel";
import ExploitBadge from "./components/ExploitBadge";
import RiskScore from "./components/RiskScore";

// ── Types ─────────────────────────────────────────────────────────────────────

type ExploitStatus = "None" | "PoC Exists" | "Weaponised" | "Actively Exploited";

interface CVEItem {
  cve_id: string;
  cvss_score?: number;
  description?: string;
  published_date?: string;
  source?: string;
  exploit_status: ExploitStatus;
  risk_score: number;
  matched_asset_count: number;
  created_at: string;
  is_kev_listed?: boolean;
}

interface AssetDetail {
  hostname: string;
  ip_address?: string;
  zone: string;
  is_internet_facing: boolean;
  match_type: "exact" | "fuzzy";
  exposure_multiplier: number;
}

interface SelectedCVE {
  cveId: string;
  cvssScore?: number;
  exploitStatus: ExploitStatus;
  riskScore: number;
  description?: string;
  isKevListed?: boolean;
  assets: AssetDetail[];
}

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WS_URL = BACKEND.replace(/^http/, "ws") + "/ws/cves";

// ── Dashboard Page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [cves, setCves] = useState<CVEItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [selectedCVE, setSelectedCVE] = useState<SelectedCVE | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [filter, setFilter] = useState<ExploitStatus | "all">("all");
  const wsRef = useRef<WebSocket | null>(null);

  // ── Load initial CVE feed ─────────────────────────────────────────────────
  const loadCves = useCallback(async () => {
    try {
      const params = filter !== "all" ? `?exploit_status=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`${BACKEND}/cves${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCves(data.items ?? []);
    } catch (err) {
      console.error("Failed to load CVEs:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadCves();
  }, [loadCves]);

  // ── WebSocket live feed ───────────────────────────────────────────────────
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
              // Prepend new CVE to feed
              const newItem: CVEItem = {
                cve_id: msg.cve_id,
                cvss_score: msg.cvss_score,
                description: msg.description,
                published_date: msg.published_date,
                source: msg.source,
                exploit_status: msg.exploit_status ?? "None",
                risk_score: msg.risk_score ?? 0,
                matched_asset_count: msg.matched_assets?.length ?? 0,
                created_at: msg.processed_at ?? new Date().toISOString(),
                is_kev_listed: msg.is_kev_listed,
              };
              setCves((prev) => {
                // Deduplicate by cve_id
                const filtered = prev.filter((c) => c.cve_id !== newItem.cve_id);
                return [newItem, ...filtered];
              });
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          setWsStatus("disconnected");
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setWsStatus("disconnected");
          ws.close();
        };
      } catch (_) {
        setWsStatus("disconnected");
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    // Keepalive ping every 25s
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

  // ── Click on a CVE row → load asset matches ───────────────────────────────
  const handleRowClick = async (cve: CVEItem) => {
    if (cve.matched_asset_count === 0) return;
    setLoadingAssets(true);
    try {
      const res = await fetch(`${BACKEND}/cves/${cve.cve_id}/matches`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSelectedCVE({
        cveId: cve.cve_id,
        cvssScore: cve.cvss_score,
        exploitStatus: cve.exploit_status,
        riskScore: cve.risk_score,
        description: cve.description,
        isKevListed: cve.is_kev_listed,
        assets: data.matched_assets ?? [],
      });
    } catch (err) {
      console.error("Failed to load asset matches:", err);
    } finally {
      setLoadingAssets(false);
    }
  };

  const filteredCves = filter === "all"
    ? cves
    : cves.filter((c) => c.exploit_status === filter);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="border-b border-white/8 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">SOC Agent</h1>
              <p className="text-xs text-slate-500 leading-none mt-0.5">Autonomous CVE Intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live count */}
            {liveCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {liveCount} live update{liveCount !== 1 ? "s" : ""}
              </div>
            )}

            {/* WS status */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full ${
                wsStatus === "connected" ? "bg-emerald-400 animate-pulse" :
                wsStatus === "connecting" ? "bg-yellow-400" : "bg-slate-600"
              }`} />
              <span className="text-slate-400 capitalize">{wsStatus}</span>
            </div>

            {/* Manual trigger */}
            <button
              onClick={() => fetch(`${BACKEND}/pipeline/trigger`, { method: "POST" })}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md transition-colors font-medium"
            >
              Poll Now
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total CVEs", value: cves.length },
            { label: "Actively Exploited", value: cves.filter((c) => c.exploit_status === "Actively Exploited").length, color: "text-red-400" },
            { label: "Weaponised", value: cves.filter((c) => c.exploit_status === "Weaponised").length, color: "text-orange-400" },
            { label: "PoC Exists", value: cves.filter((c) => c.exploit_status === "PoC Exists").length, color: "text-yellow-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-900/60 border border-white/8 rounded-xl p-4">
              <div className={`text-2xl font-bold ${stat.color ?? "text-white"}`}>{stat.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", "Actively Exploited", "Weaponised", "PoC Exists", "None"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                filter === f
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-white/3 border-white/10 text-slate-400 hover:text-white hover:bg-white/6"
              }`}
            >
              {f === "all" ? "All CVEs" : f}
            </button>
          ))}
        </div>

        {/* CVE Table */}
        <div className="bg-slate-900/60 border border-white/8 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">
              CVE Feed
              {!loading && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {filteredCves.length} result{filteredCves.length !== 1 ? "s" : ""}
                </span>
              )}
            </h2>
            <span className="text-xs text-slate-600">Click a row to see matched assets</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Loading CVE feed...</span>
            </div>
          ) : filteredCves.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-sm font-medium text-slate-400">No CVEs yet</p>
              <p className="text-xs mt-1">Click <strong>Poll Now</strong> to trigger the first ingestion cycle</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">CVE ID</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">CVSS</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Exploit Status</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Risk Score</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assets</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Published</th>
                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/4">
                  {filteredCves.map((cve) => (
                    <tr
                      key={cve.cve_id}
                      onClick={() => handleRowClick(cve)}
                      className={`group transition-colors duration-150 ${
                        cve.matched_asset_count > 0
                          ? "cursor-pointer hover:bg-white/4"
                          : "cursor-default opacity-60"
                      } ${
                        cve.exploit_status === "Actively Exploited"
                          ? "bg-red-500/3 hover:bg-red-500/6"
                          : ""
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-white text-xs">
                            {cve.cve_id}
                          </span>
                          {cve.is_kev_listed && (
                            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/40 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                              KEV
                            </span>
                          )}
                        </div>
                        {cve.description && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[280px]">
                            {cve.description}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`text-sm font-bold tabular-nums ${
                          (cve.cvss_score ?? 0) >= 9.0
                            ? "text-red-400"
                            : (cve.cvss_score ?? 0) >= 7.0
                            ? "text-orange-400"
                            : "text-slate-300"
                        }`}>
                          {cve.cvss_score?.toFixed(1) ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <ExploitBadge status={cve.exploit_status} size="sm" />
                      </td>
                      <td className="px-3 py-3.5">
                        <RiskScore score={cve.risk_score} size="sm" />
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`text-xs font-medium ${
                          cve.matched_asset_count > 0 ? "text-slate-300" : "text-slate-600"
                        }`}>
                          {cve.matched_asset_count > 0 ? (
                            <span className="flex items-center gap-1">
                              {cve.matched_asset_count}
                              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </span>
                          ) : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-xs text-slate-500">
                        {cve.published_date
                          ? new Date(cve.published_date).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-slate-500 capitalize">
                          {cve.source ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Asset detail panel ───────────────────────────────────────────── */}
      {selectedCVE && (
        <AssetPanel
          cveId={selectedCVE.cveId}
          cvssScore={selectedCVE.cvssScore}
          exploitStatus={selectedCVE.exploitStatus}
          riskScore={selectedCVE.riskScore}
          description={selectedCVE.description}
          isKevListed={selectedCVE.isKevListed}
          assets={selectedCVE.assets}
          onClose={() => setSelectedCVE(null)}
        />
      )}

      {/* Loading overlay when fetching assets */}
      {loadingAssets && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center">
          <div className="bg-slate-800 rounded-xl px-6 py-4 flex items-center gap-3 shadow-xl">
            <svg className="w-5 h-5 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-slate-300">Loading asset matches…</span>
          </div>
        </div>
      )}
    </div>
  );
}
