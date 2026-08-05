/*
 * frontend/src/app/dashboard/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * V0 Dashboard — blank authenticated page.
 *
 * Spec R6: WHEN a user authenticates successfully, THE SYSTEM SHALL redirect
 * them to the (blank) dashboard home route.
 *
 * This page is protected by middleware.ts — only authenticated users reach it.
 * Real CVE feed, risk gauges, and charts are added in V1.0/V2.0.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";


const pubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured = !!(pubKey && pubKey.startsWith("pk_") && !pubKey.includes("your_publishable_key"));

export default async function DashboardPage() {
  // currentUser() is a server-side Clerk helper — safe to call in a Server Component when Clerk is configured
  const user = isClerkConfigured ? await currentUser() : null;

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col">
      {/* ── Top navigation bar ────────────────────────────────────────────── */}
      <nav className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Shield icon — inline SVG, no extra dependency */}
          <svg
            className="w-7 h-7 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <span className="text-white font-semibold text-lg tracking-tight">
            SOC Agent
          </span>
          <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-900 text-blue-300 rounded-full">
            v0 — Skeleton
          </span>
        </div>

        {/* User account button from Clerk */}
        {isClerkConfigured ? <UserButton /> : <div className="text-xs text-amber-400 font-mono">Auth Mode: Pending API Keys</div>}
      </nav>


      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-center max-w-lg">
          <h1 className="text-3xl font-bold text-white mb-3">
            Welcome back
            {user?.firstName ? `, ${user.firstName}` : ""}!
          </h1>
          <p className="text-gray-400 text-base leading-relaxed">
            The SOC Agent dashboard is being built. You are authenticated and
            in the right place — this page will show the live CVE feed, risk
            gauges, and pipeline status in V1.0.
          </p>
        </div>

        {/* Status cards — V0 skeleton indicators */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-lg mt-4">
          {[
            { label: "CVE Ingestion", status: "Building (V1.0)", color: "yellow" },
            { label: "Asset Correlation", status: "Building (V1.0)", color: "yellow" },
            { label: "AI Planner", status: "Building (V2.0)", color: "gray" },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center"
            >
              <div
                className={`w-2 h-2 rounded-full mx-auto mb-2 ${
                  card.color === "yellow"
                    ? "bg-yellow-500"
                    : "bg-gray-600"
                }`}
              />
              <p className="text-xs font-medium text-gray-300">{card.label}</p>
              <p className={`text-xs mt-1 ${
                card.color === "yellow" ? "text-yellow-500" : "text-gray-500"
              }`}>
                {card.status}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
