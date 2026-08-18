"use client";

/*
 * frontend/src/app/dashboard/components/AssetPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Slide-out detail view for matched assets and CVE composite risk breakdown.
 * Supports light & dark themes, external vulnerability links, and keyboard dismiss (Escape).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect } from "react";
import ExploitBadge from "./ExploitBadge";
import RiskScore from "./RiskScore";
import type { ExploitStatus, AssetDetail } from "../types";

interface AssetPanelProps {
  cveId: string;
  cvssScore?: number;
  exploitStatus: ExploitStatus;
  riskScore: number;
  description?: string;
  publishedDate?: string;
  isKevListed?: boolean;
  assets: AssetDetail[];
  onClose: () => void;
}

const ZONE_COLORS: Record<string, string> = {
  dmz: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  cloud: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  internal: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};

export default function AssetPanel({
  cveId,
  cvssScore,
  exploitStatus,
  riskScore,
  description,
  publishedDate,
  isKevListed,
  assets,
  onClose,
}: AssetPanelProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const formattedDate = publishedDate
    ? new Date(publishedDate).toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;

  const relativeDate = publishedDate
    ? (() => {
        const delta = (Date.now() - new Date(publishedDate).getTime()) / 1000;
        if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
        if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
        if (delta < 86400 * 30) return `${Math.floor(delta / 86400)}d ago`;
        if (delta < 86400 * 365) return `${Math.floor(delta / (86400 * 30))}mo ago`;
        return `${Math.floor(delta / (86400 * 365))}y ago`;
      })()
    : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg h-full bg-slate-900 dark:bg-slate-900 light:bg-white border-l border-white/10 dark:border-white/10 light:border-slate-200 overflow-y-auto shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 backdrop-blur border-b border-white/10 dark:border-white/10 light:border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <h2 className="text-lg font-bold text-white dark:text-white light:text-slate-900 font-mono tracking-tight">{cveId}</h2>
              {isKevListed && (
                <span className="text-xs bg-red-500/20 text-red-400 dark:text-red-400 light:text-red-600 border border-red-500/40 px-2 py-0.5 rounded-full font-semibold">
                  CISA KEV
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <ExploitBadge status={exploitStatus} />
              {formattedDate && (
                <span className="text-xs text-slate-500 dark:text-slate-500 light:text-slate-600">
                  Published{" "}
                  <span className="text-slate-300 dark:text-slate-300 light:text-slate-700 font-medium">{formattedDate}</span>
                  {relativeDate && (
                    <span className="text-slate-500 dark:text-slate-500 light:text-slate-600 ml-1">({relativeDate})</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-colors p-1.5 rounded-lg hover:bg-white/10 light:hover:bg-slate-100"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Composite Risk Score */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-400 light:text-slate-500 uppercase tracking-wider mb-2">
              Composite Risk Score
            </h3>
            <RiskScore score={riskScore} size="lg" />
            {cvssScore !== undefined && (
              <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 mt-2">
                CVSS Base Score: <span className="font-semibold text-slate-200 dark:text-slate-200 light:text-slate-800">{cvssScore.toFixed(1)}</span>
                {" · "}Formula: CVSS × Exposure × Exploit Factor
              </p>
            )}
          </div>

          {/* Description */}
          {description && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-400 light:text-slate-500 uppercase tracking-wider mb-2">
                Vulnerability Description
              </h3>
              <p className="text-sm text-slate-300 dark:text-slate-300 light:text-slate-700 leading-relaxed bg-slate-950/40 dark:bg-slate-950/40 light:bg-slate-50 p-3 rounded-lg border border-white/5 dark:border-white/5 light:border-slate-200">
                {description}
              </p>
            </div>
          )}

          {/* Matched Assets */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-400 light:text-slate-500 uppercase tracking-wider">
                Matched Infrastructure Assets ({assets.length})
              </h3>
              <span className="text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-500">Agent A2 asset matching</span>
            </div>

            {assets.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-400 light:text-slate-500 italic">No assets matched this vulnerability.</p>
            ) : (
              <div className="space-y-2.5">
                {assets.map((asset) => (
                  <div
                    key={asset.hostname}
                    className="rounded-xl border border-white/8 dark:border-white/8 light:border-slate-200 bg-slate-950/40 dark:bg-slate-950/40 light:bg-slate-50/80 p-3.5 space-y-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-mono font-semibold text-white dark:text-white light:text-slate-900 truncate">
                          {asset.hostname}
                        </span>
                        {asset.is_internet_facing && (
                          <span className="shrink-0 text-[10px] bg-red-500/15 text-red-400 dark:text-red-400 light:text-red-600 border border-red-500/30 px-1.5 py-0.5 rounded-full font-bold">
                            Internet-Facing
                          </span>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${
                          ZONE_COLORS[asset.zone] ?? "text-slate-400 bg-slate-500/10 border-slate-500/30"
                        }`}
                      >
                        {asset.zone}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 pt-1 border-t border-white/5 dark:border-white/5 light:border-slate-200">
                      {asset.ip_address && (
                        <span className="font-mono text-slate-300 dark:text-slate-300 light:text-slate-700">{asset.ip_address}</span>
                      )}
                      <span>
                        Match:{" "}
                        <span className={asset.match_type === "exact" ? "text-emerald-400 font-medium" : "text-yellow-400 font-medium"}>
                          {asset.match_type}
                        </span>
                      </span>
                      <span>
                        Exposure:{" "}
                        <span className={asset.exposure_multiplier >= 3 ? "text-red-400 font-bold" : "text-slate-300 dark:text-slate-300 light:text-slate-700 font-medium"}>
                          {asset.exposure_multiplier}×
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security Intelligence References */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-400 light:text-slate-500 uppercase tracking-wider mb-3">
              References & Advisory Intelligence
            </h3>
            <div className="space-y-2">
              {/* NVD */}
              <a
                href={`https://nvd.nist.gov/vuln/detail/${cveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-white/8 dark:border-white/8 light:border-slate-200 bg-white/3 dark:bg-white/3 light:bg-slate-50 px-4 py-3 hover:bg-white/6 light:hover:bg-slate-100 hover:border-white/15 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-blue-500/15 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200 dark:text-slate-200 light:text-slate-900 group-hover:text-white light:group-hover:text-slate-950 transition-colors">NVD Record</p>
                    <p className="text-xs text-slate-500 truncate">National Vulnerability Database · NIST</p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>

              {/* CVE.org */}
              <a
                href={`https://www.cve.org/CVERecord?id=${cveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-white/8 dark:border-white/8 light:border-slate-200 bg-white/3 dark:bg-white/3 light:bg-slate-50 px-4 py-3 hover:bg-white/6 light:hover:bg-slate-100 hover:border-white/15 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-violet-500/15 border border-violet-500/25 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200 dark:text-slate-200 light:text-slate-900 group-hover:text-white light:group-hover:text-slate-950 transition-colors">CVE.org</p>
                    <p className="text-xs text-slate-500 truncate">Official CVE Record · MITRE Corporation</p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>

              {/* CISA KEV */}
              {isKevListed && (
                <a
                  href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-red-500/25 bg-red-500/5 px-4 py-3 hover:bg-red-500/10 hover:border-red-500/40 transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-red-300 group-hover:text-red-200 transition-colors">CISA KEV Catalog</p>
                      <p className="text-xs text-red-400/70 truncate">Confirmed actively exploited in the wild</p>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-red-500/50 group-hover:text-red-400 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
