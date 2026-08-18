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
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-white dark:text-white light:text-slate-900 font-mono tracking-tight">{cveId}</h2>
              {isKevListed && (
                <span className="text-xs bg-red-500/20 text-red-400 dark:text-red-400 light:text-red-600 border border-red-500/40 px-2 py-0.5 rounded-full font-semibold">
                  CISA KEV
                </span>
              )}
            </div>
            <ExploitBadge status={exploitStatus} />
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

          {/* Reference Intelligence Links */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-400 light:text-slate-500 uppercase tracking-wider mb-2">
              Security Intelligence References
            </h3>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://nvd.nist.gov/vuln/detail/${cveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors inline-flex items-center gap-1 font-medium"
              >
                NVD Record ↗
              </a>
              <a
                href={`https://www.cve.org/CVERecord?id=${cveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors inline-flex items-center gap-1 font-medium"
              >
                CVE.org ↗
              </a>
              {isKevListed && (
                <a
                  href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors inline-flex items-center gap-1 font-medium"
                >
                  CISA KEV Catalog ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
