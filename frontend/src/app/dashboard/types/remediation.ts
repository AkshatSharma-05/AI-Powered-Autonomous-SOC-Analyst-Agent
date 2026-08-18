/*
 * frontend/src/app/dashboard/types/remediation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript schema definitions for Version 2.0:
 * Agent A4 (LLM Remediation Planner) & Human Approval Checkpoint (Spec R27-R31).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ExploitStatus } from "./index";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "executing" | "completed";

export type ImpactLevel = "Low" | "Medium" | "High" | "Critical";

export interface RemediationStep {
  order: number;
  action: string;
  command?: string;
  description: string;
}

export interface RollbackStep {
  order: number;
  action: string;
  command?: string;
}

export interface RemediationPlan {
  id: string;
  cve_id: string;
  title: string;
  status: ApprovalStatus;
  risk_score: number;
  cvss_score: number;
  exploit_status: ExploitStatus;
  affected_assets: string[];
  recommended_version: string;
  summary: string;
  steps: RemediationStep[];
  rollback_steps: RollbackStep[];
  estimated_downtime_minutes: number;
  impact_assessment: ImpactLevel;
  requires_restart: boolean;
  created_at: string;
  reasoning_trace?: string;
  decision_by?: string;
  decision_at?: string;
  decision_notes?: string;
  execution_output?: string;
}

export interface AuditLogEntry {
  id: string;
  plan_id: string;
  cve_id: string;
  action: "approved" | "rejected" | "execution_started" | "execution_completed" | "rollback_initiated";
  actor: string;
  timestamp: string;
  notes?: string;
  risk_score: number;
  affected_assets: string[];
}
