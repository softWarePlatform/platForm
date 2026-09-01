import type { RunnerLanguage } from "./runner.js";

export const WORKER_LANGUAGES = ["python", "javascript"] as const;

export function parseRunnerLanguage(value: string): RunnerLanguage | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "python" || normalized === "javascript") return normalized;
  return null;
}
