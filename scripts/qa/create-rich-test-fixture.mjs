import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const baseUrl = (process.env.QA_RICH_BASE_URL ?? "http://127.0.0.1:18080/api").replace(/\/$/, "");
const manifestPath = resolve(process.env.QA_RICH_MANIFEST ?? "test-results/qa-rich-fixture.json");
const password = process.env.QA_RICH_PASSWORD ?? "QaRichFixture2026!";
const runId = `${Date.now()}-${process.pid}`;
const prefix = `QA-RICH-${runId}`;
const teachers = [];
const students = [];
const courses = [];
const summary = { teachers: 0, students: 0, courses: 0, enrollments: 0, announcements: 0, materials: 0, favorites: 0, homework: 0, homeworkSubmissions: 0, homeworkGradesReleased: 0, labSets: 0, labs: 0, testCases: 0, labSubmissions: 0, practiceQuestions: 0, practiceSessions: 0, practiceSessionItems: 0, discussionPosts: 0, discussionComments: 0 };

async function request(method, path, { token, body, form, accepted = [200, 201] } = {}) {
  const headers = { "x-request-id": `${prefix}-${method}-${path.slice(1, 28)}` };
  if (token) headers.authorization = `Bearer ${token}`;
  let requestBody;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(body);
  } else if (form) requestBody = form;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: requestBody });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!accepted.includes(response.status)) {
    throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload;
}

async function register(role, index) {
  const email = `qa-rich-${role.toLowerCase()}-${index}-${runId}@example.test`;
  const result = await request("POST", "/auth/register", {
    body: { email, name: `QA 富集${role === "TEACHER" ? "教师" : "学生"}-${index}`, password, role },
  });
  if (!result?.token || !result?.user?.id) throw new Error(`register ${role} did not return token/user`);
  return { id: result.user.id, email, token: result.token };
}

async function createCourse(index, teacher) {
  const course = await request("POST", "/courses", {
    token: teacher.token,
    body: {
      title: `${prefix}-课程-${index + 1}`,
      description: "由 QA 富集测试种子创建；用于多用户、多课程、作业、实验和讨论回归。",
      category: "QA-RICH",
      courseCode: `QR${runId.slice(-8)}${index}`.slice(0, 32),
      capacity: 40,
      published: true,
      scheduleSlots: [{ dayOfWeek: (index % 5) + 1, periodStart: (index % 2) * 3 + 1, periodEnd: (index % 2) * 3 + 2, room: `QA-${index + 101}` }],
    },
  });
  const id = course?.course?.id;
  if (!id) throw new Error("course creation did not return course.id");
  await request("POST", `/courses/${id}/publish`, { token: teacher.token, accepted: [200, 404] });
  summary.courses += 1;
  return { id, teacher, enrolled: [], index };
}

