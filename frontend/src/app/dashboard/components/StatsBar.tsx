"use client";

/*
 * frontend/src/app/dashboard/components/StatsBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Four stat cards — Total CVEs, Actively Exploited, Weaponised, PoC Exists.
 * Supports dark & light mode theming and responsive grid layouts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";

interface StatCounts {
  total: number;
  activelyExploited: number;
  weaponised: number;
  pocExists: number;
}

interface StatsBarProps {
  counts: StatCounts;
}

const STAT_CARDS = [
  {
    key: "total",
    label: "Total CVEs",
    color: "text-white dark:text-white light:text-slate-900",
    accent: "from-blue-500/15 to-transparent dark:from-blue-500/15 light:from-blue-500/10",
    border: "border-blue-500/20 dark:border-blue-500/20 light:border-blue-200",
    icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    key: "activelyExploited",
    label: "Actively Exploited",
    color: "text-red-400 dark:text-red-400 light:text-red-600",
    accent: "from-red-500/15 to-transparent dark:from-red-500/15 light:from-red-500/10",
    border: "border-red-500/20 dark:border-red-500/20 light:border-red-200",
    icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  },
  {
    key: "weaponised",
    label: "Weaponised",
    color: "text-orange-400 dark:text-orange-400 light:text-orange-600",
    accent: "from-orange-500/15 to-transparent dark:from-orange-500/15 light:from-orange-500/10",
    border: "border-orange-500/20 dark:border-orange-500/20 light:border-orange-200",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    key: "pocExists",
    label: "PoC Exists",
    color: "text-yellow-400 dark:text-yellow-400 light:text-amber-600",
    accent: "from-yellow-500/15 to-transparent dark:from-yellow-500/15 light:from-yellow-500/10",
    border: "border-yellow-500/20 dark:border-yellow-500/20 light:border-amber-200",
    icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  },
] as const;

export default function StatsBar({ counts }: StatsBarProps) {
  const values: Record<string, number> = {
    total: counts.total,
    activelyExploited: counts.activelyExploited,
    weaponised: counts.weaponised,
    pocExists: counts.pocExists,
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {STAT_CARDS.map((stat) => (
        <div
          key={stat.key}
          className={`relative bg-gradient-to-br ${stat.accent} bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border ${stat.border} rounded-xl p-4 overflow-hidden shadow-sm transition-all`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className={`text-3xl font-bold tabular-nums tracking-tight ${stat.color}`}>
                {(values[stat.key] ?? 0).toLocaleString()}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 mt-1 font-medium">
                {stat.label}
              </div>
            </div>
            <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 opacity-50 ${stat.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={stat.icon} />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}
