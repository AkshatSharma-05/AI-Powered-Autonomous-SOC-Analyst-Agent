"use client";

/*
 * frontend/src/app/dashboard/components/CVETable.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CVE data table with skeleton loading, empty state, clickable rows,
 * and full keyboard navigation (Up/Down arrows, Enter, Space).
 *
 * Individual rows are wrapped in React.memo to prevent unnecessary re-renders
 * when a single CVE updates via WebSocket.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { memo, useEffect, useRef, useState } from "react";
import type { CVEItem, ExploitStatus } from "../types";
import ExploitBadge from "./ExploitBadge";
import RiskScore from "./RiskScore";

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Skeleton row ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-white/4 dark:border-white/4 light:border-slate-100">
      {[280, 48, 120, 100, 40, 80, 60].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div
            className="h-3 rounded bg-white/5 dark:bg-white/5 light:bg-slate-200 animate-pulse"
            style={{ width: w }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── Single CVE row (memoised) ───────────────────────────────────────────────

interface CVERowProps {
  cve: CVEItem;
  index: number;
  isSelected?: boolean;
  onRowClick: (cve: CVEItem) => void;
}

const CVERow = memo(function CVERow({ cve, isSelected, onRowClick }: CVERowProps) {
  return (
    <tr
      data-cve-id={cve.cve_id}
      onClick={() => cve.matched_asset_count > 0 && onRowClick(cve)}
      tabIndex={cve.matched_asset_count > 0 ? 0 : -1}
      onKeyDown={(e) => {
        if (cve.matched_asset_count > 0 && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onRowClick(cve);
        }
      }}
      className={[
        "group transition-all duration-150 outline-none select-none",
        cve.isNew ? "row-flash" : "",
        cve.matched_asset_count > 0
          ? "cursor-pointer hover:bg-blue-500/10 focus-visible:bg-blue-500/15 focus-visible:ring-1 focus-visible:ring-blue-400"
          : "cursor-default hover:bg-white/[0.02] focus-visible:bg-white/[0.04]",
        isSelected ? "bg-blue-500/15 ring-1 ring-blue-500/40" : "",
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
          <span className="font-mono font-semibold text-white dark:text-white light:text-slate-900 text-xs tracking-tight">
            {cve.cve_id}
          </span>
          {cve.is_kev_listed && (
            <span className="text-[10px] bg-red-500/20 text-red-400 dark:text-red-400 light:text-red-600 border border-red-500/40 px-1.5 py-0.5 rounded-full font-bold leading-none">
              KEV
            </span>
          )}
        </div>
        {cve.description && (
          <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5 truncate max-w-[320px] leading-relaxed">
            {cve.description}
          </p>
        )}
      </td>

      {/* CVSS score */}
      <td className="px-3 py-3.5">
        {cve.cvss_score != null ? (
          <span className={`text-sm font-bold tabular-nums ${
            cve.cvss_score >= 9.0 ? "text-red-400 dark:text-red-400 light:text-red-600" :
            cve.cvss_score >= 7.0 ? "text-orange-400 dark:text-orange-400 light:text-orange-600" :
            cve.cvss_score >= 4.0 ? "text-yellow-400 dark:text-yellow-400 light:text-amber-600" : "text-slate-400 light:text-slate-600"
          }`}>
            {cve.cvss_score.toFixed(1)}
          </span>
        ) : (
          <span className="text-slate-600 dark:text-slate-600 light:text-slate-400 text-sm">—</span>
        )}
      </td>

      {/* Exploit badge */}
      <td className="px-3 py-3.5">
        <ExploitBadge status={cve.exploit_status} size="sm" />
      </td>

      {/* Risk score */}
      <td className="px-3 py-3.5">
        {cve.risk_score > 0 ? (
          <RiskScore score={cve.risk_score} size="sm" />
        ) : (
          <span className="text-slate-600 dark:text-slate-600 light:text-slate-400 text-sm font-medium tabular-nums">—</span>
        )}
      </td>

      {/* Asset count */}
      <td className="px-3 py-3.5">
        {cve.matched_asset_count > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 dark:text-slate-300 light:text-blue-600 group-hover:text-blue-300 transition-colors">
            {cve.matched_asset_count} asset{cve.matched_asset_count > 1 ? "s" : ""}
            <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors translate-x-0 group-hover:translate-x-0.5 duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        ) : (
          <span className="text-slate-600 dark:text-slate-700 light:text-slate-400 text-xs">—</span>
        )}
      </td>

      {/* Published */}
      <td className="px-3 py-3.5">
        <span
          className="text-xs text-slate-500 dark:text-slate-500 light:text-slate-500 hover:text-slate-300 transition-colors cursor-default"
          title={absoluteDate(cve.published_date)}
        >
          {relativeTime(cve.published_date)}
        </span>
      </td>

      {/* Source */}
      <td className="px-5 py-3.5">
        <span className="text-xs text-slate-500 dark:text-slate-600 light:text-slate-500 capitalize font-medium">
          {cve.source ?? "—"}
        </span>
      </td>
    </tr>
  );
});

