/*
 * frontend/src/app/dashboard/hooks/useCVEFeed.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Encapsulates the CVE feed data fetching, pagination state, and
 * AbortController logic.
 *
 * Returns: cves list, loading flag, pagination controls, total count,
 * and a manual reload function. Uses AbortController to prevent stale
 * responses from overwriting newer data on rapid filter/page changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from "react";
import type { CVEItem, ExploitStatus } from "../types";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PAGE_SIZE = 25;

interface UseCVEFeedReturn {
  /** Current page of CVE items. */
  cves: CVEItem[];
  /** Replace the cves array (used by WebSocket handler to prepend live events). */
  setCves: React.Dispatch<React.SetStateAction<CVEItem[]>>;
  /** True while the API request is in-flight. */
  loading: boolean;
  /** Total number of CVEs matching the current filter (across all pages). */
  total: number;
  /** Current 1-indexed page number. */
  page: number;
  /** Set the current page. */
  setPage: React.Dispatch<React.SetStateAction<number>>;
  /** Total number of pages. */
  totalPages: number;
  /** Page size constant for external use. */
  pageSize: number;
  /** Force-reload the current page. */
  reload: () => void;
}

/**
 * Custom hook for fetching paginated CVE data from the backend API.
 *
 * @param filter - The current exploit status filter (or "all").
 */
export function useCVEFeed(filter: ExploitStatus | "all"): UseCVEFeedReturn {
  const [cves, setCves] = useState<CVEItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadCves = useCallback(
    async (pageNum: number, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          page_size: String(PAGE_SIZE),
        });
        if (filter !== "all") params.set("exploit_status", filter);

        const res = await fetch(`${BACKEND}/cves?${params}`, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCves(
          (data.items ?? []).map((c: CVEItem) => ({ ...c, isNew: false })),
        );
        setTotal(data.total ?? 0);
      } catch (err) {
        // Silently ignore AbortError — it means a newer request replaced this one
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to load CVEs:", err);
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  // Reload when filter or page changes — abort previous in-flight request
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCves(page, controller.signal);
    return () => controller.abort();
  }, [loadCves, page]);

  // Reset to page 1 on filter change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [filter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const reload = useCallback(() => {
    loadCves(page);
  }, [loadCves, page]);

  return {
    cves,
    setCves,
    loading,
    total,
    page,
    setPage,
    totalPages,
    pageSize: PAGE_SIZE,
    reload,
  };
}