async function seedCourseData(course) {
  const { id: courseId, teacher, enrolled, index } = course;
  await request("POST", `/courses/${courseId}/announcements`, {
    token: teacher.token,
    body: { title: `${prefix}-公告-${index + 1}`, content: "富集测试公告：请完成作业、实验和练习。", pinned: index % 2 === 0 },
  });
  summary.announcements += 1;

  const form = new FormData();
  form.append("title", `${prefix}-资料-${index + 1}`);
  form.append("visibility", "ALL");
  form.append("file", new Blob([`QA rich material for course ${index + 1}`], { type: "text/plain" }), `qa-rich-${index + 1}.txt`);
  const material = await request("POST", `/courses/${courseId}/materials`, { token: teacher.token, form });
  summary.materials += 1;
  if (material?.material?.id && enrolled[0]) {
    await request("POST", `/materials/${material.material.id}/favorite`, { token: enrolled[0].token });
    summary.favorites += 1;
  }

  const homework = await request("POST", `/courses/${courseId}/homework`, {
    token: teacher.token,
    body: { title: `${prefix}-作业-${index + 1}`, descriptionMd: "请提交富集测试作业答案。", dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), published: true, answerMode: "RICH_TEXT", allowMultipleSubmits: true },
  });
  const homeworkId = homework?.homework?.id;
  if (!homeworkId) throw new Error("homework creation did not return homework.id");
  summary.homework += 1;
  for (const [studentIndex, student] of enrolled.entries()) {
    await request("POST", `/homework/${homeworkId}/submit`, { token: student.token, body: { content: `富集测试作业答案：课程 ${index + 1}，学生 ${studentIndex + 1}` } });
    summary.homeworkSubmissions += 1;
  }
  const submitted = await request("GET", `/homework/${homeworkId}/submissions`, { token: teacher.token });
  for (const [submissionIndex, submission] of (submitted?.submissions ?? []).entries()) {
    await request("PATCH", `/homework/submissions/${submission.id}/grade`, { token: teacher.token, body: { score: 70 + ((submissionIndex + index) % 6) * 5, feedback: "QA 富集测试批改" } });
  }
  await request("PATCH", `/homework/${homeworkId}/release-grades`, { token: teacher.token });
  summary.homeworkGradesReleased += submitted?.submissions?.length ?? 0;

  const labSet = await request("POST", `/courses/${courseId}/lab-sets`, {
    token: teacher.token,
    body: { title: `${prefix}-实验集-${index + 1}`, description: "富集测试实验集", startAt: new Date(Date.now() - 86_400_000).toISOString(), dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), outsideAccessMode: "BLOCK" },
  });
  const labSetId = labSet?.labSet?.id;
  if (!labSetId) throw new Error("lab-set creation did not return labSet.id");
  await request("PATCH", `/courses/${courseId}/lab-sets/${labSetId}`, { token: teacher.token, body: { judgeMode: "MANUAL", allowedLanguages: ["javascript"] } });
  summary.labSets += 1;
  const lab = await request("POST", `/courses/${courseId}/labs`, {
    token: teacher.token,
    body: { title: `${prefix}-实验-${index + 1}`, descriptionMd: "将标准输入原样输出。", language: "javascript", starterCode: "process.stdin.pipe(process.stdout);", labSetId },
  });
  const labId = lab?.lab?.id;
  if (!labId) throw new Error("lab creation did not return lab.id");
  summary.labs += 1;
  const cases = ["hello", "qa rich", "42"].map((input, caseIndex) => ({ input, expected: input, hidden: caseIndex > 0, weight: caseIndex + 1 }));
  const caseResult = await request("POST", `/labs/${labId}/testcases/batch`, { token: teacher.token, body: { testCases: cases } });
  summary.testCases += caseResult?.count ?? cases.length;
  for (const student of enrolled) {
    await request("POST", `/labs/${labId}/submit`, { token: student.token, body: { code: "process.stdin.pipe(process.stdout);", language: "javascript" } });
    summary.labSubmissions += 1;
  }

  for (let questionIndex = 0; questionIndex < 4; questionIndex++) {
    await request("POST", `/courses/${courseId}/practice/questions`, {
      token: teacher.token,
      body: { type: "FILL", stem: `${prefix} 练习 ${index + 1}-${questionIndex + 1}：42 = ?`, answer: "42", explanation: "统一测试答案", tagPath: `QA-RICH/课程${index + 1}`, difficulty: questionIndex % 2 ? "MEDIUM" : "EASY" },
    });
    summary.practiceQuestions += 1;
  }
  for (const [studentIndex, student] of enrolled.slice(0, 3).entries()) {
    const session = await request("POST", `/courses/${courseId}/practice/sessions`, { token: student.token, body: { mode: "SMART", count: 3 } });
    const sessionId = session?.session?.id;
    if (!sessionId) throw new Error("practice session did not return session.id");
    summary.practiceSessions += 1;
    for (const [itemIndex, item] of (session.session.items ?? []).entries()) {
      const answer = studentIndex === 0 && itemIndex === 0 ? "41" : "42";
      await request("PATCH", `/practice/sessions/${sessionId}/items/${item.id}`, { token: student.token, body: { answer, timeSpentMs: 20 + itemIndex } });
      summary.practiceSessionItems += 1;
    }
    await request("POST", `/practice/sessions/${sessionId}/submit`, { token: student.token });
  }

  for (let postIndex = 0; postIndex < 2; postIndex++) {
    const author = enrolled[postIndex % enrolled.length];
    const post = await request("POST", `/labs/${labId}/discussions`, {
      token: author.token,
      body: { title: `${prefix}-讨论-${index + 1}-${postIndex + 1}`, body: "这是由 QA 富集种子生成的讨论，用于列表、详情、回复与通知测试。", mentionUserIds: [teacher.id], anonymous: postIndex % 2 === 1 },
    });
    const postId = post?.post?.id;
    if (!postId) throw new Error("discussion creation did not return post.id");
    summary.discussionPosts += 1;
    await request("POST", `/labs/${labId}/discussions/${postId}/comments`, { token: teacher.token, body: { body: "QA 教师回复：请参考实验说明。", mentionUserIds: [author.id] } });
    summary.discussionComments += 1;
  }

  return { courseId, homeworkId, labSetId, labId, studentCount: enrolled.length };
}

await request("GET", "/health/ready", { accepted: [200] });
for (let index = 0; index < 3; index++) teachers.push(await register("TEACHER", index + 1));
for (let index = 0; index < 18; index++) students.push(await register("STUDENT", index + 1));
summary.teachers = teachers.length;
summary.students = students.length;
for (let index = 0; index < 6; index++) courses.push(await createCourse(index, teachers[index % teachers.length]));

for (const [studentIndex, student] of students.entries()) {
  const courseIndexes = [studentIndex % courses.length, (studentIndex + 2) % courses.length];
  for (const courseIndex of courseIndexes) {
    const course = courses[courseIndex];
    await request("POST", `/enrollment/courses/${course.id}/enroll`, { token: student.token });
    course.enrolled.push(student);
    summary.enrollments += 1;
  }
}

const resources = [];
for (const course of courses) resources.push(await seedCourseData(course));
const manifest = {
  createdAt: new Date().toISOString(),
  environment: "microservices-kubernetes",
  datasetId: prefix,
  baseUrl,
  summary,
  resources,
  accounts: { teachers: teachers.map(({ id, email }) => ({ id, email })), students: students.map(({ id, email }) => ({ id, email })) },
  cleanup: "Retained as an isolated QA-RICH fixture. Remove only with a reviewed cleanup operation; no existing data was deleted.",
};
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ datasetId: manifest.datasetId, summary: manifest.summary, resources: manifest.resources.length }, null, 2));
