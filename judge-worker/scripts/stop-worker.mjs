import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ps1 = join(root, "scripts", "stop-worker.ps1");

if (platform() === "win32") {
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1],
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 0);
}

spawnSync("pkill", ["-f", "judge-worker.*worker"], { stdio: "inherit" });
