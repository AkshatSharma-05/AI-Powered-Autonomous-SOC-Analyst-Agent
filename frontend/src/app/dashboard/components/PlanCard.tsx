"use client";

/*
 * frontend/src/app/dashboard/components/PlanCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Remediation Plan Card component.
 * Displays AI-generated remediation plan summary, risk metrics,
 * affected assets, downtime estimate, and review trigger.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import type { RemediationPlan } from "../types/remediation";
import ExploitBadge from "./ExploitBadge";
import RiskScore from "./RiskScore";

interface PlanCardProps {
  plan: RemediationPlan;
  onReview: (plan: RemediationPlan) => void;
  onQuickApprove?: (planId: string) => void;
}

export default function PlanCard({ plan, onReview, onQuickApprove }: PlanCardProps) {
  const isPending = plan.status === "pending";
  const isApproved = plan.status === "approved";
  const isRejected = plan.status === "rejected";
  const isCompleted = plan.status === "completed";

  return (
    <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-white/8 dark:border-white/8 light:border-slate-200 rounded-xl p-5 shadow-sm hover:border-blue-500/30 transition-all flex flex-col justify-between gap-4">
      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-white dark:text-white light:text-slate-900 bg-slate-950/60 dark:bg-slate-950/60 light:bg-slate-100 px-2 py-1 rounded-md border border-white/10 dark:border-white/10 light:border-slate-200">
              {plan.cve_id}
            </span>

            {/* Status Badge */}
            {isPending && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                Pending Approval
              </span>
            )}
            {isApproved && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                ✓ Approved
              </span>
            )}
            {isRejected && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 px-2.5 py-0.5 rounded-full">
                ✕ Rejected
              </span>
            )}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 rounded-full">
                ● Executed
              </span>
            )}
          </div>

          <ExploitBadge status={plan.exploit_status} size="sm" />
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900 leading-snug mb-1">
          {plan.title}
        </h3>

        {/* Summary */}
        <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 line-clamp-2 leading-relaxed mb-3">
          {plan.summary}
        </p>

        {/* Risk & Impact Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 py-3 border-y border-white/5 dark:border-white/5 light:border-slate-100 text-xs">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">Risk Score</span>
            <div className="mt-0.5">
              <RiskScore score={plan.risk_score} size="sm" />
            </div>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">Impact / Downtime</span>
            <span className="font-semibold text-slate-300 dark:text-slate-300 light:text-slate-700">
              {plan.impact_assessment} · ~{plan.estimated_downtime_minutes}m
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">Target Assets</span>
            <span className="font-mono text-slate-300 dark:text-slate-300 light:text-slate-700 truncate block">
              {plan.affected_assets.join(", ")}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
        <div className="text-[11px] text-slate-500">
          Generated: {new Date(plan.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>

        <div className="flex items-center gap-2">
          {isPending && onQuickApprove && (
            <button
              onClick={() => onQuickApprove(plan.id)}
              className="focus-ring text-xs px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 transition-all font-semibold"
            >
              Quick Approve
            </button>
          )}

          <button
            onClick={() => onReview(plan)}
            className="focus-ring text-xs px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-sm flex items-center gap-1.5"
          >
            <span>Review Plan</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
