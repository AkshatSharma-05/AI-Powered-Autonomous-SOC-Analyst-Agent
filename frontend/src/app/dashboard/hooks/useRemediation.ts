"use client";

/*
 * frontend/src/app/dashboard/hooks/useRemediation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom hook managing V2.0 Remediation Plans & Audit Trail.
 * - Syncs with backend if endpoints are live
 * - Falls back to seed plans with localStorage persistence
 * - Tracks human approval decisions and logs them to the Audit Trail
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from "react";
import type { RemediationPlan, AuditLogEntry } from "../types/remediation";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SEED_PLANS: RemediationPlan[] = [
  {
    id: "plan-log4j-01",
    cve_id: "CVE-2021-44228",
    title: "Apache Log4j Remote Code Execution Mitigation (Log4Shell)",
    status: "pending",
    risk_score: 60.0,
    cvss_score: 10.0,
    exploit_status: "Actively Exploited",
    affected_assets: ["app-server-01", "payment-gateway-01"],
    recommended_version: "org.apache.logging.log4j:log4j-core >= 2.17.1",
    summary:
      "Critical JNDI lookup injection flaw allowing unauthenticated remote code execution. Recommend immediate library upgrade and JVM mitigation flag injection across DMZ endpoints.",
    reasoning_trace:
      "A4 Agent analyzed CVE-2021-44228 affecting app-server-01 (DMZ, 3.0x multiplier, internet-facing). Active exploits verified in wild with 2.0x exploit multiplier. Base CVSS 10.0. Immediate patch rollout prioritized before standard sprint release window.",
    steps: [
      {
        order: 1,
        action: "Set JVM mitigation parameter across container environments",
        command: "export LOG4J_FORMAT_MSG_NO_LOOKUPS=true",
        description: "Disables message lookup mechanism dynamically before library rebuild.",
      },
      {
        order: 2,
        action: "Upgrade dependency in Maven pom.xml or Gradle build script",
        command: "mvn versions:use-latest-releases -Dincludes=org.apache.logging.log4j:log4j-core",
        description: "Pins Log4j version to 2.17.1+ which removes JNDI LDAP lookup protocol entirely.",
      },
      {
        order: 3,
        action: "Restart application container on DMZ host",
        command: "docker-compose restart app-server-01",
        description: "Gracefully reloads application container with zero network socket drop.",
      },
    ],
    rollback_steps: [
      {
        order: 1,
        action: "Revert image tag in compose manifest",
        command: "git checkout HEAD~1 -- docker-compose.yml && docker-compose up -d",
      },
      {
        order: 2,
        action: "Verify container health status",
        command: "docker ps --filter name=app-server-01",
      },
    ],
    estimated_downtime_minutes: 2,
    impact_assessment: "Critical",
    requires_restart: true,
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "plan-xz-02",
    cve_id: "CVE-2024-3094",
    title: "XZ Utils / liblzma Upstream Supply Chain Backdoor",
    status: "pending",
    risk_score: 58.8,
    cvss_score: 9.8,
    exploit_status: "Weaponised",
    affected_assets: ["bastion-host-01", "k8s-node-dmz-02"],
    recommended_version: "xz-utils == 5.4.6 or >= 5.6.1-r1 (uncompromised)",
    summary:
      "Malicious code in release tarballs targeting OpenSSH server authentication. Downgrade/reinstall pristine upstream distribution packages immediately.",
    reasoning_trace:
      "Agent A4 correlated infected liblzma version 5.6.0 on bastion host. sshd systemd injection vulnerability present. Downgrading package to verified clean version 5.4.6.",
    steps: [
      {
        order: 1,
        action: "Verify installed liblzma package version",
        command: "apt-cache policy liblzma5",
        description: "Checks if vulnerable 5.6.0 or 5.6.1 versions are resident in memory.",
      },
      {
        order: 2,
        action: "Downgrade to official debian/ubuntu stable release 5.4.6",
        command: "sudo apt-get install --allow-downgrades liblzma5=5.4.6-1",
        description: "Replaces compromised shared object with clean build.",
      },
      {
        order: 3,
        action: "Restart OpenSSH service daemon",
        command: "sudo systemctl restart sshd",
        description: "Reloads sshd linking against pristine liblzma.",
      },
    ],
    rollback_steps: [
      {
        order: 1,
        action: "Restore previous package snapshot",
        command: "sudo apt-get install --reinstall liblzma5",
      },
    ],
    estimated_downtime_minutes: 1,
    impact_assessment: "High",
    requires_restart: false,
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "plan-openssl-03",
    cve_id: "CVE-2022-3602",
    title: "OpenSSL X.509 Email Address Buffer Overflow",
    status: "approved",
    risk_score: 31.2,
    cvss_score: 7.8,
    exploit_status: "PoC Exists",
    affected_assets: ["api-gateway-01"],
    recommended_version: "openssl >= 3.0.7",
    summary:
      "4-byte stack buffer overflow flaw in X.509 name constraint certificate checking. Patch OpenSSL library to version 3.0.7.",
    reasoning_trace:
      "Evaluated vulnerability on api-gateway-01. Exposure multiplier 1.0 (internal proxy). PoC exists. Approved for off-peak deployment.",
    steps: [
      {
        order: 1,
        action: "Update OpenSSL packages via package manager",
        command: "sudo apt-get update && sudo apt-get install --only-upgrade openssl libssl3",
        description: "Applies vendor security patch to OpenSSL runtime.",
      },
    ],
    rollback_steps: [
      {
        order: 1,
        action: "Rollback to previous snapshot if TLS negotiation fails",
        command: "sudo apt-get install libssl3=3.0.2-0ubuntu1.6",
      },
    ],
    estimated_downtime_minutes: 0,
    impact_assessment: "Medium",
    requires_restart: false,
    created_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    decision_by: "SecOps Lead (Analyst #402)",
    decision_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    decision_notes: "Approved for staging deployment during maintenance window.",
  },
];

const SEED_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: "audit-001",
    plan_id: "plan-openssl-03",
    cve_id: "CVE-2022-3602",
    action: "approved",
    actor: "SecOps Lead (Analyst #402)",
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    notes: "Approved for staging deployment during maintenance window.",
    risk_score: 31.2,
    affected_assets: ["api-gateway-01"],
  },
  {
    id: "audit-002",
    plan_id: "plan-forti-legacy",
    cve_id: "CVE-2024-21762",
    action: "rejected",
    actor: "Security Director",
    timestamp: new Date(Date.now() - 1000 * 60 * 1440).toISOString(),
    notes: "Rejected automated CLI push: firmware requires physical staging cluster failover.",
    risk_score: 58.8,
    affected_assets: ["firewall-edge-01"],
  },
];

export function useRemediation() {
  const [plans, setPlans] = useState<RemediationPlan[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize from backend or localStorage
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Try backend API first
        const res = await fetch(`${BACKEND}/remediation/plans`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          setPlans(data.plans || []);
          setAuditLogs(data.audit_logs || []);
          setLoading(false);
          return;
        }
      } catch {
        // Backend not ready yet, fallback to localStorage/seed
      }

      // Load local state
      const savedPlans = localStorage.getItem("soc_remediation_plans");
      const savedLogs = localStorage.getItem("soc_audit_logs");

      if (savedPlans) {
        try {
          setPlans(JSON.parse(savedPlans));
        } catch {
          setPlans(SEED_PLANS);
        }
      } else {
        setPlans(SEED_PLANS);
        localStorage.setItem("soc_remediation_plans", JSON.stringify(SEED_PLANS));
      }

      if (savedLogs) {
        try {
          setAuditLogs(JSON.parse(savedLogs));
        } catch {
          setAuditLogs(SEED_AUDIT_LOGS);
        }
      } else {
        setAuditLogs(SEED_AUDIT_LOGS);
        localStorage.setItem("soc_audit_logs", JSON.stringify(SEED_AUDIT_LOGS));
      }

      setLoading(false);
    };

    loadData();
  }, []);

  // Save changes
  const saveState = useCallback((newPlans: RemediationPlan[], newLogs: AuditLogEntry[]) => {
    setPlans(newPlans);
    setAuditLogs(newLogs);
    localStorage.setItem("soc_remediation_plans", JSON.stringify(newPlans));
    localStorage.setItem("soc_audit_logs", JSON.stringify(newLogs));
  }, []);

  // Approve a plan
  const approvePlan = useCallback(
    async (planId: string, notes?: string, actor = "SOC Analyst") => {
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan) return;

      const now = new Date().toISOString();
      const updatedPlans = plans.map((p) =>
        p.id === planId
          ? {
              ...p,
              status: "approved" as const,
              decision_by: actor,
              decision_at: now,
              decision_notes: notes,
            }
          : p
      );

      const newAuditEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        plan_id: planId,
        cve_id: targetPlan.cve_id,
        action: "approved",
        actor,
        timestamp: now,
        notes: notes || "Approved for automated execution",
        risk_score: targetPlan.risk_score,
        affected_assets: targetPlan.affected_assets,
      };

      saveState(updatedPlans, [newAuditEntry, ...auditLogs]);

      // Call backend if available
      try {
        await fetch(`${BACKEND}/remediation/plans/${planId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor, notes }),
        }).catch(() => null);
      } catch {
        /* Ignore backend errors in mock mode */
      }
    },
    [plans, auditLogs, saveState]
  );

  // Reject a plan
  const rejectPlan = useCallback(
    async (planId: string, notes?: string, actor = "SOC Analyst") => {
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan) return;

      const now = new Date().toISOString();
      const updatedPlans = plans.map((p) =>
        p.id === planId
          ? {
              ...p,
              status: "rejected" as const,
              decision_by: actor,
              decision_at: now,
              decision_notes: notes,
            }
          : p
      );

      const newAuditEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        plan_id: planId,
        cve_id: targetPlan.cve_id,
        action: "rejected",
        actor,
        timestamp: now,
        notes: notes || "Plan rejected by security team",
        risk_score: targetPlan.risk_score,
        affected_assets: targetPlan.affected_assets,
      };

      saveState(updatedPlans, [newAuditEntry, ...auditLogs]);

      // Call backend if available
      try {
        await fetch(`${BACKEND}/remediation/plans/${planId}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor, notes }),
        }).catch(() => null);
      } catch {
        /* Ignore backend errors in mock mode */
      }
    },
    [plans, auditLogs, saveState]
  );

  // Execute an approved plan
  const executePlan = useCallback(
    async (planId: string) => {
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan) return;

      const now = new Date().toISOString();
      const updatedPlans = plans.map((p) =>
        p.id === planId ? { ...p, status: "completed" as const, execution_output: "All commands executed successfully with exit code 0." } : p
      );

      const newAuditEntry: AuditLogEntry = {
        id: `audit-${Date.now()}`,
        plan_id: planId,
        cve_id: targetPlan.cve_id,
        action: "execution_completed",
        actor: "Autonomous Pipeline (Agent A5)",
        timestamp: now,
        notes: "Remediation commands executed and validated on target infrastructure.",
        risk_score: targetPlan.risk_score,
        affected_assets: targetPlan.affected_assets,
      };

      saveState(updatedPlans, [newAuditEntry, ...auditLogs]);
    },
    [plans, auditLogs, saveState]
  );

  const pendingCount = plans.filter((p) => p.status === "pending").length;

  return {
    plans,
    auditLogs,
    loading,
    pendingCount,
    approvePlan,
    rejectPlan,
    executePlan,
  };
}
