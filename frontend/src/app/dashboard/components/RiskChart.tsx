"use client";

/*
 * frontend/src/app/dashboard/components/RiskChart.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive Risk Distribution & Severity Breakdown Visualizer.
 * Built with Recharts with custom SOC dark/light aesthetics.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import type { CVEItem } from "../types";

interface RiskChartProps {
  cves: CVEItem[];
  total: number;
}

export default function RiskChart({ cves }: RiskChartProps) {
  const [chartView, setChartView] = useState<"distribution" | "severity">("distribution");

  // Group CVEs into risk score buckets (0-20, 21-40, 41-60, 61-80, 81-100)
  const riskDistributionData = useMemo(() => {
    const buckets = [
      { range: "0 - 20", label: "Low", count: 0, color: "#10b981" },
      { range: "21 - 40", label: "Moderate", count: 0, color: "#3b82f6" },
      { range: "41 - 60", label: "Medium", count: 0, color: "#eab308" },
      { range: "61 - 80", label: "High", count: 0, color: "#f97316" },
      { range: "81 - 100", label: "Critical", count: 0, color: "#ef4444" },
    ];

    cves.forEach((cve) => {
      const score = cve.risk_score || 0;
      if (score <= 20) buckets[0].count++;
      else if (score <= 40) buckets[1].count++;
      else if (score <= 60) buckets[2].count++;
      else if (score <= 80) buckets[3].count++;
      else buckets[4].count++;
    });

    return buckets;
  }, [cves]);

  // Group CVEs by exploit status
  const exploitStatusData = useMemo(() => {
    const counts: Record<string, { count: number; color: string }> = {
      "Actively Exploited": { count: 0, color: "#ef4444" },
      Weaponised: { count: 0, color: "#f97316" },
      "PoC Exists": { count: 0, color: "#eab308" },
      None: { count: 0, color: "#64748b" },
    };

    cves.forEach((cve) => {
      const status = cve.exploit_status || "None";
      if (counts[status]) {
        counts[status].count++;
      } else {
        counts.None.count++;
      }
    });

    return Object.entries(counts).map(([name, val]) => ({
      name,
      value: val.count,
      color: val.color,
    }));
  }, [cves]);

  // Average risk score
  const avgRiskScore = useMemo(() => {
    if (!cves.length) return 0;
    const totalScore = cves.reduce((sum, c) => sum + (c.risk_score || 0), 0);
    return (totalScore / cves.length).toFixed(1);
  }, [cves]);

  if (!cves.length) return null;

  return (
    <div className="bg-slate-900/60 dark:bg-slate-900/60 light:bg-white border border-white/8 dark:border-white/8 light:border-slate-200 rounded-xl p-5 shadow-sm">
      {/* Header with Switcher */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white dark:text-white light:text-slate-900">
              {chartView === "distribution" ? "Risk Score Distribution" : "Exploit Intelligence Breakdown"}
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
              Avg Score: {avgRiskScore}
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 mt-0.5">
            Real-time analytics for {cves.length} loaded CVE telemetry points
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-slate-950/60 dark:bg-slate-950/60 light:bg-slate-100 p-0.5 rounded-lg border border-white/5 dark:border-white/5 light:border-slate-200">
          <button
            type="button"
            onClick={() => setChartView("distribution")}
            className={`text-xs px-2.5 py-1 rounded-md transition-all font-medium ${
              chartView === "distribution"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-white"
            }`}
          >
            Risk Buckets
          </button>
          <button
            type="button"
            onClick={() => setChartView("severity")}
            className={`text-xs px-2.5 py-1 rounded-md transition-all font-medium ${
              chartView === "severity"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-white"
            }`}
          >
            Exploit Status
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-44 w-full">
        {chartView === "distribution" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={riskDistributionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <XAxis
                dataKey="range"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "rgba(255,255,255,0.1)",
                  borderRadius: "0.5rem",
                  color: "#f8fafc",
                  fontSize: "12px",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
                }}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                formatter={(val: unknown) => [`${val ?? 0} CVEs`, "Count"]}
                labelFormatter={(label) => `Risk Score Range: ${label}`}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {riskDistributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <ResponsiveContainer width="60%" height="100%">
              <PieChart>
                <Pie
                  data={exploitStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={38}
                  outerRadius={65}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {exploitStatusData.map((entry, index) => (
                    <Cell key={`cell-pie-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderRadius: "0.5rem",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="grid grid-cols-1 gap-1.5 text-xs text-slate-300 dark:text-slate-300 light:text-slate-700 ml-4">
              {exploitStatusData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="font-medium">{item.name}:</span>
                  <span className="text-slate-400">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
