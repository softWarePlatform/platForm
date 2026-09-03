const base = process.env.B08_BASE_URL ?? "http://127.0.0.1:18080/api";
const webBase = base.replace(/\/api\/?$/, "");
const email = process.env.B08_TEST_EMAIL ?? "b08-fault-teacher@demo.local";
const password = process.env.B08_TEST_PASSWORD;
if (!password || password.length < 12) {
  throw new Error("set B08_TEST_PASSWORD to the isolated test account password");
}

async function request(method, path, body, token) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body == null ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, payload };
}

async function getToken() {
  const registered = await request("POST", "/auth/register", {
    email,
    password,
    name: "B08 故障实验教师",
    role: "TEACHER",
  });
  if (registered.status === 200 && registered.payload.token) return registered.payload.token;

  const login = await request("POST", "/auth/login", { email, password });
  if (login.status !== 200 || !login.payload.token) {
    throw new Error(`B08 test account unavailable: HTTP ${login.status}`);
  }
  return login.payload.token;
}

async function serviceHealth() {
  const [api, web] = await Promise.all([
    fetch(`${webBase}/health`).then(async (response) => ({
      status: response.status,
      body: await response.json().catch(() => null),
    })),
    fetch(`${webBase}/`).then((response) => ({ status: response.status })),
  ]);
  return { api, web };
}

async function runFaultPhase() {
  const token = await getToken();
  const suffix = Date.now().toString(36);
  const courseResponse = await request("POST", "/courses", {
    title: `B08 Judge 故障实验 ${suffix}`,
    description: "B08 隔离测试数据",
    published: false,
  }, token);
  const courseId = courseResponse.payload.course?.id;
  if (!courseId) throw new Error(`course create failed: HTTP ${courseResponse.status}`);

  const setResponse = await request("POST", `/courses/${courseId}/lab-sets`, {
    title: "B08 自动评测实验集",
    description: "仅用于 Worker 停止与恢复实验",
  }, token);
  const labSetId = setResponse.payload.labSet?.id;
  if (!labSetId) throw new Error(`lab set create failed: HTTP ${setResponse.status}`);

  const labResponse = await request("POST", `/courses/${courseId}/labs`, {
    title: "B08 Hello",
    language: "javascript",
    starterCode: 'console.log("Hello")',
    labSetId,
  }, token);
  const labId = labResponse.payload.lab?.id;
  if (!labId) throw new Error(`lab create failed: HTTP ${labResponse.status}`);

  const testCaseResponse = await request("POST", `/labs/${labId}/testcases`, {
    input: "",
    expected: "Hello",
    hidden: false,
    weight: 1,
  }, token);
  if (!testCaseResponse.payload.testCase?.id) {
    throw new Error(`test case create failed: HTTP ${testCaseResponse.status}`);
  }

  const submitted = await request("POST", `/labs/${labId}/submit`, {
    code: 'console.log("Hello")',
    language: "javascript",
  }, token);
  const submissionId = submitted.payload.submissionId;
  if (!submissionId) throw new Error(`submission failed: HTTP ${submitted.status}`);

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const polled = await request("GET", `/submissions/${submissionId}`, null, token);

  console.log(JSON.stringify({
    phase: "worker-stopped",
    capturedAt: new Date().toISOString(),
    courseId,
    labSetId,
    labId,
    submissionId,
    submitHttpStatus: submitted.status,
    submitStatus: submitted.payload.status,
    statusAfterFiveSeconds: polled.payload.submission?.status,
    services: await serviceHealth(),
  }, null, 2));
}

async function runRecoveryPhase(submissionId) {
  if (!submissionId) throw new Error("recovery phase requires submissionId");
  const token = await getToken();
  let submission;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const response = await request("GET", `/submissions/${submissionId}`, null, token);
    submission = response.payload.submission;
    if (submission && !["PENDING", "JUDGING"].includes(submission.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(JSON.stringify({
    phase: "worker-restored",
    capturedAt: new Date().toISOString(),
    submissionId,
    finalStatus: submission?.status,
    finalScore: submission?.score,
    services: await serviceHealth(),
  }, null, 2));
  if (submission?.status !== "ACCEPTED") process.exitCode = 1;
}

const [phase = "fault", submissionId] = process.argv.slice(2);
if (phase === "fault") await runFaultPhase();
else if (phase === "recover") await runRecoveryPhase(submissionId);
else throw new Error(`unknown phase: ${phase}`);
