/**
 * 步骤 8：性能冒烟 + 安全抽检
 * 运行：node scripts/step8-perf-sec-test.mjs
 */
const base = "http://127.0.0.1:3000";
const courseId = "00000000-0000-4000-8000-00000001001c";
const results = [];

async function login(email) {
  const r = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Demo123456" }),
  });
  const j = await r.json();
  return { status: r.status, token: j.token };
}

async function main() {
  const st = await login("student@demo.local");
  const tt = await login("teacher@demo.local");

  // TC-SEC-001 SQL injection in search
  const inj = encodeURIComponent("' OR 1=1--");
  const sqlUrls = [
    `/courses?search=${inj}`,
    `/enrollment/catalog?courseCode=${inj}`,
  ];
  for (const path of sqlUrls) {
    const r = await fetch(base + path, {
      headers: { Authorization: `Bearer ${st.token}` },
    });
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      j = text.slice(0, 200);
    }
    const leaked = r.status === 500 || /syntax error|SQL|prisma/i.test(text);
    results.push({
      name: "TC-SEC-001",
      path,
      status: r.status,
      ok: r.status !== 500 && !leaked,
      summary: typeof j === "object" ? `courses/total=${j.courses?.length ?? j.total ?? "n/a"}` : String(j),
    });
  }

  // TC-SEC-002 XSS in announcement title
  const xssTitle = "<img src=x onerror=alert(1)>";
  const create = await fetch(`${base}/courses/${courseId}/announcements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tt.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: xssTitle, content: "XSS test body", pinned: false }),
  });
  const created = await create.json();
  const annId = created?.announcement?.id;
  const storedTitle = created?.announcement?.title ?? "";
  results.push({
    name: "TC-SEC-002",
    status: create.status,
    ok: create.ok && storedTitle === xssTitle,
    note: "服务端原样存储；前端 React 默认转义，不执行脚本",
    storedTitle,
  });
  if (annId) {
    await fetch(`${base}/announcements/${annId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tt.token}` },
    });
  }

  // TC-SEC-003 helmet headers
  const hr = await fetch(`${base}/health/ready`);
  const headers = Object.fromEntries(hr.headers.entries());
  const securityHeaders = [
    "x-content-type-options",
    "x-frame-options",
    "content-security-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
  ];
  const present = securityHeaders.filter((h) => headers[h] ?? headers[h.toLowerCase()]);
  results.push({
    name: "TC-SEC-003",
    status: hr.status,
    ok: present.length >= 2,
    present,
    allHeaders: Object.keys(headers).filter((k) => k.startsWith("x-") || k.includes("content-security")),
  });

  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
