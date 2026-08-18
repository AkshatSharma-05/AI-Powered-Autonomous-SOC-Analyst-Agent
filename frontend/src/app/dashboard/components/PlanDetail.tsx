"use client";

/*
 * frontend/src/app/dashboard/components/PlanDetail.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive Remediation Plan Inspector & Human-in-the-loop Approval Modal.
 * Features:
 * - Full AI reasoning trace from Agent A4
 * - Step-by-step CLI commands with copy-to-clipboard
 * - Rollback procedures & impact safety checks
 * - Analyst decision notes and Approve/Reject action triggers
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from "react";
import type { RemediationPlan } from "../types/remediation";
import ExploitBadge from "./ExploitBadge";
import RiskScore from "./RiskScore";

interface PlanDetailProps {
  plan: RemediationPlan;
  onClose: () => void;
  onApprove: (planId: string, notes?: string) => void;
  onReject: (planId: string, notes?: string) => void;
  onExecute?: (planId: string) => void;
}

export default function PlanDetail({
  plan,
  onClose,
  onApprove,
  onReject,
  onExecute,
}: PlanDetailProps) {
  const [notes, setNotes] = useState("");
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const copyToClipboard = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCommand(cmd);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch {
      // Ignore clipboard failures (e.g., unsupported or permission denied)
    }
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    await onApprove(plan.id, notes);
    setIsSubmitting(false);
    onClose();
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    await onReject(plan.id, notes);
    setIsSubmitting(false);
    onClose();
  };

  const handleExecute = async () => {
    if (onExecute) {
      setIsSubmitting(true);
      await onExecute(plan.id);
      setIsSubmitting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative z-10 max-w-3xl w-full bg-slate-900 dark:bg-slate-900 light:bg-white border border-white/10 dark:border-white/10 light:border-slate-200 rounded-2xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 backdrop-blur border-b border-white/10 dark:border-white/10 light:border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-mono font-bold text-sm text-white dark:text-white light:text-slate-900 bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">
                {plan.cve_id}
              </span>
              <ExploitBadge status={plan.exploit_status} />
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-800 dark:bg-slate-800 light:bg-slate-100 text-slate-300 dark:text-slate-300 light:text-slate-700">
                Impact: {plan.impact_assessment}
              </span>
            </div>
            <h2 className="text-base font-bold text-white dark:text-white light:text-slate-900 leading-snug">
              {plan.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white dark:hover:text-white light:hover:text-slate-900 p-1.5 rounded-lg hover:bg-white/10 light:hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Executive Summary & Target Version */}
          <div className="bg-slate-950/50 dark:bg-slate-950/50 light:bg-slate-50 p-4 rounded-xl border border-white/5 dark:border-white/5 light:border-slate-200">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Remediation Objective
            </h4>
            <p className="text-slate-200 dark:text-slate-200 light:text-slate-800 leading-relaxed">
              {plan.summary}
            </p>
            <div className="mt-3 pt-3 border-t border-white/5 dark:border-white/5 light:border-slate-200 flex items-center justify-between gap-2 flex-wrap text-xs">
              <span className="text-slate-400">Target Upgrade Spec:</span>
              <code className="font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-semibold">
                {plan.recommended_version}
              </code>
            </div>
          </div>

          {/* Risk Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/40 dark:bg-slate-950/40 light:bg-slate-50 p-3 rounded-lg border border-white/5">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Risk Score</span>
              <div className="mt-1">
                <RiskScore score={plan.risk_score} size="sm" />
              </div>
            </div>
            <div className="bg-slate-950/40 dark:bg-slate-950/40 light:bg-slate-50 p-3 rounded-lg border border-white/5">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">CVSS Base</span>
              <span className="text-base font-bold text-red-400 tabular-nums">
                {plan.cvss_score.toFixed(1)}
              </span>
            </div>
            <div className="bg-slate-950/40 dark:bg-slate-950/40 light:bg-slate-50 p-3 rounded-lg border border-white/5">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Downtime</span>
              <span className="text-base font-bold text-slate-200 dark:text-slate-200 light:text-slate-800">
                ~{plan.estimated_downtime_minutes} min
              </span>
            </div>
            <div className="bg-slate-950/40 dark:bg-slate-950/40 light:bg-slate-50 p-3 rounded-lg border border-white/5">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Restart Required</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${
                plan.requires_restart ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"
              }`}>
                {plan.requires_restart ? "Yes (Service)" : "Zero-Downtime"}
              </span>
            </div>
          </div>

          {/* AI Reasoning Trace */}
          {plan.reasoning_trace && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                Agent A4 Reasoning Trace
              </h4>
              <div className="bg-violet-950/20 border border-violet-500/20 p-3.5 rounded-xl text-xs text-violet-200 dark:text-violet-200 light:text-slate-700 leading-relaxed font-mono">
                {plan.reasoning_trace}
              </div>
            </div>
          )}

          {/* Target Infrastructure Assets */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Target Infrastructure Assets ({plan.affected_assets.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {plan.affected_assets.map((asset) => (
                <div
                  key={asset}
                  className="px-3 py-1 rounded-lg bg-slate-950/60 dark:bg-slate-950/60 light:bg-slate-100 border border-white/10 dark:border-white/10 light:border-slate-200 text-xs font-mono font-medium text-slate-200 dark:text-slate-200 light:text-slate-800 flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {asset}
                </div>
              ))}
            </div>
          </div>

          {/* Step-by-Step Remediation Plan */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Sequential Remediation Execution Steps
            </h4>
            <div className="space-y-3">
              {plan.steps.map((step) => (
                <div
                  key={step.order}
                  className="p-3.5 rounded-xl bg-slate-950/60 dark:bg-slate-950/60 light:bg-slate-50 border border-white/8 dark:border-white/8 light:border-slate-200 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {step.order}
                    </span>
                    <span className="font-semibold text-xs text-white dark:text-white light:text-slate-900">
                      {step.action}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 pl-7">
                    {step.description}
                  </p>
                  {step.command && (
                    <div className="pl-7 mt-1">
                      <div className="relative group">
                        <pre className="bg-slate-950 dark:bg-slate-950 light:bg-slate-900 text-emerald-400 p-2.5 rounded-lg text-xs font-mono overflow-x-auto border border-white/10">
                          {step.command}
                        </pre>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(step.command!)}
                          className="absolute right-2 top-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[10px] font-mono transition-colors opacity-80 hover:opacity-100"
                        >
                          {copiedCommand === step.command ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rollback Strategy */}
          {plan.rollback_steps && plan.rollback_steps.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2">
                Rollback & Recovery Procedures
              </h4>
              <div className="space-y-2">
                {plan.rollback_steps.map((rb) => (
                  <div
                    key={rb.order}
                    className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-slate-300 space-y-1.5"
                  >
                    <div className="font-semibold text-amber-300">
                      Rollback Step {rb.order}: {rb.action}
                    </div>
                    {rb.command && (
                      <pre className="bg-slate-950 text-amber-200/90 p-2 rounded text-[11px] font-mono overflow-x-auto border border-amber-500/20">
                        {rb.command}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decision Notes & Prior Audit Comments */}
          {plan.status === "pending" ? (
            <div>
              <label htmlFor="decision-notes" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Analyst Approval / Rejection Notes (Optional)
              </label>
              <textarea
                id="decision-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Approved for scheduled deployment on DMZ cluster..."
                className="w-full bg-slate-950 dark:bg-slate-950 light:bg-white border border-white/10 dark:border-white/10 light:border-slate-300 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
          ) : (
            <div className="bg-slate-950/60 p-4 rounded-xl border border-white/10 text-xs space-y-1">
              <span className="font-semibold text-slate-400">Previous Reviewer Decision:</span>
              <p className="text-slate-200 font-medium">
                {plan.decision_by || "SOC Analyst"} on {new Date(plan.decision_at || plan.created_at).toLocaleString()}
              </p>
              {plan.decision_notes && (
                <p className="text-slate-400 italic mt-1">&quot;{plan.decision_notes}&quot;</p>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="sticky bottom-0 z-10 bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 backdrop-blur border-t border-white/10 dark:border-white/10 light:border-slate-200 px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-xl text-slate-400 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-white/5 transition-colors font-semibold"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {plan.status === "pending" && (
              <>
                <button
                  disabled={isSubmitting}
                  onClick={handleReject}
                  className="focus-ring text-xs px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 transition-all font-semibold disabled:opacity-50"
                >
                  Reject Plan
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={handleApprove}
                  className="focus-ring text-xs px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Approve Remediation
                </button>
              </>
            )}

            {plan.status === "approved" && onExecute && (
              <button
                disabled={isSubmitting}
                onClick={handleExecute}
                className="focus-ring text-xs px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Execute Pipeline Remediation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
