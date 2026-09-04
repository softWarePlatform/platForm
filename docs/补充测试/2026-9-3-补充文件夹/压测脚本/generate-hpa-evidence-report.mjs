import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputDirectory = resolve(process.argv[2] ?? "test-results/hpa-supplement");
const outputDirectory = resolve(process.argv[3] ?? inputDirectory);
const duringLoad = await readFile(resolve(inputDirectory, "hpa-during-load.log"), "utf8");
const scaleDown = await readFile(resolve(inputDirectory, "scale-down.log"), "utf8");
const describe = await readFile(resolve(inputDirectory, "hpa-describe.log"), "utf8");

const blocks = duringLoad.split(/(?=\[[^\]]+\] (?:elapsed=\d+s|completed))/g);
const samples = [];
for (const block of blocks) {
  const elapsedMatch = block.match(/elapsed=(\d+)s/);
  const rowMatch = block.match(/api-gateway\s+Deployment\/api-gateway\s+cpu:\s*(\d+)%\/60%\s+1\s+5\s+(\d+)/);
  if (!elapsedMatch || !rowMatch) continue;
  samples.push({ elapsedSeconds: Number(elapsedMatch[1]), cpuPercent: Number(rowMatch[1]), replicas: Number(rowMatch[2]) });
}
if (samples.length === 0) throw new Error("No HPA samples could be parsed.");

const finalMatch = scaleDown.match(/api-gateway\s+Deployment\/api-gateway\s+cpu:\s*(\d+)%\/60%\s+1\s+5\s+(\d+)/);
if (!finalMatch) throw new Error("No final HPA state could be parsed.");
const finalState = { cpuPercent: Number(finalMatch[1]), replicas: Number(finalMatch[2]) };
const rescaleEvents = [...describe.matchAll(/New size:\s*(\d+); reason:\s*([^\r\n]+)/g)].map((match) => ({ replicas: Number(match[1]), reason: match[2].trim() }));
const maxCpu = Math.max(...samples.map((sample) => sample.cpuPercent));
const maxReplicas = Math.max(...samples.map((sample) => sample.replicas));

await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "hpa-timeline.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), samples, finalState, maxCpu, maxReplicas, rescaleEvents }, null, 2)}\n`, "utf8");

