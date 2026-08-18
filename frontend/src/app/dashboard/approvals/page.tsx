"use client";

/*
 * frontend/src/app/dashboard/approvals/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Remediation Approvals Queue — Spec R30 Human Approval Checkpoint.
 * Allows SOC analysts to inspect, review, approve, reject, or execute
 * Agent A4 AI-generated remediation strategies.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from "react";
import Header from "../components/Header";
import TabNav from "../components/TabNav";
import PlanCard from "../components/PlanCard";
import PlanDetail from "../components/PlanDetail";
import { useRemediation } from "../hooks/useRemediation";
import { useWebSocket } from "../hooks/useWebSocket";
import { useToast } from "../../../context/ToastContext";
import type { RemediationPlan, ApprovalStatus } from "../types/remediation";

export default function ApprovalsPage() {
  const { wsStatus, liveCount } = useWebSocket(() => {});
  const { plans, pendingCount, approvePlan, rejectPlan, executePlan, loading } = useRemediation();
  const { addToast } = useToast();

  const [selectedPlan, setSelectedPlan] = useState<RemediationPlan | null>(null);
  const [filter, setFilter] = useState<ApprovalStatus | "all">("all");
  const [search, setSearch] = useState("");

  const handleApprove = async (planId: string, notes?: string) => {
    await approvePlan(planId, notes);
    addToast({
      type: "success",
      title: "Remediation Approved",
      message: `Plan ${planId} marked as approved for automated rollout.`,
    });
  };

  const handleReject = async (planId: string, notes?: string) => {
    await rejectPlan(planId, notes);
    addToast({
      type: "warning",
      title: "Remediation Plan Rejected",
      message: `Plan ${planId} was declined and logged to audit trail.`,
    });
  };

  const handleExecute = async (planId: string) => {
    await executePlan(planId);
    addToast({
      type: "info",
      title: "Execution Triggered",
      message: `Remediation commands dispatched to infrastructure agents.`,
    });
  };

  const filteredPlans = plans.filter((p) => {
    const matchesFilter = filter === "all" || p.status === filter;
    const matchesSearch =
      search === "" ||
      p.cve_id.toLowerCase().includes(search.toLowerCase()) ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.affected_assets.some((a) => a.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 light:bg-slate-50 text-slate-100 dark:text-slate-100 light:text-slate-900 transition-colors duration-200">
      <Header wsStatus={wsStatus} liveCount={liveCount} />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Navigation Bar */}
        <TabNav pendingApprovalsCount={pendingCount} />

        {/* Page Title & Status Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white dark:text-white light:text-slate-900">
              Remediation Approvals Queue
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
              Review and authorize Agent A4 autonomous patch and mitigation proposals (Spec R29/R30)
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "pending", "approved", "rejected", "completed"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`focus-ring text-xs px-3 py-1.5 rounded-full border transition-all font-semibold capitalize ${
                  filter === status
                    ? "bg-blue-600 border-blue-500 text-white shadow-sm"
                    : "bg-white/5 dark:bg-white/5 light:bg-white border-white/10 dark:border-white/10 light:border-slate-300 text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900"
                }`}
              >
                {status === "all" ? "All Plans" : status}
                {status === "pending" && pendingCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-950">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plans by CVE ID, title, or asset hostname..."
            className="w-full bg-slate-900 dark:bg-slate-900 light:bg-white border border-white/10 dark:border-white/10 light:border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 dark:text-slate-100 light:text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Plans Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 rounded-xl bg-white/5 dark:bg-white/5 light:bg-slate-200 animate-pulse border border-white/5" />
            ))}
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-4xl mb-3">🛡️</div>
            <p className="text-sm font-semibold text-slate-300 dark:text-slate-300 light:text-slate-700">No remediation plans in this queue</p>
            <p className="text-xs text-slate-500 mt-1">High-risk CVEs processed by Agent A4 will appear here for human authorization.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onReview={setSelectedPlan}
                onQuickApprove={handleApprove}
              />
            ))}
          </div>
        )}
      </main>

      {/* Plan Detail Modal */}
      {selectedPlan && (
        <PlanDetail
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onExecute={handleExecute}
        />
      )}
    </div>
  );
}
