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
  isKevListed,
  assets,
  onClose,
}: AssetPanelProps) {
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
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-white font-mono">{cveId}</h2>
              {isKevListed && (
                <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded-full font-semibold">
                  CISA KEV
                </span>
              )}
            </div>
            <ExploitBadge status={exploitStatus} />
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

          {/* Links */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              References
            </h3>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://nvd.nist.gov/vuln/detail/${cveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
              >
                NVD →
              </a>
              <a
                href={`https://www.cve.org/CVERecord?id=${cveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
              >
                CVE.org →
              </a>
              {isKevListed && (
                <a
                  href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 transition-colors"
                >
                  CISA KEV →
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
