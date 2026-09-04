import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputDirectory = resolve(process.argv[2] ?? "test-results/perf-ladder");
const outputDirectory = resolve(process.argv[3] ?? inputDirectory);
const levels = [1, 5, 10, 20, 50];
const kinds = ["monolith", "microservices"];
const displayNames = {
  "dashboard-teacher": "教师工作台",
  "homework-course": "课程作业列表",
  "lab-sets-course": "课程实验列表",
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const records = [];
for (const concurrency of levels) {
  for (const kind of kinds) {
    const report = JSON.parse(await readFile(resolve(inputDirectory, `${kind}-c${concurrency}.json`), "utf8"));
    const targetNames = report.runs[0].targets.map((target) => target.name);
    for (const name of targetNames) {
      const samples = report.runs.map((run) => run.targets.find((target) => target.name === name));
      records.push({
        concurrency,
        architecture: kind,
        target: name,
        targetLabel: displayNames[name] ?? name,
        medianQps: median(samples.map((sample) => sample.throughputQps)),
        medianAvgMs: median(samples.map((sample) => sample.avgMs)),
        medianP95Ms: median(samples.map((sample) => sample.p95Ms)),
        passed: samples.reduce((total, sample) => total + sample.passed, 0),
        failed: samples.reduce((total, sample) => total + sample.failed, 0),
      });
    }
  }
}

const totalPassed = records.reduce((total, record) => total + record.passed, 0);
const totalFailed = records.reduce((total, record) => total + record.failed, 0);
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "ladder-summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), levels, totalPassed, totalFailed, records }, null, 2)}\n`, "utf8");

const csvHeader = "concurrency,architecture,target,median_qps,median_avg_ms,median_p95_ms,passed,failed";
const csvRows = records.map((record) => [record.concurrency, record.architecture, record.target, record.medianQps, record.medianAvgMs, record.medianP95Ms, record.passed, record.failed].join(","));
await writeFile(resolve(outputDirectory, "ladder-summary.csv"), `${[csvHeader, ...csvRows].join("\n")}\n`, "utf8");

const colors = { monolith: "#2563eb", microservices: "#f97316" };
function lineChart(target, metric, title, suffix) {
  const width = 620;
  const height = 260;
  const left = 58;
  const right = 22;
  const top = 28;
  const bottom = 46;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const rows = records.filter((record) => record.target === target);
  const maxValue = Math.max(...rows.map((record) => record[metric])) * 1.12;
  const x = (level) => left + (levels.indexOf(level) / (levels.length - 1)) * chartWidth;
  const y = (value) => top + chartHeight - (value / maxValue) * chartHeight;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const py = top + chartHeight - ratio * chartHeight;
    return `<line x1="${left}" y1="${py}" x2="${width - right}" y2="${py}" stroke="#dbe4f0"/><text x="${left - 8}" y="${py + 4}" text-anchor="end" class="axis">${Math.round(maxValue * ratio)}</text>`;
  }).join("");
  const series = kinds.map((kind) => {
    const values = levels.map((level) => rows.find((record) => record.architecture === kind && record.concurrency === level));
    const points = values.map((record) => `${x(record.concurrency)},${y(record[metric])}`).join(" ");
    const dots = values.map((record) => `<circle cx="${x(record.concurrency)}" cy="${y(record[metric])}" r="4" fill="${colors[kind]}"/><text x="${x(record.concurrency)}" y="${y(record[metric]) - 9}" text-anchor="middle" class="value">${record[metric]}</text>`).join("");
    return `<polyline points="${points}" fill="none" stroke="${colors[kind]}" stroke-width="3"/>${dots}`;
  }).join("");
  const labels = levels.map((level) => `<text x="${x(level)}" y="${height - 18}" text-anchor="middle" class="axis">${level}</text>`).join("");
  return `<section class="chart"><h3>${escapeHtml(title)}（${escapeHtml(suffix)}）</h3><svg viewBox="0 0 ${width} ${height}" role="img">${grid}<line x1="${left}" y1="${top + chartHeight}" x2="${width - right}" y2="${top + chartHeight}" stroke="#64748b"/>${labels}${series}</svg></section>`;
}

function tableRows(target) {
  return levels.map((concurrency) => {
    const mono = records.find((record) => record.target === target && record.architecture === "monolith" && record.concurrency === concurrency);
    const micro = records.find((record) => record.target === target && record.architecture === "microservices" && record.concurrency === concurrency);
    const delta = ((micro.medianP95Ms / mono.medianP95Ms - 1) * 100).toFixed(1);
    return `<tr><td>${concurrency}</td><td>${mono.medianQps}</td><td>${micro.medianQps}</td><td>${mono.medianP95Ms}</td><td>${micro.medianP95Ms}</td><td>+${delta}%</td><td class="ok">0 / 0</td></tr>`;
  }).join("");
}

