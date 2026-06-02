import { performance } from "node:perf_hooks";

const target = process.env.TARGET_URL ?? "http://127.0.0.1:3000/health/ready";
const concurrency = Number(process.env.CONCURRENCY ?? 50);
const total = Number(process.env.REQUESTS ?? 500);

async function worker(requestCount) {
  let ok = 0;
  const t0 = performance.now();
  for (let i = 0; i < requestCount; i++) {
    const res = await fetch(target);
    if (res.ok) ok++;
  }
  const t1 = performance.now();
  return { ok, elapsedMs: t1 - t0 };
}

async function main() {
  if (total < concurrency) {
    console.error("REQUESTS 必须 >= CONCURRENCY");
    process.exit(1);
  }
  const base = Math.floor(total / concurrency);
  const extra = total % concurrency;
  const jobs = Array.from({ length: concurrency }, (_, i) => worker(base + (i < extra ? 1 : 0)));
  const t0 = performance.now();
  const out = await Promise.all(jobs);
  const t1 = performance.now();

  const ok = out.reduce((s, x) => s + x.ok, 0);
  const elapsed = t1 - t0;
  const qps = (total / elapsed) * 1000;

  console.log("=== Smoke Load Result ===");
  console.log(`Target      : ${target}`);
  console.log(`Concurrency : ${concurrency}`);
  console.log(`Requests    : ${total}`);
  console.log(`Success     : ${ok}/${total}`);
  console.log(`Elapsed     : ${elapsed.toFixed(1)} ms`);
  console.log(`Throughput  : ${qps.toFixed(2)} req/s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

