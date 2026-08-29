import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type RunnerLanguage = "javascript" | "python";

export async function runPracticeCode(opts: {
  language: RunnerLanguage;
  code: string;
  stdin: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "practice-"));
  const ext = opts.language === "python" ? "py" : "js";
  const file = path.join(dir, `main.${ext}`);
  await writeFile(file, opts.code, "utf8");

  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  let timedOut = false;

  const cmd =
    opts.language === "python"
      ? process.platform === "win32"
        ? "python"
        : "python3"
      : process.execPath;
  let child;
  try {
    child = spawn(cmd, [file], {
      cwd: dir,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      windowsHide: true,
    });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    return {
      stdout,
      stderr: error instanceof Error ? error.message : String(error),
      exitCode,
      timedOut,
    };
  }

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitPromise = new Promise<void>((resolve) => {
    child.on("close", (code) => {
      exitCode = code;
      resolve();
    });
    child.on("error", (error) => {
      stderr += error.message;
      resolve();
    });
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

  return { stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode, timedOut };
}

export function normalizePracticeOutput(s: string): string {
  return s.replace(/\r\n/g, "\n").trimEnd();
}