// ── Table header columns ────────────────────────────────────────────────────

const COLUMNS = ["CVE ID", "CVSS", "Exploit Status", "Risk Score", "Matched Assets", "Published", "Source"];

function TableHead() {
  return (
    <thead>
      <tr className="border-b border-white/5 dark:border-white/5 light:border-slate-200 text-left bg-slate-950/40 dark:bg-slate-950/40 light:bg-slate-50">
        {COLUMNS.map((h, i) => (
          <th
            key={h}
            className={`${i === 0 ? "px-5" : i === COLUMNS.length - 1 ? "px-5" : "px-3"} py-3 text-xs font-semibold text-slate-400 dark:text-slate-400 light:text-slate-600 uppercase tracking-wider ${
              h === "Risk Score" ? "min-w-[140px]" : ""
            }`}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ── Main CVETable component ─────────────────────────────────────────────────

interface CVETableProps {
  cves: CVEItem[];
  loading: boolean;
  total: number;
  filter: ExploitStatus | "all";
  debouncedSearch: string;
  onRowClick: (cve: CVEItem) => void;
  onClearSearch: () => void;
}

export default function CVETable({
  cves,
  loading,
  total,
  filter,
  debouncedSearch,
  onRowClick,
  onClearSearch,
}: CVETableProps) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const tableRef = useRef<HTMLTableElement>(null);

  // Keyboard navigation across rows (ArrowUp / ArrowDown)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input or textarea
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (!cves.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < cves.length - 1 ? prev + 1 : 0;
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : cves.length - 1;
          return next;
        });
      } else if ((e.key === "Enter" || e.key === " ") && focusedIndex >= 0 && focusedIndex < cves.length) {
        e.preventDefault();
        onRowClick(cves[focusedIndex]);
      } else if (e.key === "Escape") {
        setFocusedIndex(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cves, focusedIndex, onRowClick]);

  return (
    <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-white/8 dark:border-white/8 light:border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Table header bar */}
      <div className="px-5 py-3 border-b border-white/8 dark:border-white/8 light:border-slate-200 flex items-center justify-between gap-4 flex-wrap bg-slate-900/40 dark:bg-slate-900/40 light:bg-slate-50/50">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white dark:text-white light:text-slate-900">
            CVE Feed
          </h2>
          {!loading && (
            <span className="text-xs font-normal text-slate-400 dark:text-slate-400 light:text-slate-600">
              {debouncedSearch
                ? `(${cves.length} matching "${debouncedSearch}")`
                : `(${total.toLocaleString()} total)`}
              {filter !== "all" && ` · filtered: ${filter}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 light:text-slate-500">
          <span className="hidden md:inline font-mono bg-slate-800/80 dark:bg-slate-800/80 light:bg-slate-200 px-1.5 py-0.5 rounded text-[10px]">
            ↑ / ↓ navigate · Enter open
          </span>
          <span>Click row for asset details</span>
        </div>
      </div>

      {loading ? (
        /* Skeleton loader */
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <TableHead />
            <tbody className="divide-y divide-white/4 dark:divide-white/4 light:divide-slate-100">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      ) : cves.length === 0 ? (
        /* Empty state */
        <div className="text-center py-20 text-slate-400">
          <div className="text-4xl mb-3">🔍</div>
          {debouncedSearch ? (
            <>
              <p className="text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700">
                No CVEs matching &quot;{debouncedSearch}&quot;
              </p>
              <button onClick={onClearSearch} className="text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors">
                Clear search filter
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700">No CVEs in current view</p>
              <p className="text-xs text-slate-500 mt-1">Click <strong>Poll Now</strong> to trigger autonomous CVE ingestion</p>
            </>
          )}
        </div>
      ) : (
        /* Data table */
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full text-sm">
            <TableHead />
            <tbody className="divide-y divide-white/4 dark:divide-white/4 light:divide-slate-100">
              {cves.map((cve, idx) => (
                <CVERow
                  key={cve.cve_id}
                  cve={cve}
                  index={idx}
                  isSelected={idx === focusedIndex}
                  onRowClick={onRowClick}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