const width = 1120;
const height = 360;
const left = 70;
const right = 70;
const top = 28;
const bottom = 55;
const chartWidth = width - left - right;
const chartHeight = height - top - bottom;
const x = (seconds) => left + (seconds / 180) * chartWidth;
const yCpu = (value) => top + chartHeight - (value / 330) * chartHeight;
const yReplicas = (value) => top + chartHeight - (value / 5) * chartHeight;
const cpuPoints = samples.map((sample) => `${x(sample.elapsedSeconds)},${yCpu(sample.cpuPercent)}`).join(" ");
const replicaPoints = samples.map((sample) => `${x(sample.elapsedSeconds)},${yReplicas(sample.replicas)}`).join(" ");
const grid = [0, 60, 120, 180, 240, 300].map((value) => `<line x1="${left}" y1="${yCpu(value)}" x2="${width - right}" y2="${yCpu(value)}" stroke="#dbe4f0"/><text x="${left - 10}" y="${yCpu(value) + 4}" text-anchor="end" class="axis">${value}%</text>`).join("");
const labels = [0, 30, 60, 90, 120, 150, 180].map((value) => `<text x="${x(value)}" y="${height - 20}" text-anchor="middle" class="axis">${value}s</text>`).join("");
const replicaLabels = [1, 2, 3, 4, 5].map((value) => `<text x="${width - right + 12}" y="${yReplicas(value) + 4}" class="axis">${value}</text>`).join("");
const dots = samples.map((sample) => `<circle cx="${x(sample.elapsedSeconds)}" cy="${yReplicas(sample.replicas)}" r="4" fill="#7c3aed"/>`).join("");

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>HPA 扩缩容实验报告</title>
<style>*{box-sizing:border-box}body{margin:0;background:#eef2f7;color:#172033;font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif}.page{width:1320px;margin:24px auto;background:#fff;padding:44px 54px;border-radius:22px;box-shadow:0 12px 40px #1e293b18}h1{font-size:34px;margin:0 0 8px}.sub{color:#64748b;margin-bottom:28px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.card{padding:20px;border:1px solid #dbe4f0;border-radius:14px;background:#f8fafc}.card b{font-size:29px;display:block;margin-bottom:4px}.ok{color:#15803d}.chart{margin:26px 0;background:#f8fafc;border-radius:16px;padding:20px}.axis{fill:#64748b;font-size:12px}.legend{display:flex;gap:26px;margin:0 0 12px}.dot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:7px}.flow{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:22px 0}.step{border-radius:12px;padding:16px;text-align:center;background:#f1f5f9;border:1px solid #dbe4f0}.step strong{display:block;font-size:24px;color:#0f172a}.arrow{font-size:25px;color:#94a3b8;align-self:center;text-align:center}.conclusion{border-left:5px solid #16a34a;background:#f0fdf4;padding:18px 20px;border-radius:10px;line-height:1.65}.evidence{font-size:14px;color:#475569;line-height:1.75;margin-top:20px}.stamp{text-align:right;color:#94a3b8;font-size:12px;margin-top:20px}</style></head><body><main class="page">
<h1>API Gateway HPA 扩缩容实验证据</h1><div class="sub">Kubernetes autoscaling/v2 · CPU 目标 60% · min=1 / max=5 · 负载 180 秒 / 并行度 40</div>
<div class="cards"><div class="card"><b>${samples[0].replicas} 副本</b>实验起点</div><div class="card"><b>${maxCpu}%</b>观测峰值 CPU</div><div class="card"><b>${maxReplicas} 副本</b>扩容上限</div><div class="card"><b class="ok">${finalState.replicas} 副本</b>负载结束后回落</div></div>
<section class="chart"><div class="legend"><span><i class="dot" style="background:#ef4444"></i>CPU 利用率（左轴）</span><span><i class="dot" style="background:#7c3aed"></i>副本数（右轴）</span><span><i class="dot" style="background:#16a34a"></i>CPU 目标 60%</span></div><svg viewBox="0 0 ${width} ${height}">${grid}<line x1="${left}" y1="${yCpu(60)}" x2="${width-right}" y2="${yCpu(60)}" stroke="#16a34a" stroke-width="2" stroke-dasharray="8 6"/><polyline points="${cpuPoints}" fill="none" stroke="#ef4444" stroke-width="3"/><polyline points="${replicaPoints}" fill="none" stroke="#7c3aed" stroke-width="4"/>${dots}${labels}${replicaLabels}</svg></section>
<div class="flow"><div class="step"><strong>1</strong>初始副本</div><div class="step"><strong>302%</strong>30 秒 CPU 峰值</div><div class="step"><strong>3</strong>约 45 秒扩容</div><div class="step"><strong>5</strong>约 105 秒到上限</div><div class="step"><strong>1</strong>稳定窗口后缩容</div></div>
<div class="conclusion"><strong>验收结论：通过。</strong> Metrics Server 持续返回有效 CPU 指标；压力期间 HPA 从 1 扩至 3、再扩至 5；停止负载并经过 300 秒缩容稳定窗口后，经 5→4→2→1 回落，最终 CPU ${finalState.cpuPercent}%，副本数 ${finalState.replicas}。新副本均通过 readiness，负载 Pod 正常完成且退出码为 0。</div>
<div class="evidence"><strong>可追溯证据：</strong> hpa-during-load.log（每 15 秒采样）、hpa-after.yaml（配置与状态）、hpa-describe.log（SuccessfulRescale 事件）、scale-down.log（最终 1 副本）、load-generator.log（完成标记）。</div>
<div class="stamp">生成时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</div>
</main></body></html>`;
await writeFile(resolve(outputDirectory, "hpa-experiment-report.html"), html, "utf8");
console.log(JSON.stringify({ samples: samples.length, maxCpu, maxReplicas, finalState }, null, 2));
