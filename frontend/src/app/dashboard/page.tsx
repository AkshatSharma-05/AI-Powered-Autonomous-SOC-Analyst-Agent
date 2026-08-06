"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import AssetPanel from "./components/AssetPanel";
import ExploitBadge from "./components/ExploitBadge";
import RiskScore from "./components/RiskScore";

// ── Types ─────────────────────────────────────────────────────────────────────

type ExploitStatus = "None" | "PoC Exists" | "Weaponised" | "Actively Exploited";
type SortKey = "risk_score" | "published_date" | "cvss_score";

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
  isNew?: boolean; // transient flag for WS arrival animation
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
  publishedDate?: string;
  isKevListed?: boolean;
  assets: AssetDetail[];
}

type PollState = "idle" | "polling" | "success" | "error";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WS_URL = BACKEND.replace(/^http/, "ws") + "/ws/cves";
const PAGE_SIZE = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const delta = (Date.now() - new Date(iso).getTime()) / 1000;
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 86400 * 30) return `${Math.floor(delta / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function absoluteDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Skeleton row for loading state
function SkeletonRow() {
  return (
    <tr className="border-b border-white/4">
      {[280, 48, 120, 100, 40, 80, 60].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div
            className="h-3 rounded bg-white/5 animate-pulse"
            style={{ width: w }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [cves, setCves] = useState<CVEItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [selectedCVE, setSelectedCVE] = useState<SelectedCVE | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [filter, setFilter] = useState<ExploitStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey] = useState<SortKey>("risk_score");
  const [pollState, setPollState] = useState<PollState>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounce search ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // ── Load CVE feed from API ──────────────────────────────────────────────────
  // Note: filtering is done ONLY at API level to avoid the double-filter bug.
  // The filter tab sends ?exploit_status= to the backend; local state just
  // controls which tab is highlighted.
  const loadCves = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        page_size: String(PAGE_SIZE),
      });
      if (filter !== "all") params.set("exploit_status", filter);
      // Client-side search filter applied after fetch (no backend search endpoint yet)
      const res = await fetch(`${BACKEND}/cves?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCves((data.items ?? []).map((c: CVEItem) => ({ ...c, isNew: false })));
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error("Failed to load CVEs:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Reload when filter or page changes
  useEffect(() => {
    loadCves(page);
  }, [loadCves, page]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
  }, [filter]);

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
                isNew: true, // trigger flash animation
              };
              // Only prepend if it passes current filter
              const passesFilter =
                filter === "all" || newItem.exploit_status === filter;
              if (passesFilter) {
                setCves((prev) => {
                  const filtered = prev.filter((c) => c.cve_id !== newItem.cve_id);
                  return [newItem, ...filtered.slice(0, PAGE_SIZE - 1)];
                });
              }
              // Clear isNew flag after animation duration
              setTimeout(() => {
                setCves((prev) =>
                  prev.map((c) =>
                    c.cve_id === newItem.cve_id ? { ...c, isNew: false } : c
                  )
                );
              }, 2000);
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
  }, [filter]);

  // ── Poll Now handler ────────────────────────────────────────────────────────
  const handlePollNow = async () => {
    if (pollState === "polling") return; // prevent spam
    setPollState("polling");
    try {
      const res = await fetch(`${BACKEND}/pipeline/trigger`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPollState("success");
      // Reload table after a short delay to catch any fast results
      setTimeout(() => loadCves(page), 2000);
    } catch (err) {
      console.error("Poll trigger failed:", err);
      setPollState("error");
    } finally {
      // Reset button state after 3s
      setTimeout(() => setPollState("idle"), 3000);
    }
  };

  // ── Row click → load asset matches ─────────────────────────────────────────
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
        publishedDate: cve.published_date,
        isKevListed: cve.is_kev_listed,
        assets: data.matched_assets ?? [],
      });
    } catch (err) {
      console.error("Failed to load asset matches:", err);
    } finally {
      setLoadingAssets(false);
    }
  };

  // ── Client-side search filter (applied on top of API filter) ───────────────
  const displayedCves = debouncedSearch
    ? cves.filter(
        (c) =>
          c.cve_id.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          (c.description ?? "").toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : cves;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Stat counts (over ALL pages — from the total returned by API) ───────────
  // We get counts from the current page only since we don't have server aggregates.
  // Show "—" when filtered so counts are unambiguous.
  const statCounts = {
    total,
    activelyExploited: filter === "Actively Exploited" ? total : cves.filter((c) => c.exploit_status === "Actively Exploited").length,
    weaponised: filter === "Weaponised" ? total : cves.filter((c) => c.exploit_status === "Weaponised").length,
    pocExists: filter === "PoC Exists" ? total : cves.filter((c) => c.exploit_status === "PoC Exists").length,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── Global CSS for WS arrival animation ── */}
      <style>{`
        @keyframes rowFlash {
          0% { background-color: rgba(59,130,246,0.18); }
          100% { background-color: transparent; }
        }
        .row-flash { animation: rowFlash 2s ease-out forwards; }
        .focus-ring:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
      `}</style>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/8 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
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

          <div className="flex items-center gap-3">
            {/* Live update badge */}
            {liveCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {liveCount} live update{liveCount !== 1 ? "s" : ""}
              </div>
            )}

            {/* WS status — reflects actual socket state */}
            <div className="flex items-center gap-1.5 text-xs" title={`WebSocket: ${wsStatus}`}>
              <span className={`w-2 h-2 rounded-full transition-colors ${
                wsStatus === "connected" ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)] animate-pulse" :
                wsStatus === "connecting" ? "bg-yellow-400" : "bg-red-500"
              }`} />
              <span className={`${
                wsStatus === "connected" ? "text-emerald-400" :
                wsStatus === "connecting" ? "text-yellow-400" : "text-red-400"
              } capitalize hidden sm:inline`}>
                {wsStatus}
              </span>
            </div>

            {/* Poll Now — with loading/success/error states */}
            <button
              id="btn-poll-now"
              onClick={handlePollNow}
              disabled={pollState === "polling"}
              aria-busy={pollState === "polling"}
              className={`focus-ring text-xs px-3 py-1.5 rounded-md transition-all font-medium flex items-center gap-1.5 ${
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

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ── Stat cards — elevated visual hierarchy via gradient border & size ─ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Total CVEs",
              value: statCounts.total,
              color: "text-white",
              accent: "from-blue-500/20 to-transparent",
              border: "border-blue-500/20",
              icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
            },
            {
              label: "Actively Exploited",
              value: statCounts.activelyExploited,
              color: "text-red-400",
              accent: "from-red-500/20 to-transparent",
              border: "border-red-500/20",
              icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
            },
            {
              label: "Weaponised",
              value: statCounts.weaponised,
              color: "text-orange-400",
              accent: "from-orange-500/20 to-transparent",
              border: "border-orange-500/20",
              icon: "M13 10V3L4 14h7v7l9-11h-7z",
            },
            {
              label: "PoC Exists",
              value: statCounts.pocExists,
              color: "text-yellow-400",
              accent: "from-yellow-500/20 to-transparent",
              border: "border-yellow-500/20",
              icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`relative bg-gradient-to-br ${stat.accent} bg-slate-900/60 border ${stat.border} rounded-xl p-4 overflow-hidden`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={`text-3xl font-bold tabular-nums ${stat.color}`}>
                    {stat.value.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-medium">{stat.label}</div>
                </div>
                <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 opacity-40 ${stat.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={stat.icon} />
                </svg>
              </div>
            </div>
          ))}
        </div>

        {/* ── Controls bar: filter tabs + search ─────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          {/* Filter tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "Actively Exploited", "Weaponised", "PoC Exists", "None"] as const).map((f) => (
              <button
                key={f}
                id={`tab-${f.replace(/ /g, "-").toLowerCase()}`}
                onClick={() => setFilter(f)}
                className={`focus-ring text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                  filter === f
                    ? f === "all"
                      ? "bg-blue-600 border-blue-500 text-white"
                      : f === "Actively Exploited"
                      ? "bg-red-600/80 border-red-500 text-white"
                      : f === "Weaponised"
                      ? "bg-orange-600/80 border-orange-500 text-white"
                      : f === "PoC Exists"
                      ? "bg-yellow-600/80 border-yellow-500 text-white"
                      : "bg-slate-600 border-slate-500 text-white"
                    : "bg-white/3 border-white/10 text-slate-400 hover:text-white hover:bg-white/6"
                }`}
              >
                {f === "all" ? "All CVEs" : f}
              </button>
            ))}
          </div>

          {/* Search input */}
          <div className="relative ml-auto w-full sm:w-auto">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="cve-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search CVE ID or description…"
              className="focus-ring w-full sm:w-64 bg-slate-900 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:border-blue-500/50 focus:bg-slate-800 transition-colors outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── CVE Table ──────────────────────────────────────────────────────── */}
        <div className="bg-slate-900/60 border border-white/8 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-300">
              CVE Feed
              {!loading && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {debouncedSearch
                    ? `${displayedCves.length} matching "${debouncedSearch}"`
                    : `${total.toLocaleString()} total`}
                  {filter !== "all" && ` · filtered: ${filter}`}
                </span>
              )}
            </h2>
            <span className="text-xs text-slate-600 hidden sm:inline">
              Click a row with assets to see match details
            </span>
          </div>

          {loading ? (
            // Skeleton loader — not a blank flash
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    {["CVE ID", "CVSS", "Exploit Status", "Risk Score", "Assets", "Published", "Source"].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/4">
                  {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          ) : displayedCves.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <div className="text-4xl mb-3">🔍</div>
              {debouncedSearch ? (
                <>
                  <p className="text-sm font-medium text-slate-400">No CVEs matching &quot;{debouncedSearch}&quot;</p>
                  <button onClick={() => setSearch("")} className="text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors">
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-400">No CVEs yet</p>
                  <p className="text-xs mt-1">Click <strong>Poll Now</strong> to trigger the first ingestion cycle</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">CVE ID</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">CVSS</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Exploit Status</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[140px]">Risk Score</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assets</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Published</th>
                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/4">
                  {displayedCves.map((cve) => (
                    <tr
                      key={cve.cve_id}
                      onClick={() => handleRowClick(cve)}
                      tabIndex={cve.matched_asset_count > 0 ? 0 : -1}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && cve.matched_asset_count > 0) {
                          e.preventDefault();
                          handleRowClick(cve);
                        }
                      }}
                      className={[
                        "group transition-all duration-200 outline-none",
                        cve.isNew ? "row-flash" : "",
                        cve.matched_asset_count > 0
                          ? "cursor-pointer hover:bg-white/[0.04] focus-visible:bg-white/[0.06]"
                          : "cursor-default",
                        cve.exploit_status === "Actively Exploited"
                          ? "bg-red-500/[0.04] hover:bg-red-500/[0.08]"
                          : cve.exploit_status === "Weaponised"
                          ? "bg-orange-500/[0.02] hover:bg-orange-500/[0.05]"
                          : "",
                      ].join(" ")}
                    >
                      {/* CVE ID + description */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-white text-xs tracking-tight">
                            {cve.cve_id}
                          </span>
                          {cve.is_kev_listed && (
                            <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/40 px-1.5 py-0.5 rounded-full font-bold leading-none">
                              KEV
                            </span>
                          )}
                        </div>
                        {cve.description && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[300px] leading-relaxed">
                            {cve.description}
                          </p>
                        )}
                      </td>

                      {/* CVSS score */}
                      <td className="px-3 py-3.5">
                        {cve.cvss_score != null ? (
                          <span className={`text-sm font-bold tabular-nums ${
                            cve.cvss_score >= 9.0 ? "text-red-400" :
                            cve.cvss_score >= 7.0 ? "text-orange-400" :
                            cve.cvss_score >= 4.0 ? "text-yellow-400" : "text-slate-400"
                          }`}>
                            {cve.cvss_score.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-600 text-sm">—</span>
                        )}
                      </td>

                      {/* Exploit badge */}
                      <td className="px-3 py-3.5">
                        <ExploitBadge status={cve.exploit_status} size="sm" />
                      </td>

                      {/* Risk score — shows "—" for unscored CVEs, not 0.0 with an empty bar */}
                      <td className="px-3 py-3.5">
                        {cve.risk_score > 0 ? (
                          <RiskScore score={cve.risk_score} size="sm" />
                        ) : (
                          <span className="text-slate-600 text-sm font-medium tabular-nums">—</span>
                        )}
                      </td>

                      {/* Asset count */}
                      <td className="px-3 py-3.5">
                        {cve.matched_asset_count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                            {cve.matched_asset_count}
                            <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors translate-x-0 group-hover:translate-x-0.5 duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </span>
                        ) : (
                          <span className="text-slate-700 text-xs">—</span>
                        )}
                      </td>

                      {/* Published — relative time with custom CSS tooltip on hover */}
                      <td className="px-3 py-3.5">
                        <div className="relative group/date inline-block">
                          <span className="text-xs text-slate-500 group-hover/date:text-slate-300 transition-colors cursor-default">
                            {relativeTime(cve.published_date)}
                          </span>
                          {cve.published_date && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-800 border border-white/10 text-xs text-slate-200 rounded-lg whitespace-nowrap opacity-0 group-hover/date:opacity-100 transition-opacity duration-150 pointer-events-none z-50 shadow-xl">
                              {absoluteDate(cve.published_date)}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800" />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Source */}
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-slate-600 capitalize font-medium">
                          {cve.source ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination controls ─────────────────────────────────────────── */}
          {!loading && totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-white/8 flex items-center justify-between gap-4 flex-wrap">
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages} · {total.toLocaleString()} results
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  id="btn-prev-page"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="focus-ring text-xs px-3 py-1.5 rounded-md border border-white/10 bg-white/3 text-slate-400 hover:text-white hover:bg-white/6 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  ← Prev
                </button>

                {/* Page number buttons — show up to 5 around current page */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      id={`btn-page-${pageNum}`}
                      onClick={() => setPage(pageNum)}
                      className={`focus-ring text-xs w-8 h-8 rounded-md border transition-all ${
                        page === pageNum
                          ? "bg-blue-600 border-blue-500 text-white font-semibold"
                          : "border-white/10 bg-white/3 text-slate-400 hover:text-white hover:bg-white/6"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  id="btn-next-page"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="focus-ring text-xs px-3 py-1.5 rounded-md border border-white/10 bg-white/3 text-slate-400 hover:text-white hover:bg-white/6 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Asset detail panel ─────────────────────────────────────────────── */}
      {selectedCVE && (
        <AssetPanel
          cveId={selectedCVE.cveId}
          cvssScore={selectedCVE.cvssScore}
          exploitStatus={selectedCVE.exploitStatus}
          riskScore={selectedCVE.riskScore}
          description={selectedCVE.description}
          publishedDate={selectedCVE.publishedDate}
          isKevListed={selectedCVE.isKevListed}
          assets={selectedCVE.assets}
          onClose={() => setSelectedCVE(null)}
        />
      )}

      {/* Loading overlay when fetching asset details */}
      {loadingAssets && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center">
          <div className="bg-slate-800 border border-white/10 rounded-xl px-6 py-4 flex items-center gap-3 shadow-2xl">
            <svg className="w-5 h-5 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-slate-300 font-medium">Loading asset matches…</span>
          </div>
        </div>
      )}
    </div>
  );
}
