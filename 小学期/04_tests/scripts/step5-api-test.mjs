import { FIXTURES } from "./test-fixtures.mjs";

const base = "http://127.0.0.1:3000";
const R = [];

async function api(name, m, p, body, t) {
  const h = {};
  if (t) h.Authorization = "Bearer " + t;
  let b;
  if (body != null) {
    h["Content-Type"] = "application/json";
    b = JSON.stringify(body);
  }
  const r = await fetch(base + p, { method: m, headers: h, body: b });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = text;
  }
  R.push({ name, status: r.status, j });
  return { status: r.status, j };
}

async function login(email) {
  return (await api("login", "POST", "/auth/login", { email, password: "Demo123456" })).j.token;
}

const st = await login("student@demo.local");
const tt = await login("teacher@demo.local");
const ad = await login("admin@demo.local");
const courseId = FIXTURES.courseId;

await api("TC-HW-006-mine", "GET", "/homework/mine", null, st);
await api("TC-HW-001-teaching", "GET", "/homework/teaching", null, tt);
await api("TC-HW-003-list", "GET", `/courses/${courseId}/homework`, null, st);
await api("TC-LAB-001-overview", "GET", "/lab-sets/mine/overview", null, st);
await api("TC-LAB-002-labsets", "GET", `/courses/${courseId}/lab-sets`, null, st);

let labId = null;
const lsResp = R.at(-1).j;
const sets = lsResp.labSets || [];
if (sets.length) {
  const setId = sets[0].id;
  const setDetail = await api("set-detail", "GET", `/courses/${courseId}/lab-sets/${setId}`, null, st);
  const labs = setDetail.j.labs || setDetail.j.labSet?.labs || [];
  if (labs.length) labId = labs[0].id;
}
if (!labId) {
  const course = await api("course-detail", "GET", `/courses/${courseId}`, null, st);
  labId = course.j.course?.labs?.[0]?.id;
}

let labFinalStatus = null;
if (labId) {
  const sub = await api("TC-LAB-003-submit", "POST", `/labs/${labId}/submit`, {
    code: "print('hello')",
    language: "python",
  }, st);
  const sid = sub.j.submissionId;
  if (sid) {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await api(`poll-${i}`, "GET", `/submissions/${sid}`, null, st);
      labFinalStatus = poll.j.submission?.status || poll.j.status;
      if (labFinalStatus && labFinalStatus !== "PENDING" && labFinalStatus !== "JUDGING") break;
    }
  }
}

await api("TC-PRACTICE-tags", "GET", `/courses/${courseId}/practice/tags`, null, st);
const sess = await api("TC-PRACTICE-001", "POST", `/courses/${courseId}/practice/sessions`, {
  mode: "SMART",
  count: 5,
}, st);
const sessionId = sess.j.session?.id;
let practiceScore = null;
if (sessionId) {
  const sget = await api("session-get", "GET", `/practice/sessions/${sessionId}`, null, st);
  const items = sget.j.session?.items || [];
  for (const it of items) {
    const q = it.question;
    let ans = "A";
    if (q?.type === "CHOICE" && q.options?.length) ans = q.options[0].key ?? q.options[0].label ?? "A";
    else if (q?.answerJson) {
      try {
        ans = JSON.parse(q.answerJson);
      } catch {
        ans = q.answerJson;
      }
    }
    await api(`answer-${it.id}`, "PATCH", `/practice/sessions/${sessionId}/items/${it.id}`, { answer: ans }, st);
  }
  const submitted = await api("TC-PRACTICE-002", "POST", `/practice/sessions/${sessionId}/submit`, {}, st);
  practiceScore = submitted.j.session?.score ?? submitted.j.score;
}

await api("TC-PRACTICE-004", "GET", `/courses/${courseId}/practice/questions`, null, tt);
await api("TC-NOTIFY-001", "GET", "/notifications/unread-count", null, st);
await api("TC-NOTIFY-002", "GET", "/notifications", null, st);

const hwList = (await api("hw-list2", "GET", `/courses/${courseId}/homework`, null, st)).j;
const hw = (hwList.homeworks || [])[0];
if (hw) {
  await api("hw-status", "GET", `/homework/${hw.id}/my-status`, null, st);
  await api("TC-HW-002-draft", "PUT", `/homework/${hw.id}/draft`, { content: "步骤5测试草稿" }, st);
}

// --- 跳过用例 fixture（seed-skipped-test-cases）---
await api("TC-ENROLL-005-catalog", "GET", "/enrollment/catalog?courseCode=CS901", null, st);
await api("TC-ENROLL-005-enroll", "POST", `/enrollment/courses/${FIXTURES.fullCourseId}/enroll`, {}, st);
await api("TC-ENROLL-005-waitlist", "POST", `/enrollment/courses/${FIXTURES.fullCourseId}/waitlist`, {}, st);
const periodSnap = (await api("period-get", "GET", "/enrollment/period", null, ad)).j?.period;
if (periodSnap) {
  await api("TC-ENROLL-006-close", "PUT", "/enrollment/period", {
    phase: "CLOSED",
    openAt: periodSnap.openAt,
    closeAt: periodSnap.closeAt,
    confirmDeadline: periodSnap.confirmDeadline,
  }, ad);
  await api(
    "TC-ENROLL-006-enroll",
    "POST",
    `/enrollment/courses/${FIXTURES.closedWindowCourseId}/enroll`,
    {},
    st,
  );
  await api("TC-ENROLL-006-reopen", "PUT", "/enrollment/period", {
    phase: periodSnap.phase === "CLOSED" ? "FORMAL" : periodSnap.phase,
    openAt: periodSnap.openAt,
    closeAt: periodSnap.closeAt,
    confirmDeadline: periodSnap.confirmDeadline,
  }, ad);
}
const lateSub = await api(
  "TC-HW-004-submit",
  "POST",
  `/homework/${FIXTURES.lateHomeworkId}/submit`,
  { content: "步骤5 TC-HW-004 迟交测试提交。" },
  st,
);
const redoReq = await api(
  "TC-HW-005-request",
  "POST",
  `/homework/${FIXTURES.redoHomeworkId}/redo-request`,
  { reason: "步骤5重做测试" },
  st,
);
if (redoReq.j?.request?.id) {
  await api(
    "TC-HW-005-approve",
    "PATCH",
    `/homework/redo-requests/${redoReq.j.request.id}`,
    { action: "approve" },
    tt,
  );
}
await api("TC-LAB-002-overview", "GET", "/lab-sets/mine/overview", null, st);
await api(
  "TC-LAB-002-submit-block",
  "POST",
  `/labs/${FIXTURES.futureLabId}/submit`,
  { code: "console.log('x')\n", language: "javascript" },
  st,
);
await api("TC-LAB-007", "GET", `/submissions/${FIXTURES.returnedSubmissionId}`, null, st);

console.log(JSON.stringify({
  results: R.map((x) => ({ name: x.name, status: x.status, preview: JSON.stringify(x.j).slice(0, 300) })),
  meta: {
    labId,
    labFinalStatus,
    sessionId,
    practiceScore,
    homeworkId: hw?.id,
    lateIsLate: lateSub.j?.submission?.isLate,
    redoRequestId: redoReq.j?.request?.id,
  },
}, null, 2));
