import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type RunnerLanguage = "javascript" | "python";

export async function runCode(opts: {
  language: RunnerLanguage;
  code: string;
  stdin: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "judge-"));
  const ext = opts.language === "python" ? "py" : "js";
  const file = path.join(dir, `main.${ext}`);
  await writeFile(file, opts.code, "utf8");

  const cmd = opts.language === "python" ? "python3" : "node";
  const args = [file];

  const child = spawn(cmd, args, {
    cwd: dir,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (d) => {
    stdout += d.toString();
  });
  child.stderr?.on("data", (d) => {
    stderr += d.toString();
  });

  let exitCode: number | null = null;
  let timedOut = false;

  const exitPromise = new Promise<void>((resolve) => {
    child.on("close", (code) => {
      exitCode = code;
      resolve();
    });
    child.on("error", () => resolve());
  });

  child.stdin?.write(opts.stdin);
  child.stdin?.end();

  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }, opts.timeoutMs);

  await Promise.race([
    exitPromise,
    new Promise<void>((resolve) => setTimeout(resolve, opts.timeoutMs + 100)),
  ]);
  clearTimeout(timer);

  await rm(dir, { recursive: true, force: true });

  return {
    stdout: stdout.trimEnd(),
    stderr: stderr.trimEnd(),
    exitCode,
    timedOut,
  };
}

export function normalizeOutput(s: string): string {
  return s.replace(/\r\n/g, "\n").trimEnd();
}
