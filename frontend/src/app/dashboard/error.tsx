"use client";

/*
 * frontend/src/app/dashboard/error.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Next.js Error Boundary for the /dashboard route.
 *
 * Catches uncaught runtime errors inside the dashboard subtree and renders a
 * styled fallback UI with a retry button instead of a blank white page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorProps) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900/80 border border-red-500/30 rounded-2xl p-8 text-center space-y-5 shadow-2xl">
        {/* Icon */}
        <div className="mx-auto w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
          <svg
            className="w-7 h-7 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Message */}
        <div>
          <h2 className="text-lg font-bold text-white mb-1">
            Dashboard Error
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Something went wrong while rendering the dashboard. This is usually
            a temporary issue.
          </p>
        </div>

        {/* Error details (collapsed) */}
        {error.message && (
          <details className="text-left">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">
              Technical details
            </summary>
            <pre className="mt-2 text-xs text-red-400/80 bg-red-500/5 border border-red-500/10 rounded-lg p-3 overflow-x-auto font-mono whitespace-pre-wrap">
              {error.message}
            </pre>
          </details>
        )}

        {/* Actions */}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Try Again
        </button>
      </div>
    </div>
  );
}
