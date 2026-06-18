import React from "react";
import type { MediaJob, JobStatus } from "@paperclipai/media-core";

interface GenerationStatusProps {
  jobs: MediaJob[];
  onCancelJob?: (jobId: string) => void;
}

export function GenerationStatus({ jobs, onCancelJob }: GenerationStatusProps) {
  const statusOrder: JobStatus[] = ["running", "queued", "succeeded", "failed", "cancelled"];
  
  const sortedJobs = [...jobs].sort((a, b) => {
    const aIndex = statusOrder.indexOf(a.status);
    const bIndex = statusOrder.indexOf(b.status);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const statusCounts = {
    queued: jobs.filter(j => j.status === "queued").length,
    running: jobs.filter(j => j.status === "running").length,
    succeeded: jobs.filter(j => j.status === "succeeded").length,
    failed: jobs.filter(j => j.status === "failed").length,
    cancelled: jobs.filter(j => j.status === "cancelled").length,
  };

  const statusColors: Record<JobStatus, string> = {
    queued: "#f59e0b",
    running: "#3b82f6",
    succeeded: "#10b981",
    failed: "#ef4444",
    cancelled: "#6b7280",
  };

  return (
    <div style={{ padding: "16px", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ margin: "0 0 16px 0", fontSize: "20px", fontWeight: 600 }}>Generation Status</h2>
      
      {/* Status Summary */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
        {statusOrder.map(status => (
          <div
            key={status}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: statusColors[status] + "15",
              border: `1px solid ${statusColors[status]}30`,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: statusColors[status],
              }}
            />
            <span style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            <span style={{ fontSize: "14px", fontWeight: 600, color: statusColors[status] }}>
              {statusCounts[status]}
            </span>
          </div>
        ))}
      </div>

      {/* Job List */}
      {sortedJobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
          No generation jobs yet. Start generating media!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {sortedJobs.map(job => (
            <div
              key={job.id}
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: statusColors[job.status],
                  }}
                />
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>
                    {job.type.charAt(0).toUpperCase() + job.type.slice(1)} — {job.backend}
                  </div>
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>
                    Job ID: {job.id.slice(0, 8)}... · Created: {new Date(job.createdAt).toLocaleString()}
                  </div>
                  {job.error && (
                    <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "4px" }}>
                      Error: {job.error}
                    </div>
                  )}
                  {job.resultAssetId && (
                    <div style={{ fontSize: "12px", color: "#059669", marginTop: "4px" }}>
                      Asset: {job.resultAssetId.slice(0, 8)}...
                    </div>
                  )}
                </div>
              </div>
              
              {(job.status === "queued" || job.status === "running") && onCancelJob && (
                <button
                  onClick={() => onCancelJob(job.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #ef4444",
                    background: "#fff",
                    color: "#ef4444",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
