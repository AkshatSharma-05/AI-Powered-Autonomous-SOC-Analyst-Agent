"use client";

/*
 * frontend/src/app/dashboard/components/Pagination.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Page navigation controls — prev/next buttons and numbered page pills.
 * Supports theme toggling (dark & light) with accessible focus states.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="px-5 py-3.5 border-t border-white/8 dark:border-white/8 light:border-slate-200 flex items-center justify-between gap-4 flex-wrap bg-slate-900/40 dark:bg-slate-900/40 light:bg-slate-50">
      <span className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600">
        Page <span className="font-semibold text-slate-200 dark:text-slate-200 light:text-slate-800">{page}</span> of{" "}
        <span className="font-semibold text-slate-200 dark:text-slate-200 light:text-slate-800">{totalPages}</span> ·{" "}
        {total.toLocaleString()} total results
      </span>
      <div className="flex items-center gap-1.5">
        <button
          id="btn-prev-page"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="focus-ring text-xs px-3 py-1.5 rounded-lg border border-white/10 dark:border-white/10 light:border-slate-300 bg-white/5 dark:bg-white/5 light:bg-white text-slate-300 dark:text-slate-300 light:text-slate-700 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-white/10 light:hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium shadow-sm"
        >
          ← Prev
        </button>

        {/* Page number buttons — show up to 5 around current page */}
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let pageNum: number;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (page <= 3) {
            pageNum = i + 1;
          } else if (page >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = page - 2 + i;
          }
          return (
            <button
              key={pageNum}
              id={`btn-page-${pageNum}`}
              onClick={() => onPageChange(pageNum)}
              className={`focus-ring text-xs w-8 h-8 rounded-lg border transition-all font-medium ${
                page === pageNum
                  ? "bg-blue-600 border-blue-500 text-white font-semibold shadow-sm"
                  : "border-white/10 dark:border-white/10 light:border-slate-300 bg-white/5 dark:bg-white/5 light:bg-white text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-white/10 light:hover:bg-slate-100"
              }`}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          id="btn-next-page"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="focus-ring text-xs px-3 py-1.5 rounded-lg border border-white/10 dark:border-white/10 light:border-slate-300 bg-white/5 dark:bg-white/5 light:bg-white text-slate-300 dark:text-slate-300 light:text-slate-700 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-white/10 light:hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium shadow-sm"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
