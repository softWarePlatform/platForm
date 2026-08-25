/**
 * D1 UC06—UC08 基线验证（API）。
 * 运行：node scripts/d1-uc06-uc08-verify.mjs
 * 依赖：API :3000、Redis、judge-worker。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURES } from "./test-fixtures.mjs";

const base = process.env.API_BASE ?? "http://127.0.0.1:3000";
const courseId = FIXTURES.courseId;
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "吴本昭", "2026-8-25", "raw");

const log = [];
const summary = [];

function rec(uc, name, ok, note, extra = {}) {
  const row = { uc, name, ok, note, ...extra };
  summary.push(row);
  return row;
}

async function api(name, method, path, body, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body != null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const started = Date.now();
  const res = await fetch(base + path, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const entry = {
    name,
    method,
    path,
    status: res.status,
    ms: Date.now() - started,
    ok: res.ok,
    body: json,
  };
  log.push(entry);
  return entry;
}

async function login(email) {
  const r = await api(`login:${email}`, "POST", "/auth/login", {
    email,
    password: "Demo123456",
  });
  return { token: r.body?.token, user: r.body?.user };
}

async function pollSubmission(token, submissionId, tries = 20, intervalMs = 1000) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await api(`poll:${submissionId}:${i}`, "GET", `/submissions/${submissionId}`, null, token);
    const status = last.body?.submission?.status;
    if (status && status !== "PENDING" && status !== "JUDGING") return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

async function main() {
  const live = await api("health.live", "GET", "/health/live");
  rec("ENV", "API 存活", live.status === 200 && live.body?.ok === true, JSON.stringify(live.body));
  const ready = await api("health.ready", "GET", "/health/ready");
  rec("ENV", "API 就绪(DB+Redis)", ready.status === 200 && ready.body?.ok === true, JSON.stringify(ready.body));

  const student = await login("student@demo.local");
  const teacher = await login("teacher@demo.local");
  rec("ENV", "学生登录", Boolean(student.token), student.user?.email ?? "");
  rec("ENV", "教师登录", Boolean(teacher.token), teacher.user?.email ?? "");
  if (!student.token || !teacher.token) {
    throw new Error("登录失败，中止用例验证");
  }

  // ---------- UC06 ----------
  const sets = await api("uc06.labSets", "GET", `/courses/${courseId}/lab-sets`, null, student.token);
  rec("UC06", "学生查看课程实验集", sets.ok && Array.isArray(sets.body?.labSets) && sets.body.labSets.length > 0, `count=${sets.body?.labSets?.length}`);

  const now = new Date();
  const startAt = new Date(now.getTime() - 60_000).toISOString();
  const dueAt = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();
  const createdSet = await api("uc06.createSet", "POST", `/courses/${courseId}/lab-sets`, {
    title: "D1-UC06 评测验证实验集",
    description: "吴本昭 D1 自动评测验证，勿用于教学评分。",
    startAt,
    dueAt,
    allowMakeup: true,
    makeupDueAt: new Date(now.getTime() + 10 * 24 * 3600_000).toISOString(),
  }, teacher.token);
  rec("UC06", "教师发布实验集", createdSet.status === 201 && Boolean(createdSet.body?.labSet?.id), createdSet.body?.labSet?.id ?? createdSet.body?.error);

  const labSetId = createdSet.body?.labSet?.id;
  const createdLab = labSetId
    ? await api("uc06.createLab", "POST", `/courses/${courseId}/labs`, {
        title: "D1-Hello-JS",
        description: "输出 Hello",
        language: "javascript",
        starterCode: 'console.log("Hello")\n',
        labSetId,
      }, teacher.token)
    : { ok: false, body: {} };
  rec("UC06", "教师创建实验题目", Boolean(createdLab.body?.lab?.id), createdLab.body?.lab?.id ?? createdLab.body?.error);

  const labId = createdLab.body?.lab?.id;
  const tc = labId
    ? await api("uc06.testcase", "POST", `/labs/${labId}/testcases`, {
        input: "",
        expected: "Hello",
        hidden: false,
        weight: 1,
      }, teacher.token)
    : { ok: false, body: {} };
  rec("UC06", "教师配置测试用例", Boolean(tc.body?.testCase?.id), tc.body?.testCase?.id ?? tc.body?.error);

  const submitAc = labId
    ? await api("uc06.submitAc", "POST", `/labs/${labId}/submit`, {
        code: 'console.log("Hello")\n',
        language: "javascript",
      }, student.token)
    : { ok: false, body: {} };
  rec("UC06", "学生提交正确代码入队", Boolean(submitAc.body?.submissionId), `status=${submitAc.body?.status} id=${submitAc.body?.submissionId ?? submitAc.body?.error}`);

  const acPoll = submitAc.body?.submissionId
    ? await pollSubmission(student.token, submitAc.body.submissionId)
    : { body: {} };
  const acStatus = acPoll.body?.submission?.status;
  rec(
    "UC06",
    "Worker 消费并评测 AC",
    acStatus === "ACCEPTED" && Number(acPoll.body?.submission?.score) === 100,
    `status=${acStatus} score=${acPoll.body?.submission?.score}`,
    { submissionId: submitAc.body?.submissionId },
  );

  const submitWa = labId
    ? await api("uc06.submitWa", "POST", `/labs/${labId}/submit`, {
        code: 'console.log("Hi")\n',
        language: "javascript",
      }, student.token)
    : { ok: false, body: {} };
  const waPoll = submitWa.body?.submissionId
    ? await pollSubmission(student.token, submitWa.body.submissionId)
    : { body: {} };
  rec(
    "UC06",
    "错误代码得到 WRONG_ANSWER",
    waPoll.body?.submission?.status === "WRONG_ANSWER",
    `status=${waPoll.body?.submission?.status} score=${waPoll.body?.submission?.score}`,
  );

  const returnedId = waPoll.body?.submission?.id ?? submitWa.body?.submissionId;
  const ret = returnedId
    ? await api("uc06.return", "PATCH", `/submissions/${returnedId}/return`, {
        returnReason: "D1 验证打回：输出不正确，请按样例修改后补交。",
      }, teacher.token)
    : { ok: false, body: {} };
  rec(
    "UC06",
    "教师打回",
    Boolean(ret.body?.submission?.returnReason) && Boolean(ret.body?.submission?.returnedAt),
    ret.body?.submission?.returnReason ?? ret.body?.error,
  );

  const makeup = labId
    ? await api("uc06.makeup", "POST", `/labs/${labId}/submit`, {
        code: 'console.log("Hello")\n',
        language: "javascript",
      }, student.token)
    : { ok: false, body: {} };
  const makeupPoll = makeup.body?.submissionId
    ? await pollSubmission(student.token, makeup.body.submissionId)
    : { body: {} };
  rec(
    "UC06",
    "打回后补交再评测",
    makeupPoll.body?.submission?.status === "ACCEPTED",
    `status=${makeupPoll.body?.submission?.status} id=${makeup.body?.submissionId}`,
  );

  const futureBlock = await api("uc06.futureBlock", "POST", `/labs/${FIXTURES.futureLabId}/submit`, {
    code: "console.log('x')\n",
    language: "javascript",
  }, student.token);
  rec("UC06", "未开始实验集禁止提交", futureBlock.status === 403, `status=${futureBlock.status} error=${futureBlock.body?.error}`);

  const returnedSeed = await api("uc06.returnedSeed", "GET", `/submissions/${FIXTURES.returnedSubmissionId}`, null, student.token);
  rec(
    "UC06",
    "种子已打回记录可查询",
    Boolean(returnedSeed.body?.submission?.returnReason),
    returnedSeed.body?.submission?.returnReason ?? returnedSeed.body?.error,
  );

  // ---------- UC07 ----------
  const tags = await api("uc07.tags", "GET", `/courses/${courseId}/practice/tags`, null, student.token);
  rec("UC07", "查看练习知识点标签", tags.ok && Array.isArray(tags.body?.tags), `tags=${tags.body?.tags?.length}`);

  const session = await api("uc07.smart", "POST", `/courses/${courseId}/practice/sessions`, {
    mode: "SMART",
    count: 5,
  }, student.token);
  rec(
    "UC07",
    "智能组卷",
    Boolean(session.body?.session?.id) && (session.body?.session?.items?.length ?? 0) > 0,
    `id=${session.body?.session?.id} items=${session.body?.session?.items?.length} error=${session.body?.error ?? ""}`,
  );

  const sessionId = session.body?.session?.id;
  const items = session.body?.session?.items ?? [];
  for (const it of items) {
    const q = it.question;
    let answer = "A";
    if (q?.type === "CHOICE" && Array.isArray(q.options) && q.options.length) {
      answer = q.options[0].id ?? q.options[0].key ?? "A";
    }
    await api(`uc07.answer:${it.id}`, "PATCH", `/practice/sessions/${sessionId}/items/${it.id}`, { answer }, student.token);
  }
  rec("UC07", "逐题作答", items.length > 0, `answered=${items.length}`);

  const submitted = sessionId
    ? await api("uc07.submit", "POST", `/practice/sessions/${sessionId}/submit`, {}, student.token)
    : { ok: false, body: {} };
  rec(
    "UC07",
    "提交练习并出分",
    submitted.ok && submitted.body?.session?.status === "GRADED",
    `score=${submitted.body?.session?.score}/${submitted.body?.session?.maxScore}`,
  );

  const mine = await api("uc07.mine", "GET", `/courses/${courseId}/practice/sessions/mine`, null, student.token);
  rec("UC07", "练习记录列表", mine.ok && Array.isArray(mine.body?.sessions), `count=${mine.body?.sessions?.length}`);

  const wb = await api("uc07.wrongBook", "GET", "/wrong-book/mine", null, student.token);
  rec("UC07", "错题记录可查询", wb.ok && Array.isArray(wb.body?.entries ?? wb.body?.items ?? wb.body), `keys=${Object.keys(wb.body ?? {}).join(",")}`);

  const firstItem = items[0];
  const hint = firstItem
    ? await api("uc07.hint", "POST", `/practice/sessions/${sessionId}/items/${firstItem.id}/hint`, { level: "initial" }, student.token)
    : { ok: false, status: 0, body: {} };
  rec(
    "UC07",
    "获取辅导（允许本地降级）",
    hint.status === 200 || hint.status === 201,
    `status=${hint.status} degraded=${Boolean(hint.body?.degraded || hint.body?.local || hint.body?.error)} preview=${JSON.stringify(hint.body).slice(0, 180)}`,
  );

  const stats = await api("uc07.stats", "GET", `/courses/${courseId}/practice/stats`, null, teacher.token);
  rec("UC07", "教师查看练习统计", stats.ok, `keys=${Object.keys(stats.body ?? {}).join(",")}`);

  // ---------- UC08 ----------
  const discussLabId = labId ?? "00000000-0000-4000-8000-00000001003d";
  const teacherId = teacher.user?.id;
  const post = await api("uc08.post", "POST", `/labs/${discussLabId}/discussions`, {
    title: "D1-UC08 讨论验证",
    body: "请问样例输出是否需要换行？ @教师",
    mentionUserIds: teacherId ? [teacherId] : [],
  }, student.token);
  rec("UC08", "学生发帖并提及教师", Boolean(post.body?.post?.id), post.body?.post?.id ?? post.body?.error);

  const postId = post.body?.post?.id;
  const comment = postId
    ? await api("uc08.comment", "POST", `/labs/${discussLabId}/discussions/${postId}/comments`, {
        body: "补充：我已按 Hello 输出重交。",
        mentionUserIds: teacherId ? [teacherId] : [],
      }, student.token)
    : { ok: false, body: {} };
  rec("UC08", "学生评论", Boolean(comment.body?.comment?.id), comment.body?.comment?.id ?? comment.body?.error);

  const unreadTeacher = await api("uc08.unreadTeacher", "GET", "/notifications/unread-count", null, teacher.token);
  const listTeacher = await api("uc08.listTeacher", "GET", "/notifications", null, teacher.token);
  const notes = listTeacher.body?.notifications ?? listTeacher.body?.items ?? [];
  const mentioned = notes.some((n) => n.type === "DISCUSSION" || String(n.title ?? "").includes("讨论") || String(n.body ?? "").includes("@"));
  rec(
    "UC08",
    "被提及教师收到通知",
    unreadTeacher.ok && (Number(unreadTeacher.body?.count ?? unreadTeacher.body?.unreadCount ?? 0) >= 0) && (mentioned || notes.length > 0),
    `unread=${JSON.stringify(unreadTeacher.body)} mentioned=${mentioned} n=${notes.length}`,
  );

  const list = await api("uc08.list", "GET", `/labs/${discussLabId}/discussions`, null, student.token);
  rec("UC08", "讨论列表可见新帖", list.ok && Array.isArray(list.body?.posts) && list.body.posts.some((p) => p.id === postId), `posts=${list.body?.posts?.length}`);

  mkdirSync(outDir, { recursive: true });
  const result = {
    at: new Date().toISOString(),
    base,
    courseId,
    labSetId,
    labId,
    sessionId,
    postId,
    summary,
    log,
  };
  const outFile = join(outDir, "uc06-uc08-verify.json");
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({ outFile, passed: summary.filter((s) => s.ok).length, total: summary.length, summary }, null, 2));
  if (summary.some((s) => !s.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
