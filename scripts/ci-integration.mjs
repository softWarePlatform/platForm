import { mkdir, writeFile } from "node:fs/promises";

const apiBaseUrl = (process.env.API_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const webBaseUrl = (process.env.WEB_BASE_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const results = [];

async function request(name, url, options = {}, verify = () => true) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    const ok = response.ok && verify(body, response);
    results.push({ name, ok, status: response.status, durationMs: Date.now() - startedAt });
    if (!ok) {
      throw new Error(`${name} failed: HTTP ${response.status} ${JSON.stringify(body).slice(0, 500)}`);
    }
    return body;
  } catch (error) {
    if (!results.some((item) => item.name === name)) {
      results.push({ name, ok: false, status: null, durationMs: Date.now() - startedAt });
    }
    throw error;
  }
}

async function login(email) {
  const body = await request(
    `login:${email}`,
    `${apiBaseUrl}/auth/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Demo123456" }),
    },
    (payload) => typeof payload?.token === "string" && payload.token.length > 10,
  );
  return body.token;
}

async function main() {
  await request("api:liveness", `${apiBaseUrl}/health/live`, {}, (body) => body?.ok === true);
  await request("api:readiness", `${apiBaseUrl}/health/ready`, {}, (body) => body?.ok === true);
  await request("api:compat-health", `${apiBaseUrl}/health`, {}, (body) => body?.ok === true);
  await request("web:index", webBaseUrl, {}, (body) => typeof body === "string" && /<html/i.test(body));
  await request("courses:list", `${apiBaseUrl}/courses`, {}, (body) => Array.isArray(body?.courses));

  const studentToken = await login("student@demo.local");
  const teacherToken = await login("teacher@demo.local");
  const studentAuth = { headers: { authorization: `Bearer ${studentToken}` } };
  const teacherAuth = { headers: { authorization: `Bearer ${teacherToken}` } };

  await request("student:profile", `${apiBaseUrl}/auth/me`, studentAuth, (body) => body?.user?.role === "STUDENT");
  await request("student:notifications", `${apiBaseUrl}/notifications`, studentAuth, (body) => Array.isArray(body?.notifications));
  await request("student:lab-overview", `${apiBaseUrl}/lab-sets/mine/overview`, studentAuth, (body) => body && typeof body === "object");
  await request("student:homework", `${apiBaseUrl}/homework/mine`, studentAuth, (body) => body && typeof body === "object");
  await request("teacher:profile", `${apiBaseUrl}/auth/me`, teacherAuth, (body) => body?.user?.role === "TEACHER");
}

let failure;
try {
  await main();
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  console.error(failure);
}

const report = {
  generatedAt: new Date().toISOString(),
  apiBaseUrl,
  webBaseUrl,
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok).length,
  results,
  ...(failure ? { failure } : {}),
};

await mkdir("test-results", { recursive: true });
await writeFile("test-results/ci-integration.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (failure || report.failed > 0) process.exitCode = 1;
