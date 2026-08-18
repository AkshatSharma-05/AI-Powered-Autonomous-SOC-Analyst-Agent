"use client";

/*
 * frontend/src/app/dashboard/components/FilterBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Filter tabs (All / Actively Exploited / Weaponised / PoC Exists / None)
 * and debounced search input with light & dark theme styling.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import type { ExploitStatus } from "../types";

const FILTER_OPTIONS = ["all", "Actively Exploited", "Weaponised", "PoC Exists", "None"] as const;

interface FilterBarProps {
  filter: ExploitStatus | "all";
  onFilterChange: (filter: ExploitStatus | "all") => void;
  search: string;
  onSearchChange: (search: string) => void;
}

export default function FilterBar({
  filter,
  onFilterChange,
  search,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            id={`tab-${f.replace(/ /g, "-").toLowerCase()}`}
            onClick={() => onFilterChange(f)}
            className={`focus-ring text-xs px-3 py-1.5 rounded-full border transition-all font-medium select-none ${
              filter === f
                ? f === "all"
                  ? "bg-blue-600 border-blue-500 text-white shadow-sm"
                  : f === "Actively Exploited"
                  ? "bg-red-600 border-red-500 text-white shadow-sm"
                  : f === "Weaponised"
                  ? "bg-orange-600 border-orange-500 text-white shadow-sm"
                  : f === "PoC Exists"
                  ? "bg-yellow-600 border-yellow-500 text-white shadow-sm"
                  : "bg-slate-600 border-slate-500 text-white shadow-sm"
                : "bg-white/5 dark:bg-white/5 light:bg-white border-white/10 dark:border-white/10 light:border-slate-300 text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-white/10 light:hover:bg-slate-100"
            }`}
          >
            {f === "all" ? "All CVEs" : f}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative ml-auto w-full sm:w-auto">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 dark:text-slate-400 light:text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          id="cve-search"
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search CVE ID or description…"
          className="focus-ring w-full sm:w-64 bg-slate-900 dark:bg-slate-900 light:bg-white border border-white/10 dark:border-white/10 light:border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 dark:text-slate-100 light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 light:placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors outline-none shadow-sm"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 dark:hover:text-slate-300 light:hover:text-slate-700 transition-colors"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
