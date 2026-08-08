import type { RunSummary } from "../types";

export async function loadRuns(): Promise<RunSummary[]> {
  const response = await fetch("/api/runs");
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "Run history could not be loaded.");
  }

  return payload.runs as RunSummary[];
}

export async function saveRun(run: RunSummary): Promise<RunSummary> {
  const response = await fetch("/api/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(run)
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "Run could not be saved.");
  }

  return payload.run as RunSummary;
}
