"use client";

import React from "react";
import ExploitBadge from "./ExploitBadge";
import RiskScore from "./RiskScore";

type ExploitStatus = "None" | "PoC Exists" | "Weaponised" | "Actively Exploited";

interface AssetDetail {
  hostname: string;
  ip_address?: string;
  zone: string;
  is_internet_facing: boolean;
  match_type: "exact" | "fuzzy";
  exposure_multiplier: number;
}

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
  internal: "text-green-400 bg-green-500/10 border-green-500/30",
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
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg h-full bg-slate-900 border-l border-white/10 overflow-y-auto shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10 px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h2 className="text-lg font-bold text-white font-mono">{cveId}</h2>
              {isKevListed && (
                <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded-full font-semibold">
                  CISA KEV
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <ExploitBadge status={exploitStatus} />
              {formattedDate && (
                <span className="text-xs text-slate-500">
                  Published{" "}
                  <span className="text-slate-300 font-medium">{formattedDate}</span>
                  {relativeDate && (
                    <span className="text-slate-600 ml-1">({relativeDate})</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Risk Score */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Composite Risk Score
            </h3>
            <RiskScore score={riskScore} size="lg" />
            {cvssScore !== undefined && (
              <p className="text-xs text-slate-500 mt-2">
                CVSS Base Score: <span className="text-slate-300">{cvssScore.toFixed(1)}</span>
                {" · "}Formula: CVSS × Exposure × Exploit Factor
              </p>
            )}
          </div>

          {/* Description */}
          {description && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Description
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">{description}</p>
            </div>
          )}

          {/* Matched Assets */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Matched Assets ({assets.length})
            </h3>

            {assets.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No matched assets found.</p>
            ) : (
              <div className="space-y-2">
                {assets.map((asset) => (
                  <div
                    key={asset.hostname}
                    className="rounded-lg border border-white/8 bg-white/3 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-mono font-medium text-white truncate">
                          {asset.hostname}
                        </span>
                        {asset.is_internet_facing && (
                          <span className="shrink-0 text-xs bg-red-500/15 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full">
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

                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      {asset.ip_address && (
                        <span className="font-mono">{asset.ip_address}</span>
                      )}
                      <span>
                        Match:{" "}
                        <span className={asset.match_type === "exact" ? "text-emerald-400" : "text-yellow-400"}>
                          {asset.match_type}
                        </span>
                      </span>
                      <span>
                        Exposure:{" "}
                        <span className={asset.exposure_multiplier >= 3 ? "text-red-400" : "text-slate-300"}>
                          {asset.exposure_multiplier}×
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* References */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              References
            </h3>
            <div className="space-y-2">

              {/* NVD */}
              <a
                href={`https://nvd.nist.gov/vuln/detail/${cveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/3 px-4 py-3 hover:bg-white/6 hover:border-white/15 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-blue-500/15 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">NVD</p>
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
                className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/3 px-4 py-3 hover:bg-white/6 hover:border-white/15 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-violet-500/15 border border-violet-500/25 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">CVE.org</p>
                    <p className="text-xs text-slate-500 truncate">Official CVE Record · MITRE Corporation</p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>

              {/* CISA KEV — only if listed */}
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
