"use client";

/*
 * frontend/src/app/dashboard/components/TabNav.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Primary Tab Navigation for the SOC Platform:
 * - Live CVE Intelligence Feed (/dashboard)
 * - Remediation Approvals (/dashboard/approvals) [with pending badge counter]
 * - Security Audit Trail (/dashboard/audit)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface TabNavProps {
  pendingApprovalsCount?: number;
}

export default function TabNav({ pendingApprovalsCount = 0 }: TabNavProps) {
  const pathname = usePathname();

  const isFeed = pathname === "/dashboard" || pathname === "/dashboard/";
  const isApprovals = pathname?.includes("/dashboard/approvals");
  const isAudit = pathname?.includes("/dashboard/audit");

  return (
    <nav aria-label="Dashboard views" className="flex items-center gap-2 border-b border-white/8 dark:border-white/8 light:border-slate-200 pb-3">
      {/* Live CVE Feed */}
      <Link
        href="/dashboard"
        className={`focus-ring text-xs font-semibold px-3.5 py-2 rounded-xl transition-all inline-flex items-center gap-2 ${
          isFeed
            ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
            : "bg-white/5 dark:bg-white/5 light:bg-slate-100 text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-white/10 light:hover:bg-slate-200"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>Live CVE Feed</span>
      </Link>

      {/* Remediation Approvals */}
      <Link
        href="/dashboard/approvals"
        className={`focus-ring text-xs font-semibold px-3.5 py-2 rounded-xl transition-all inline-flex items-center gap-2 ${
          isApprovals
            ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
            : "bg-white/5 dark:bg-white/5 light:bg-slate-100 text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-white/10 light:hover:bg-slate-200"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Remediation Approvals</span>
        {pendingApprovalsCount > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 ml-0.5 animate-pulse">
            {pendingApprovalsCount}
          </span>
        )}
      </Link>

      {/* Security Audit Trail */}
      <Link
        href="/dashboard/audit"
        className={`focus-ring text-xs font-semibold px-3.5 py-2 rounded-xl transition-all inline-flex items-center gap-2 ${
          isAudit
            ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
            : "bg-white/5 dark:bg-white/5 light:bg-slate-100 text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-white/10 light:hover:bg-slate-200"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Audit Trail & State Log</span>
      </Link>
    </nav>
  );
}
