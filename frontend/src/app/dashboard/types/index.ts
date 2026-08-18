/*
 * frontend/src/app/dashboard/types/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared TypeScript types for the SOC dashboard.
 *
 * Centralises types that were previously duplicated across page.tsx,
 * AssetPanel.tsx, and other components. Import from here instead of
 * redefining locally.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The four exploit status tiers produced by Agent A3 (Exploit Intelligence). */
export type ExploitStatus = "None" | "PoC Exists" | "Weaponised" | "Actively Exploited";

/** Sort options for the CVE table. */
export type SortKey = "risk_score" | "published_date" | "cvss_score";

/** State machine for the "Poll Now" button. */
export type PollState = "idle" | "polling" | "success" | "error";

/** WebSocket connection status indicator. */
export type WSStatus = "connecting" | "connected" | "disconnected";

/**
 * A single CVE row in the dashboard table.
 * Matches the shape returned by GET /cves (PaginatedCVEResponse.items).
 */
export interface CVEItem {
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
  /** Transient flag — true for ~2s after a WebSocket arrival to trigger flash animation. */
  isNew?: boolean;
}

/**
 * A matched asset returned by GET /cves/{cve_id}/matches.
 * Used in the AssetPanel slide-out detail view.
 */
export interface AssetDetail {
  hostname: string;
  ip_address?: string;
  zone: string;
  is_internet_facing: boolean;
  match_type: "exact" | "fuzzy";
  exposure_multiplier: number;
}

/**
 * State for the currently selected CVE + its matched assets.
 * Set when a table row with assets is clicked; null when the panel is closed.
 */
export interface SelectedCVE {
  cveId: string;
  cvssScore?: number;
  exploitStatus: ExploitStatus;
  riskScore: number;
  description?: string;
  isKevListed?: boolean;
  assets: AssetDetail[];
}
