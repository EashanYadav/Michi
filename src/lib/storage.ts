import type { RunSummary } from "../types";

const RUNS_KEY = "michi:runs";

export function loadRuns(): RunSummary[] {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    return raw ? (JSON.parse(raw) as RunSummary[]) : [];
  } catch {
    return [];
  }
}

export function saveRun(run: RunSummary): RunSummary[] {
  const runs = [run, ...loadRuns()].slice(0, 20);
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  return runs;
}
