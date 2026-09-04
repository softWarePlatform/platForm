import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

function usage() {
  console.error("Usage: node scripts/qa/performance-benchmark.mjs --config <benchmark-config.json> --output <raw-result.json>");
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(`invalid argument near ${key ?? "<end>"}`);
    values.set(key, value);
  }
  return { config: values.get("--config"), output: values.get("--output") };
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return null;
  return sortedValues[Math.max(0, Math.ceil(sortedValues.length * ratio) - 1)];
}

function sanitizeHeaders(headers = {}) {
  return Object.fromEntries(Object.keys(headers).map((key) => [key, "[redacted]"]));
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function requestOnce(url, headers, requestTimeoutMs, expectJson) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(requestTimeoutMs) });
    const payload = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    let validationError = null;
    if (expectJson) {
      if (!contentType.toLowerCase().includes("application/json")) {
        validationError = `expected application/json but received ${contentType || "no content-type"}`;
      } else {
        try {
          JSON.parse(payload.toString("utf8"));
        } catch {
          validationError = "response body is not valid JSON";
        }
      }
    }
    return {
      ok: response.ok && validationError === null,
      status: response.status,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      contentType,
      responseBytes: payload.length,
      ...(validationError ? { validationError } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runTarget({ baseUrl, target, concurrency, requests, requestTimeoutMs }) {
  const url = joinUrl(baseUrl, target.path);
  const expectJson = target.expectJson !== false;
  const perWorker = Math.floor(requests / concurrency);
  const remainder = requests % concurrency;
  const startedAt = performance.now();
  const workers = Array.from({ length: concurrency }, async (_, index) => {
    const results = [];
    const requestCount = perWorker + (index < remainder ? 1 : 0);
    for (let requestIndex = 0; requestIndex < requestCount; requestIndex += 1) {
      results.push(await requestOnce(url, target.headers, requestTimeoutMs, expectJson));
    }
    return results;
  });
  const rawRequests = (await Promise.all(workers)).flat();
  const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
  const durations = rawRequests.map((item) => item.durationMs).sort((a, b) => a - b);
  const passed = rawRequests.filter((item) => item.ok).length;
  return {
    name: target.name,
    url,
    requestHeaders: sanitizeHeaders(target.headers),
    expectJson,
    concurrency,
    requests,
    passed,
    failed: requests - passed,
    errorRate: Number(((requests - passed) / requests).toFixed(6)),
    elapsedMs,
    throughputQps: Number((requests / elapsedMs * 1000).toFixed(2)),
    avgMs: Number((durations.reduce((total, value) => total + value, 0) / durations.length).toFixed(2)),
    p95Ms: percentile(durations, 0.95),
    rawRequests,
  };
}

const { config: configPath, output: outputPath } = parseArguments(process.argv.slice(2));
if (!configPath || !outputPath) {
  usage();
  process.exit(2);
}

const config = JSON.parse(await readFile(resolve(configPath), "utf8"));
if (!config.baseUrl || !Array.isArray(config.targets) || config.targets.length < 2 || config.targets.length > 3) {
  throw new Error("config requires baseUrl and exactly 2 or 3 targets");
}
const runs = Number(process.env.BENCHMARK_RUNS ?? config.runs ?? 3);
const concurrency = Number(process.env.BENCHMARK_CONCURRENCY ?? config.concurrency ?? 50);
const requests = Number(process.env.BENCHMARK_REQUESTS ?? config.requestsPerTarget ?? 500);
const requestTimeoutMs = Number(process.env.BENCHMARK_TIMEOUT_MS ?? config.requestTimeoutMs ?? 10_000);
const maxErrorRate = Number(process.env.BENCHMARK_MAX_ERROR_RATE ?? config.maxErrorRate ?? 0);
if (!Number.isInteger(runs) || runs < 3 || !Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(requests) || requests < concurrency || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
  throw new Error("runs must be at least 3; requestsPerTarget must be an integer no smaller than concurrency; requestTimeoutMs must be positive");
}
if (!Number.isFinite(maxErrorRate) || maxErrorRate < 0 || maxErrorRate > 1) {
  throw new Error("maxErrorRate must be between 0 and 1");
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: config.environment ?? "unspecified",
  baseUrl: config.baseUrl,
  condition: {
    runs,
    concurrency,
    requestsPerTarget: requests,
    requestTimeoutMs,
    maxErrorRate,
    datasetId: config.datasetId ?? "not-recorded",
    sameMachineEvidence: config.sameMachineEvidence ?? "not-recorded",
    resourceSnapshotFiles: config.resourceSnapshotFiles ?? [],
  },
  runs: [],
};

for (let run = 1; run <= runs; run += 1) {
  const targets = [];
  for (const target of config.targets) {
    if (!target?.name || !target?.path) throw new Error("every target requires name and path");
    targets.push(await runTarget({ baseUrl: config.baseUrl, target, concurrency, requests, requestTimeoutMs }));
  }
  report.runs.push({ run, startedAt: new Date().toISOString(), targets });
}

const destination = resolve(outputPath);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: destination, environment: report.environment, runs: report.runs.length }, null, 2));

const failedTargets = report.runs.flatMap(({ run, targets }) =>
  targets
    .filter((target) => target.errorRate > maxErrorRate)
    .map((target) => ({ run, name: target.name, errorRate: target.errorRate })),
);
if (failedTargets.length > 0) {
  console.error(JSON.stringify({ message: "benchmark exceeded maxErrorRate", maxErrorRate, failedTargets }, null, 2));
  process.exit(1);
}