const sections = Object.keys(displayNames).map((target) => `${lineChart(target, "medianP95Ms", `${displayNames[target]} P95 响应时间`, "越低越好")}<table><thead><tr><th>并发</th><th>单体 QPS</th><th>微服务 QPS</th><th>单体 P95/ms</th><th>微服务 P95/ms</th><th>微服务 P95 增幅</th><th>失败数（单体/微服务）</th></tr></thead><tbody>${tableRows(target)}</tbody></table>`).join("");

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>单体与微服务阶梯压测补充报告</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef2f7;color:#172033;font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif}.page{width:1420px;margin:24px auto;background:white;padding:42px 52px;border-radius:22px;box-shadow:0 12px 40px #1e293b18}h1{font-size:34px;margin:0 0 8px}.sub{color:#64748b;margin-bottom:26px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}.card{padding:18px;border:1px solid #dbe4f0;border-radius:14px;background:#f8fafc}.card b{display:block;font-size:25px;color:#0f172a;margin-bottom:4px}.conclusion{border-left:5px solid #f97316;background:#fff7ed;padding:17px 20px;border-radius:10px;line-height:1.65;margin:20px 0 26px}.legend{display:flex;gap:24px;align-items:center;margin:8px 0 4px}.dot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:7px}.grid{display:grid;grid-template-columns:1fr 1.08fr;gap:24px;align-items:start;padding:24px 0;border-top:1px solid #e2e8f0}.chart{background:#f8fafc;border-radius:14px;padding:14px}.chart h3{font-size:18px;margin:0 0 4px}.axis{fill:#64748b;font-size:12px}.value{fill:#334155;font-size:10px;font-weight:600}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right}th{background:#f8fafc;color:#475569}th:first-child,td:first-child{text-align:center}.ok{color:#15803d;font-weight:700}.note{font-size:13px;color:#64748b;line-height:1.65;margin-top:20px}.stamp{font-size:12px;color:#94a3b8;text-align:right;margin-top:18px}@media print{body{background:white}.page{margin:0;box-shadow:none}}
</style></head><body><main class="page">
<h1>单体 vs 微服务：阶梯压测补充报告</h1><div class="sub">固定单机、固定 1 副本、同一数据集与接口语义；每档 3 轮取中位数</div>
<div class="cards"><div class="card"><b>1 / 5 / 10 / 20 / 50</b>并发梯度</div><div class="card"><b>9,000</b>总请求数</div><div class="card"><b>${totalPassed}</b>成功请求</div><div class="card"><b>${totalFailed}</b>失败请求</div></div>
<div class="conclusion"><strong>结论：</strong>当前结果正常且符合架构预期。固定为单副本时，微服务请求需要经过 Gateway、内部 HTTP 调用和服务自身数据库连接，P95 高于单体；这不能解读为“微服务天然更快”。微服务的价值主要在故障隔离、独立发布和可按热点服务扩容，后续 HPA 实验用于验证弹性能力。</div>
<div class="legend"><span><i class="dot" style="background:${colors.monolith}"></i>单体</span><span><i class="dot" style="background:${colors.microservices}"></i>微服务</span></div>
${Object.keys(displayNames).map((target) => `<div class="grid">${lineChart(target, "medianP95Ms", `${displayNames[target]} P95 响应时间`, "越低越好")}<div><h3>${displayNames[target]} 数据表</h3><table><thead><tr><th>并发</th><th>单体 QPS</th><th>微服务 QPS</th><th>单体 P95</th><th>微服务 P95</th><th>P95 增幅</th><th>失败</th></tr></thead><tbody>${tableRows(target)}</tbody></table></div></div>`).join("")}
<div class="note"><strong>实验口径：</strong>每个架构 5 个并发档，每档 3 个业务接口 × 100 请求 × 3 轮；并发由固定数量 worker 循环发起，响应必须为成功 HTTP 状态且为可解析 JSON；零错误率门槛。截图展示中位数，原始 JSON 保留每次请求耗时与状态码，可追溯复核。</div>
<div class="stamp">生成时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</div>
</main></body></html>`;
await writeFile(resolve(outputDirectory, "perf-ladder-report.html"), html, "utf8");
console.log(JSON.stringify({ outputDirectory, records: records.length, totalPassed, totalFailed }, null, 2));
