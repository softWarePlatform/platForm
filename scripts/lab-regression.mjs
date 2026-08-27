/**
 * UC06—UC08 可重复回归（D3）。
 * 运行：npm run test:lab
 * 依赖：API :3000、PostgreSQL、Redis、judge-worker。只测 JavaScript，不改选课期。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURES } from "./test-fixtures.mjs";

const base = process.env.API_BASE ?? process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const courseId = FIXTURES.courseId;
const stamp = `D3-${Date.now()}`;
const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "吴本昭",
  "2026-8-27",
  "raw",
);

const log = [];
const summary = [];
const created = { labSetIds: [], postIds: [] };

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

function discussionNotes(listBody) {
  const notes = listBody?.notifications ?? listBody?.items ?? [];
  return Array.isArray(notes) ? notes : [];
}

async function createJsLab(teacherToken, title, times) {
  const createdSet = await api(
    `createSet:${title}`,
    "POST",
    `/courses/${courseId}/lab-sets`,
    {
      title,
      description: "吴本昭 D3 回归，可删除。",
      ...times,
    },
    teacherToken,
  );
  const labSetId = createdSet.body?.labSet?.id;
  if (labSetId) created.labSetIds.push(labSetId);
  rec("UC06", `发布实验集 ${title}`, createdSet.status === 201 && Boolean(labSetId), labSetId ?? createdSet.body?.error);

  const createdLab = labSetId
    ? await api(
        `createLab:${title}`,
        "POST",
        `/courses/${courseId}/labs`,
        {
          title: `${title}-Hello-JS`,
          description: "输出 Hello",
          language: "javascript",
          starterCode: 'console.log("Hello")\n',
          labSetId,
        },
        teacherToken,
      )
    : { body: {} };
  const labId = createdLab.body?.lab?.id;
  rec("UC06", `创建题目 ${title}`, Boolean(labId), labId ?? createdLab.body?.error);

  if (labId) {
    const tc = await api(
      `testcase:${title}`,
      "POST",
      `/labs/${labId}/testcases`,
      { input: "", expected: "Hello", hidden: false, weight: 1 },
      teacherToken,
    );
    rec("UC06", `配置公开用例 ${title}`, Boolean(tc.body?.testCase?.id), tc.body?.testCase?.id ?? tc.body?.error);
  }
  return { labSetId, labId };
}

async function cleanup(teacherToken, studentToken, discussLabId) {
  for (const postId of created.postIds) {
    if (!postId || !discussLabId) continue;
    await api(`cleanup.post:${postId}`, "DELETE", `/labs/${discussLabId}/discussions/${postId}`, null, studentToken);
  }
  for (const labSetId of created.labSetIds) {
    await api(
      `cleanup.labSet:${labSetId}`,
      "DELETE",
      `/courses/${courseId}/lab-sets/${labSetId}?force=1`,
      null,
      teacherToken,
    );
  }
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
    throw new Error("登录失败，中止回归");
  }

  const now = Date.now();
  const { labSetId, labId } = await createJsLab(teacher.token, `${stamp}-评测`, {
    startAt: new Date(now - 60_000).toISOString(),
    dueAt: new Date(now + 7 * 24 * 3600_000).toISOString(),
    allowMakeup: true,
    makeupDueAt: new Date(now + 10 * 24 * 3600_000).toISOString(),
  });

  if (labId) {
    const hidden = await api(
      "uc06.hiddenTc",
      "POST",
      `/labs/${labId}/testcases`,
      { input: "secret", expected: "Hello", hidden: true, weight: 1 },
      teacher.token,
    );
    const hiddenId = hidden.body?.testCase?.id;
    rec("UC06", "教师配置隐藏用例", Boolean(hiddenId), hiddenId ?? hidden.body?.error);

    const studentLab = await api("uc06.studentLab", "GET", `/labs/${labId}`, null, student.token);
    const studentCases = studentLab.body?.lab?.testCases ?? [];
    rec(
      "UC06",
      "学生对隐藏用例不可见",
      studentLab.ok && !studentCases.some((tc) => tc.id === hiddenId || tc.input === "secret"),
      `studentCaseCount=${studentCases.length} hiddenId=${hiddenId}`,
    );
  }

  const submitAc = labId
    ? await api("uc06.submitAc", "POST", `/labs/${labId}/submit`, {
        code: 'console.log("Hello")\n',
        language: "javascript",
      }, student.token)
    : { body: {} };
  rec("UC06", "学生提交正确代码入队", Boolean(submitAc.body?.submissionId), `status=${submitAc.body?.status} id=${submitAc.body?.submissionId ?? submitAc.body?.error}`);

  const acPoll = submitAc.body?.submissionId
    ? await pollSubmission(student.token, submitAc.body.submissionId)
    : { body: {} };
  rec(
    "UC06",
    "Worker 评测 ACCEPTED",
    acPoll.body?.submission?.status === "ACCEPTED" && Number(acPoll.body?.submission?.score) === 100,
    `status=${acPoll.body?.submission?.status} score=${acPoll.body?.submission?.score}`,
    { submissionId: submitAc.body?.submissionId },
  );

  const submitWa = labId
    ? await api("uc06.submitWa", "POST", `/labs/${labId}/submit`, {
        code: 'console.log("Hi")\n',
        language: "javascript",
      }, student.token)
    : { body: {} };
  const waPoll = submitWa.body?.submissionId
    ? await pollSubmission(student.token, submitWa.body.submissionId)
    : { body: {} };
  rec(
    "UC06",
    "错误代码 WRONG_ANSWER",
    waPoll.body?.submission?.status === "WRONG_ANSWER",
    `status=${waPoll.body?.submission?.status} score=${waPoll.body?.submission?.score}`,
  );

  const returnedId = waPoll.body?.submission?.id ?? submitWa.body?.submissionId;
  const ret = returnedId
    ? await api("uc06.return", "PATCH", `/submissions/${returnedId}/return`, {
        returnReason: `${stamp} 打回补交`,
      }, teacher.token)
    : { body: {} };
  rec(
    "UC06",
    "教师打回",
    Boolean(ret.body?.submission?.returnReason) && Boolean(ret.body?.submission?.returnedAt),
    ret.body?.submission?.returnReason ?? ret.body?.error,
  );

  const makeupResubmit = labId
    ? await api("uc06.resubmit", "POST", `/labs/${labId}/submit`, {
        code: 'console.log("Hello")\n',
        language: "javascript",
      }, student.token)
    : { body: {} };
  const makeupPoll = makeupResubmit.body?.submissionId
    ? await pollSubmission(student.token, makeupResubmit.body.submissionId)
    : { body: {} };
  rec(
    "UC06",
    "打回后补交 ACCEPTED",
    makeupPoll.body?.submission?.status === "ACCEPTED",
    `status=${makeupPoll.body?.submission?.status} id=${makeupResubmit.body?.submissionId}`,
  );

  const futureBlock = await api("uc06.futureBlock", "POST", `/labs/${FIXTURES.futureLabId}/submit`, {
    code: "console.log('x')\n",
    language: "javascript",
  }, student.token);
  rec("UC06", "未开始窗口禁止提交", futureBlock.status === 403, `status=${futureBlock.status} error=${futureBlock.body?.error}`);

  const makeupSet = await createJsLab(teacher.token, `${stamp}-补交窗`, {
    startAt: new Date(now - 2 * 24 * 3600_000).toISOString(),
    dueAt: new Date(now - 60_000).toISOString(),
    allowMakeup: true,
    makeupDueAt: new Date(now + 24 * 3600_000).toISOString(),
  });
  const makeupSubmit = makeupSet.labId
    ? await api("uc06.makeupWindow", "POST", `/labs/${makeupSet.labId}/submit`, {
        code: 'console.log("Hello")\n',
        language: "javascript",
      }, student.token)
    : { status: 0, body: {} };
  rec(
    "UC06",
    "补交时间窗内可提交",
    makeupSubmit.status === 200 && Boolean(makeupSubmit.body?.submissionId),
    `status=${makeupSubmit.status} id=${makeupSubmit.body?.submissionId ?? makeupSubmit.body?.error}`,
  );
  if (makeupSubmit.body?.submissionId) {
    const makeupWinPoll = await pollSubmission(student.token, makeupSubmit.body.submissionId);
    rec(
      "UC06",
      "补交窗提交被 Worker 评测",
      makeupWinPoll.body?.submission?.status === "ACCEPTED",
      `status=${makeupWinPoll.body?.submission?.status}`,
    );
  }

  const tags = await api("uc07.tags", "GET", `/courses/${courseId}/practice/tags`, null, student.token);
  const tagList = Array.isArray(tags.body?.tags) ? tags.body.tags : [];
  rec("UC07", "查看练习知识点标签", tags.ok && tagList.length > 0, `tags=${tagList.length}`);

  const session = await api("uc07.smart", "POST", `/courses/${courseId}/practice/sessions`, {
    mode: "SMART",
    count: 5,
  }, student.token);
  const items = session.body?.session?.items ?? [];
  rec(
    "UC07",
    "SMART 组卷固定 10 题",
    Boolean(session.body?.session?.id) && items.length === 10,
    `id=${session.body?.session?.id} items=${items.length} error=${session.body?.error ?? ""}`,
  );

  const sessionId = session.body?.session?.id;
  for (const it of items) {
    await api(`uc07.answer:${it.id}`, "PATCH", `/practice/sessions/${sessionId}/items/${it.id}`, {
      answer: "__not_a_choice__",
    }, student.token);
  }
  rec("UC07", "逐题作答（故意答错）", items.length === 10, `answered=${items.length}`);

  const submitted = sessionId
    ? await api("uc07.submit", "POST", `/practice/sessions/${sessionId}/submit`, {}, student.token)
    : { ok: false, body: {} };
  rec(
    "UC07",
    "提交练习并出分",
    submitted.ok && submitted.body?.session?.status === "GRADED",
    `status=${submitted.body?.session?.status} score=${submitted.body?.session?.score}/${submitted.body?.session?.maxScore}`,
  );

  const wb = await api("uc07.wrongBook", "GET", "/wrong-book/mine", null, student.token);
  const entries = wb.body?.entries ?? wb.body?.items ?? [];
  rec(
    "UC07",
    "错题本有记录",
    wb.ok && Array.isArray(entries) && entries.length > 0,
    `count=${Array.isArray(entries) ? entries.length : 0}`,
  );

  const firstItem = items[0];
  const hint = firstItem
    ? await api("uc07.hint", "POST", `/practice/sessions/${sessionId}/items/${firstItem.id}/hint`, { level: "initial" }, student.token)
    : { status: 0, body: {} };
  rec("UC07", "辅导接口 HTTP 200（允许本地模板）", hint.status === 200, `status=${hint.status}`);

  const stats = await api("uc07.stats", "GET", `/courses/${courseId}/practice/stats`, null, teacher.token);
  rec("UC07", "教师查看练习统计", stats.ok, `keys=${Object.keys(stats.body ?? {}).join(",")}`);

  const qs = await api("uc07.questions", "GET", `/courses/${courseId}/practice/questions`, null, student.token);
  const questionTags = [...new Set((qs.body?.questions ?? []).map((q) => q.tagPath).filter(Boolean))];
  const tagPath = questionTags[0] ?? (typeof tagList[0] === "string" ? tagList[0] : tagList[0]?.tagPath);
  if (tagPath) {
    const byTag = await api("uc07.byTag", "POST", `/courses/${courseId}/practice/sessions`, {
      mode: "BY_TAG",
      tags: [tagPath],
      tagMode: "INCLUDE_ANY",
      count: 3,
    }, student.token);
    rec(
      "UC07",
      "按标签组卷",
      Boolean(byTag.body?.session?.id) && (byTag.body?.session?.items?.length ?? 0) > 0,
      `tag=${tagPath} id=${byTag.body?.session?.id} items=${byTag.body?.session?.items?.length} error=${byTag.body?.error ?? ""}`,
    );
  }

  const discussLabId = labId ?? FIXTURES.returnedLabId;
  const teacherId = teacher.user?.id;
  const studentId = student.user?.id;

  const post = await api("uc08.post", "POST", `/labs/${discussLabId}/discussions`, {
    title: `${stamp} 讨论验证`,
    body: "请问样例输出是否需要换行？",
    mentionUserIds: teacherId ? [teacherId] : [],
  }, student.token);
  const postId = post.body?.post?.id;
  if (postId) created.postIds.push(postId);
  rec("UC08", "学生发帖并提及教师", Boolean(postId), postId ?? post.body?.error);

  const comment = postId
    ? await api("uc08.comment", "POST", `/labs/${discussLabId}/discussions/${postId}/comments`, {
        body: "补充：按 Hello 输出重交。",
      }, student.token)
    : { body: {} };
  rec("UC08", "学生评论", Boolean(comment.body?.comment?.id), comment.body?.comment?.id ?? comment.body?.error);

  const afterTeacher = discussionNotes(
    (await api("uc08.listTeacherAfter", "GET", "/notifications?pageSize=50", null, teacher.token)).body,
  );
  const mentioned = afterTeacher.some(
    (n) => n.type === "DISCUSSION" && String(n.title ?? "").includes(`${stamp} 讨论验证`),
  );
  rec("UC08", "被提及教师收到 DISCUSSION 通知", mentioned, `matched=${mentioned} n=${afterTeacher.length}`);

  const selfPost = await api("uc08.selfMention", "POST", `/labs/${discussLabId}/discussions`, {
    title: `${stamp} 自提及`,
    body: "自己 @ 自己不应产生通知",
    mentionUserIds: studentId ? [studentId] : [],
  }, student.token);
  const selfPostId = selfPost.body?.post?.id;
  if (selfPostId) created.postIds.push(selfPostId);
  rec("UC08", "发帖提及自己（请求成功）", Boolean(selfPostId), selfPostId ?? selfPost.body?.error);

  const afterSelf = discussionNotes(
    (await api("uc08.listStudentAfter", "GET", "/notifications?pageSize=50", null, student.token)).body,
  );
  const selfNotified = afterSelf.some(
    (n) => n.type === "DISCUSSION" && String(n.title ?? "").includes(`${stamp} 自提及`),
  );
  rec("UC08", "提及自己不产生 DISCUSSION 通知", !selfNotified, `selfNotified=${selfNotified}`);

  const list = await api("uc08.list", "GET", `/labs/${discussLabId}/discussions`, null, student.token);
  rec(
    "UC08",
    "讨论列表可见新帖",
    list.ok && Array.isArray(list.body?.posts) && list.body.posts.some((p) => p.id === postId),
    `posts=${list.body?.posts?.length}`,
  );

  await cleanup(teacher.token, student.token, discussLabId);

  mkdirSync(outDir, { recursive: true });
  const result = {
    at: new Date().toISOString(),
    stamp,
    base,
    courseId,
    labSetId,
    labId,
    sessionId,
    postId,
    passed: summary.filter((s) => s.ok).length,
    total: summary.length,
    summary,
    log,
  };
  const outFile = join(outDir, "lab-regression.json");
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({ outFile, passed: result.passed, total: result.total, summary }, null, 2));
  if (summary.some((s) => !s.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
