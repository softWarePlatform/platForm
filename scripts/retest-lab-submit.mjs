/**
 * 已并入 npm run test:lab。本文件仅保留 JS Hello 抽检，失败非零退出。
 * Python 评测不在必过路径（Windows 无 python3）。
 */
const base = process.env.API_BASE ?? "http://127.0.0.1:3000";

async function j(m, p, body, t) {
  const h = {};
  if (t) h.Authorization = "Bearer " + t;
  let b;
  if (body != null) {
    h["Content-Type"] = "application/json";
    b = JSON.stringify(body);
  }
  const r = await fetch(base + p, { method: m, headers: h, body: b });
  return { s: r.status, j: await r.json().catch(() => ({})) };
}

const st = (await j("POST", "/auth/login", { email: "student@demo.local", password: "Demo123456" })).j.token;
if (!st) {
  console.error("login failed");
  process.exit(1);
}

const sub = await j(
  "POST",
  "/labs/00000000-0000-4000-8000-00000001003d/submit",
  { code: 'console.log("Hello")', language: "javascript" },
  st,
);
const sid = sub.j.submissionId;
if (!sid) {
  console.error("submit failed", sub);
  process.exit(1);
}

let finalStatus = "";
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const poll = await j("GET", `/submissions/${sid}`, null, st);
  const { status, score } = poll.j.submission ?? {};
  if (status && status !== "PENDING" && status !== "JUDGING") {
    finalStatus = status;
    console.log("TC-LAB-003-js-hello", status, score);
    break;
  }
}

if (finalStatus !== "ACCEPTED") {
  console.error("expected ACCEPTED, got", finalStatus || "timeout");
  process.exit(1);
}
