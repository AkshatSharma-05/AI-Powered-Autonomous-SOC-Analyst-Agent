"use client";

/*
 * frontend/src/app/dashboard/audit/page.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Security Audit Trail & Decision Log — Spec R31.
 * Chronological immutable trace of all human-in-the-loop approvals,
 * rejections, and execution triggers for compliance & post-incident review.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from "react";
import Header from "../components/Header";
import TabNav from "../components/TabNav";
import { useRemediation } from "../hooks/useRemediation";
import { useWebSocket } from "../hooks/useWebSocket";
import { useToast } from "../../../context/ToastContext";

export default function AuditPage() {
  const { wsStatus, liveCount } = useWebSocket(() => {});
  const { auditLogs, pendingCount, loading } = useRemediation();
  const { addToast } = useToast();
  const [filterAction, setFilterAction] = useState<string>("all");

  const exportAuditLog = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `soc-audit-trail-${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    addToast({
      type: "success",
      title: "Audit Log Exported",
      message: "Downloaded compliance audit trace as JSON.",
    });
  };

  const filteredLogs = auditLogs.filter((log) => {
    if (filterAction === "all") return true;
    return log.action === filterAction;
  });

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 light:bg-slate-50 text-slate-100 dark:text-slate-100 light:text-slate-900 transition-colors duration-200">
      <Header wsStatus={wsStatus} liveCount={liveCount} />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Navigation Bar */}
        <TabNav pendingApprovalsCount={pendingCount} />

        {/* Header & Export Action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white dark:text-white light:text-slate-900">
              Security Audit Trail & Decision Log
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
              Immutable historical trace of human authorizations, rejections, and execution triggers (Spec R31)
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter pills */}
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="bg-slate-900 dark:bg-slate-900 light:bg-white border border-white/10 dark:border-white/10 light:border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-300 dark:text-slate-300 light:text-slate-700 outline-none"
            >
              <option value="all">All Audit Actions</option>
              <option value="approved">Approved Decisions</option>
              <option value="rejected">Rejected Decisions</option>
              <option value="execution_completed">Execution Logs</option>
            </select>

            <button
              onClick={exportAuditLog}
              className="focus-ring text-xs px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export JSON Log
            </button>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-white/8 dark:border-white/8 light:border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">Loading audit logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-4xl mb-3">📜</div>
              <p className="text-sm font-medium text-slate-300 dark:text-slate-300 light:text-slate-700">No audit log entries recorded</p>
              <p className="text-xs text-slate-500 mt-1">Actions taken on remediation plans will automatically append here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-white/5 dark:border-white/5 light:border-slate-200 bg-slate-950/40 dark:bg-slate-950/40 light:bg-slate-50 text-slate-400 dark:text-slate-400 light:text-slate-600 text-xs uppercase font-semibold">
                    <th className="px-5 py-3.5">Timestamp</th>
                    <th className="px-3 py-3.5">CVE ID</th>
                    <th className="px-3 py-3.5">Action Event</th>
                    <th className="px-3 py-3.5">Actor / Reviewer</th>
                    <th className="px-3 py-3.5">Risk Score</th>
                    <th className="px-3 py-3.5">Affected Assets</th>
                    <th className="px-5 py-3.5">Analyst Notes & Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/4 dark:divide-white/4 light:divide-slate-100">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02] dark:hover:bg-white/[0.02] light:hover:bg-slate-50 transition-colors">
                      {/* Timestamp */}
                      <td className="px-5 py-3.5 text-xs text-slate-400 font-mono">
                        {new Date(log.timestamp).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      {/* CVE ID */}
                      <td className="px-3 py-3.5 font-mono text-xs font-bold text-white dark:text-white light:text-slate-900">
                        {log.cve_id}
                      </td>

                      {/* Action */}
                      <td className="px-3 py-3.5">
                        {log.action === "approved" && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Approved
                          </span>
                        )}
                        {log.action === "rejected" && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                            Rejected
                          </span>
                        )}
                        {log.action === "execution_completed" && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                            Executed
                          </span>
                        )}
                      </td>

                      {/* Actor */}
                      <td className="px-3 py-3.5 text-xs font-medium text-slate-300 dark:text-slate-300 light:text-slate-800">
                        {log.actor}
                      </td>

                      {/* Risk Score */}
                      <td className="px-3 py-3.5 font-mono text-xs font-bold text-red-400">
                        {log.risk_score ? log.risk_score.toFixed(1) : "—"}
                      </td>

                      {/* Affected Assets */}
                      <td className="px-3 py-3.5 text-xs font-mono text-slate-400 truncate max-w-[150px]">
                        {log.affected_assets ? log.affected_assets.join(", ") : "—"}
                      </td>

                      {/* Notes */}
                      <td className="px-5 py-3.5 text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 max-w-xs truncate">
                        {log.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
