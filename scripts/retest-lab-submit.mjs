const base = "http://127.0.0.1:3000";

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

const cases = [
  {
    name: "TC-LAB-003-js-hello",
    labId: "00000000-0000-4000-8000-00000001003d",
    code: 'console.log("Hello")',
    language: "javascript",
  },
  {
    name: "TC-LAB-003-py-apb",
    labId: "00000000-0000-4000-8000-000000010046",
    code: "a,b=map(int,input().split())\nprint(a+b)",
    language: "python",
  },
];

for (const c of cases) {
  const sub = await j("POST", `/labs/${c.labId}/submit`, { code: c.code, language: c.language }, st);
  console.log(c.name, "submit", sub.s, sub.j);
  const sid = sub.j.submissionId;
  if (!sid) continue;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await j("GET", `/submissions/${sid}`, null, st);
    const { status, score } = poll.j.submission ?? {};
    if (status && status !== "PENDING" && status !== "JUDGING") {
      console.log(c.name, "final", status, score);
      break;
    }
  }
}
