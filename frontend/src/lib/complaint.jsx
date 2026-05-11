import React from "react";
import { Clock, Loader2, CheckCircle2 } from "lucide-react";

export const STATUSES = ["Pending", "In Progress", "Resolved"];

export function statusClass(status) {
  if (status === "Pending") return "status-pending";
  if (status === "In Progress") return "status-in-progress";
  if (status === "Resolved") return "status-resolved";
  return "";
}

export function statusDotClass(status) {
  if (status === "Pending") return "status-dot-pending";
  if (status === "In Progress") return "status-dot-in-progress";
  if (status === "Resolved") return "status-dot-resolved";
  return "";
}

export function StatusPill({ status, testid }) {
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${statusClass(status)}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(status)}`} />
      {status}
    </span>
  );
}

export function StatusIcon({ status, className = "h-5 w-5" }) {
  if (status === "Pending") return <Clock className={className} />;
  if (status === "In Progress") return <Loader2 className={className} />;
  if (status === "Resolved") return <CheckCircle2 className={className} />;
  return null;
}

export function formatDateTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}
