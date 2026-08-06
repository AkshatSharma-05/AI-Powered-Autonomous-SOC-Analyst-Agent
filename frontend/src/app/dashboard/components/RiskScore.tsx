"use client";

import React from "react";

interface RiskScoreProps {
  score: number;
  size?: "sm" | "lg";
}

function getRiskTier(score: number): {
  label: string;
  color: string;
  bgColor: string;
  barColor: string;
} {
  if (score >= 40) {
    return {
      label: "CRITICAL",
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      barColor: "bg-gradient-to-r from-red-600 to-red-400",
    };
  }
  if (score >= 20) {
    return {
      label: "HIGH",
      color: "text-orange-400",
      bgColor: "bg-orange-500/10",
      barColor: "bg-gradient-to-r from-orange-600 to-orange-400",
    };
  }
  if (score >= 10) {
    return {
      label: "MEDIUM",
      color: "text-yellow-400",
      bgColor: "bg-yellow-500/10",
      barColor: "bg-gradient-to-r from-yellow-600 to-yellow-400",
    };
  }
  return {
    label: "LOW",
    color: "text-slate-400",
    bgColor: "bg-slate-500/10",
    barColor: "bg-gradient-to-r from-slate-600 to-slate-400",
  };
}

export default function RiskScore({ score, size = "sm" }: RiskScoreProps) {
  const tier = getRiskTier(score);
  // Cap bar at 60 (Log4Shell max = 10 × 3 × 2 = 60)
  const barWidth = Math.min((score / 60) * 100, 100);

  if (size === "lg") {
    return (
      <div className={`rounded-lg p-4 ${tier.bgColor} border border-white/5`}>
        <div className="flex items-end gap-2 mb-2">
          <span className={`text-3xl font-bold tabular-nums ${tier.color}`}>
            {score.toFixed(1)}
          </span>
          <span className={`text-xs font-semibold mb-1 ${tier.color}`}>
            {tier.label}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${tier.barColor}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <span className={`text-sm font-bold tabular-nums ${tier.color}`}>
        {score.toFixed(1)}
      </span>
      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${tier.barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}
