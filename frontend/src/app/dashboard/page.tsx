"use client";

/*
 * frontend/src/app/dashboard/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * SOC Dashboard — thin composition shell.
 *
 * All data fetching, WebSocket management, and rendering logic has been
 * extracted into custom hooks and focused components:
 *
 *   Hooks:      useCVEFeed, useWebSocket, useDebounce, useRemediation
 *   Components: Header, StatsBar, RiskChart, FilterBar, CVETable, Pagination, AssetPanel, TabNav
 *   Types:      types/index.ts (shared across all dashboard files)
 *
 * This page composes them into the dashboard layout and handles the few
 * pieces of cross-cutting state (filter, search, selected CVE, toasts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useRef, useState } from "react";

// Types
import type { CVEItem, ExploitStatus, SelectedCVE } from "./types";

// Hooks
import { useCVEFeed } from "./hooks/useCVEFeed";
import { useDebounce } from "./hooks/useDebounce";
import { useWebSocket } from "./hooks/useWebSocket";
import { useRemediation } from "./hooks/useRemediation";
import { useToast } from "../../context/ToastContext";

// Components
import Header from "./components/Header";
import TabNav from "./components/TabNav";
import StatsBar from "./components/StatsBar";
import RiskChart from "./components/RiskChart";
import FilterBar from "./components/FilterBar";
import CVETable from "./components/CVETable";
import Pagination from "./components/Pagination";
import AssetPanel from "./components/AssetPanel";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PAGE_SIZE = 25;

// ── Dashboard Page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // ── Toast notifications ────────────────────────────────────────────────────
  const { addToast } = useToast();

  // ── Filter & search state ──────────────────────────────────────────────────
  const [filter, setFilter] = useState<ExploitStatus | "all">("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // ── Data fetching via custom hook ──────────────────────────────────────────
  const feed = useCVEFeed(filter);

  // Ref to hold current filter for the WS callback (avoids stale closures)
  const filterRef = useRef<ExploitStatus | "all">(filter);
  React.useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  // ── WebSocket live feed ────────────────────────────────────────────────────
  const handleCVEProcessed = useCallback(
    (msg: Record<string, unknown>) => {
      const newItem: CVEItem = {
        cve_id: msg.cve_id as string,
        cvss_score: msg.cvss_score as number | undefined,
        description: msg.description as string | undefined,
        published_date: msg.published_date as string | undefined,
        source: msg.source as string | undefined,
        exploit_status: (msg.exploit_status as ExploitStatus) ?? "None",
        risk_score: (msg.risk_score as number) ?? 0,
        matched_asset_count: (msg.matched_assets as string[])?.length ?? 0,
        created_at: (msg.processed_at as string) ?? new Date().toISOString(),
        is_kev_listed: msg.is_kev_listed as boolean | undefined,
        isNew: true,
      };

      // Toast alert for critical / actively exploited arrivals
      if (newItem.exploit_status === "Actively Exploited" || (newItem.risk_score && newItem.risk_score >= 80)) {
        addToast({
          type: "error",
          title: `Critical Alert: ${newItem.cve_id}`,
          message: `${newItem.exploit_status} (Risk: ${newItem.risk_score}) matched ${newItem.matched_asset_count} assets.`,
          duration: 6000,
        });
      } else if (newItem.exploit_status === "Weaponised") {
        addToast({
          type: "warning",
          title: `Weaponised Exploit: ${newItem.cve_id}`,
          message: `Risk Score: ${newItem.risk_score} · Matched ${newItem.matched_asset_count} asset(s).`,
          duration: 4000,
        });
      }

      // Read current filter from ref (avoids WS reconnect on filter change)
      const currentFilter = filterRef.current;
      const passesFilter =
        currentFilter === "all" || newItem.exploit_status === currentFilter;

      if (passesFilter) {
        feed.setCves((prev) => {
          const filtered = prev.filter((c) => c.cve_id !== newItem.cve_id);
          return [newItem, ...filtered.slice(0, PAGE_SIZE - 1)];
        });
      }

      // Clear isNew flag after animation duration
      setTimeout(() => {
        feed.setCves((prev) =>
          prev.map((c) =>
            c.cve_id === newItem.cve_id ? { ...c, isNew: false } : c,
          ),
        );
      }, 2000);
    },
    [feed, addToast],
  );

  const { wsStatus, liveCount } = useWebSocket(handleCVEProcessed);

  // ── Asset panel state ──────────────────────────────────────────────────────
  const [selectedCVE, setSelectedCVE] = useState<SelectedCVE | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const handleRowClick = useCallback(
    async (cve: CVEItem) => {
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
        addToast({
          type: "error",
          title: "Asset Match Query Failed",
          message: "Unable to retrieve asset mapping from backend.",
        });
      } finally {
        setLoadingAssets(false);
      }
    },
    [addToast],
  );

  // ── Client-side search filter ──────────────────────────────────────────────
  const displayedCves = debouncedSearch
    ? feed.cves.filter(
        (c) =>
          c.cve_id.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          (c.description ?? "")
            .toLowerCase()
            .includes(debouncedSearch.toLowerCase()),
      )
    : feed.cves;

  // ── Stat counts ────────────────────────────────────────────────────────────
  const statCounts = {
    total: feed.total,
    activelyExploited:
      filter === "Actively Exploited"
        ? feed.total
        : feed.cves.filter((c) => c.exploit_status === "Actively Exploited")
            .length,
    weaponised:
      filter === "Weaponised"
        ? feed.total
        : feed.cves.filter((c) => c.exploit_status === "Weaponised").length,
    pocExists:
      filter === "PoC Exists"
        ? feed.total
        : feed.cves.filter((c) => c.exploit_status === "PoC Exists").length,
  };

  // ── Approvals counter for TabNav ──────────────────────────────────────────
  const { pendingCount } = useRemediation();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 light:bg-slate-50 text-slate-100 dark:text-slate-100 light:text-slate-900 transition-colors duration-200">
      <Header
        wsStatus={wsStatus}
        liveCount={liveCount}
        onPollComplete={feed.reload}
      />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Navigation Bar */}
        <TabNav pendingApprovalsCount={pendingCount} />

        <StatsBar counts={statCounts} />

        {/* Risk Score & Exploit Breakdown Chart */}
        {!feed.loading && displayedCves.length > 0 && (
          <RiskChart cves={displayedCves} total={feed.total} />
        )}

        <FilterBar
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
        />

        <CVETable
          cves={displayedCves}
          loading={feed.loading}
          total={feed.total}
          filter={filter}
          debouncedSearch={debouncedSearch}
          onRowClick={handleRowClick}
          onClearSearch={() => setSearch("")}
        />

        {!feed.loading && (
          <Pagination
            page={feed.page}
            totalPages={feed.totalPages}
            total={feed.total}
            onPageChange={feed.setPage}
          />
        )}
      </main>

      {/* Asset detail panel */}
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
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs flex items-center justify-center">
          <div className="bg-slate-900 dark:bg-slate-900 light:bg-white border border-white/10 dark:border-white/10 light:border-slate-300 rounded-xl px-6 py-4 flex items-center gap-3 shadow-2xl">
            <svg className="w-5 h-5 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-slate-200 dark:text-slate-200 light:text-slate-800 font-medium">
              Querying asset matches…
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
