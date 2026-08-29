/**
 * 为测试报告中「跳过」用例预置固定 ID 的演示数据（TC-ENROLL-005/006、TC-HW-004/005、TC-LAB-002/007）。
 */
import type { PrismaClient } from "@prisma/client";

type EnsureFile = (rel: string, content: string) => Promise<void>;

export const SKIPPED_TEST_FIXTURE_IDS = {
  /** TC-ENROLL-005 已满课程 CS901 */
  FULL_COURSE_ID: "00000000-0000-4000-8000-000000090001",
  FULL_COURSE_CLASS_ID: "00000000-0000-4000-8000-000000090002",
  /** TC-ENROLL-006 窗口关闭后尝试选课的目标课 CS903 */
  CLOSED_WINDOW_TARGET_COURSE_ID: "00000000-0000-4000-8000-000000090030",
  CLOSED_WINDOW_PERIOD_ID: "00000000-0000-4000-8000-000000090031",
  /** TC-HW-004 已截止且允许迟交 */
  LATE_HOMEWORK_ID: "00000000-0000-4000-8000-000000090010",
  /** TC-HW-005 允许重做 */
  REDO_HOMEWORK_ID: "00000000-0000-4000-8000-000000090011",
  REDO_SUBMISSION_ID: "00000000-0000-4000-8000-000000090012",
  /** TC-LAB-002 未开始实验集 */
  FUTURE_LAB_SET_ID: "00000000-0000-4000-8000-000000090020",
  FUTURE_LAB_ID: "00000000-0000-4000-8000-000000090021",
  /** TC-LAB-007 已打回实验提交 */
  RETURNED_LAB_SET_ID: "00000000-0000-4000-8000-000000090022",
  RETURNED_LAB_ID: "00000000-0000-4000-8000-000000090023",
  RETURNED_SUBMISSION_ID: "00000000-0000-4000-8000-000000090024",
} as const;

type CourseRef = { id: string; teacherId: string; classId: string; code: string };
type UserRef = { id: string; email: string; name: string };

export async function seedSkippedTestCases(
  prisma: PrismaClient,
  opts: {
    ensureFile: EnsureFile;
    now: number;
    D: number;
    H: number;
    semesterKey: string;
    semesterLabel: string;
    cs101: CourseRef;
    students: UserRef[];
    teachers: { id: string }[];
  },
) {
  const { ensureFile, now, D, H, semesterKey, semesterLabel, cs101, students, teachers } = opts;
  const teacher = teachers[0];
  const demoStudent = students[0];

  // --- TC-ENROLL-005：已满课程 CS901（capacity=2，已选 2 人）---
  await prisma.course.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.FULL_COURSE_ID,
      title: "TC-ENROLL-005 已满课程测试",
      description: "容量 2，已预置 2 名选课学生；student@demo.local 未选，用于测已满/候补。",
      category: "程序设计",
      teacherId: teacher.id,
      published: true,
      labWeight: 0.5,
      homeworkWeight: 0.5,
      courseCode: "CS901",
      credits: 1,
      capacity: 2,
      semesterKey,
      courseNature: "ELECTIVE",
      subjectCategory: "CORE_MAJOR",
      offeringCollegeCode: "21",
      scheduleSlotsJson: JSON.stringify([
        { dayOfWeek: 6, periodStart: 7, periodEnd: 8, room: "测试楼 T901" },
      ]),
      startAt: new Date(now - 7 * D),
      endAt: new Date(now + 90 * D),
    },
  });
  await prisma.class.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.FULL_COURSE_CLASS_ID,
      courseId: SKIPPED_TEST_FIXTURE_IDS.FULL_COURSE_ID,
      name: "CS901 默认班",
    },
  });
  const fullEnrolled = [students[18], students[19]];
  for (const stu of fullEnrolled) {
    await prisma.enrollment.create({
      data: {
        userId: stu.id,
        courseId: SKIPPED_TEST_FIXTURE_IDS.FULL_COURSE_ID,
        classId: SKIPPED_TEST_FIXTURE_IDS.FULL_COURSE_CLASS_ID,
      },
    });
  }

  // --- TC-ENROLL-006：窗口关闭测试目标课 + 历史关闭学期记录 ---
  await prisma.course.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.CLOSED_WINDOW_TARGET_COURSE_ID,
      title: "TC-ENROLL-006 窗口关闭选课测试",
      description:
        "当前学期未选；管理员将选课窗口设为 CLOSED 后，student 尝试 POST enroll 应返回 403。",
      category: "通识",
      teacherId: teacher.id,
      published: true,
      courseCode: "CS903",
      credits: 1,
      capacity: 30,
      semesterKey,
      courseNature: "ELECTIVE",
      subjectCategory: "GENERAL_MAJOR",
      offeringCollegeCode: "21",
      scheduleSlotsJson: JSON.stringify([
        { dayOfWeek: 7, periodStart: 9, periodEnd: 10, room: "测试楼 T903" },
      ]),
      startAt: new Date(now - 7 * D),
      endAt: new Date(now + 90 * D),
    },
  });
  await prisma.enrollmentPeriod.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.CLOSED_WINDOW_PERIOD_ID,
      semesterKey: "2025-fall",
      label: "2025-2026 秋季学期（已关闭·归档）",
      phase: "CLOSED",
      openAt: new Date(now - 400 * D),
      closeAt: new Date(now - 200 * D),
      confirmDeadline: new Date(now - 180 * D),
    },
  });

  // --- TC-HW-004：已截止 + allowLate=true，demo 学生未提交 ---
  await prisma.homework.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.LATE_HOMEWORK_ID,
      courseId: cs101.id,
      title: "TC-HW-004 迟交测试作业",
      description: "截止日已过，允许迟交 7 天；用于验证迟交标注与扣分。",
      descriptionMd: "## TC-HW-004\n\n截止后提交，应标记迟交。",
      dueAt: new Date(now - 5 * D),
      published: true,
      publishedAt: new Date(now - 20 * D),
      allowLate: true,
      latePenaltyPercentPerDay: 10,
      lateMaxDays: 7,
      answerMode: "RICH_TEXT",
    },
  });

  // --- TC-HW-005：allowRedo=true，demo 学生已提交锁定且已发布成绩 ---
  await prisma.homework.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.REDO_HOMEWORK_ID,
      courseId: cs101.id,
      title: "TC-HW-005 重做测试作业",
      description: "允许重做 3 次；张三已提交并锁定，可申请重做。",
      descriptionMd: "## TC-HW-005\n\n已批改锁定，可申请重做。",
      dueAt: new Date(now + 14 * D),
      published: true,
      publishedAt: new Date(now - 3 * D),
      allowRedo: true,
      maxRedoCount: 3,
      answerMode: "RICH_TEXT",
    },
  });
  await prisma.homeworkSubmission.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.REDO_SUBMISSION_ID,
      homeworkId: SKIPPED_TEST_FIXTURE_IDS.REDO_HOMEWORK_ID,
      userId: demoStudent.id,
      content: "TC-HW-005 演示提交：程序设计基础学习体会（待重做测试）。",
      score: 72,
      feedback: "可补充实验细节后申请重做。",
      graded: true,
      released: true,
      releasedAt: new Date(now - 2 * D),
      locked: true,
      submittedAt: new Date(now - 4 * D),
    },
  });

  // --- TC-LAB-002：未开始实验集（startAt 在未来）---
  await prisma.labSet.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.FUTURE_LAB_SET_ID,
      courseId: cs101.id,
      title: "第4周 未开始实验（TC-LAB-002）",
      description: "startAt 在未来，学生端应显示「未开始」且不可提交。",
      startAt: new Date(now + 14 * D),
      dueAt: new Date(now + 30 * D),
      allowMakeup: false,
      outsideAccessMode: "BLOCK",
      judgeMode: "AUTO",
      allowedLanguages: ["javascript"],
      allowedFileExtensions: [".js"],
      sortOrder: 99,
    },
  });
  await prisma.lab.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.FUTURE_LAB_ID,
      courseId: cs101.id,
      labSetId: SKIPPED_TEST_FIXTURE_IDS.FUTURE_LAB_SET_ID,
      title: "TC-LAB-002 未开始实验题",
      description: "实验集未开始时不可提交。",
      language: "javascript",
      starterCode: 'console.log("pending")\n',
    },
  });
  await prisma.testCase.create({
    data: {
      labId: SKIPPED_TEST_FIXTURE_IDS.FUTURE_LAB_ID,
      input: "",
      expected: "pending",
      hidden: false,
      weight: 1,
    },
  });

  // --- TC-LAB-007：已打回实验提交 ---
  await prisma.labSet.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.RETURNED_LAB_SET_ID,
      courseId: cs101.id,
      title: "打回测试实验集（TC-LAB-007）",
      description: "含张三已打回的实验提交。",
      startAt: new Date(now - 5 * D),
      dueAt: new Date(now + 20 * D),
      allowMakeup: true,
      makeupDueAt: new Date(now + 30 * D),
      outsideAccessMode: "BLOCK",
      judgeMode: "AUTO",
      allowedLanguages: ["javascript"],
      allowedFileExtensions: [".js"],
      sortOrder: 100,
    },
  });
  await prisma.lab.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.RETURNED_LAB_ID,
      courseId: cs101.id,
      labSetId: SKIPPED_TEST_FIXTURE_IDS.RETURNED_LAB_SET_ID,
      title: "TC-LAB-007 打回测试题",
      description: "张三提交已被教师打回，需修改后重交。",
      language: "javascript",
      starterCode: 'console.log("Hello")\n',
    },
  });
  await prisma.testCase.create({
    data: {
      labId: SKIPPED_TEST_FIXTURE_IDS.RETURNED_LAB_ID,
      input: "",
      expected: "Hello",
      hidden: false,
      weight: 1,
    },
  });
  const returnedCode = 'console.log("Hell")\n';
  const returnedFilePath = `submissions/${SKIPPED_TEST_FIXTURE_IDS.RETURNED_SUBMISSION_ID}/main.js`;
  await ensureFile(returnedFilePath, returnedCode);
  await prisma.submission.create({
    data: {
      id: SKIPPED_TEST_FIXTURE_IDS.RETURNED_SUBMISSION_ID,
      labId: SKIPPED_TEST_FIXTURE_IDS.RETURNED_LAB_ID,
      userId: demoStudent.id,
      submissionKind: "CODE",
      language: "javascript",
      code: returnedCode,
      status: "WRONG_ANSWER",
      score: 0,
      teacherComment: "输出不符，请按题解修改后重交。",
      returnReason: "输出与期望不符，请参考题解提示修改后重新提交。",
      returnCount: 1,
      returnedAt: new Date(now - 1 * D),
      gradedById: cs101.teacherId,
      gradedAt: new Date(now - 1 * D),
    },
  });

  console.log("\n========== 跳过用例测试数据（固定 ID）==========");
  console.log("TC-ENROLL-005 已满课 CS901:");
  console.log(`  courseId=${SKIPPED_TEST_FIXTURE_IDS.FULL_COURSE_ID}`);
  console.log(`  catalog 中 isFull=true；student@demo.local 未选，POST enroll → 409 或 POST waitlist`);
  console.log("TC-ENROLL-006 非选课窗口:");
  console.log(`  目标课 CS903 courseId=${SKIPPED_TEST_FIXTURE_IDS.CLOSED_WINDOW_TARGET_COURSE_ID}`);
  console.log(`  管理员 PUT /enrollment/period phase=CLOSED 后 student POST enroll → 403`);
  console.log(`  归档关闭学期 period semesterKey=2025-fall（id=${SKIPPED_TEST_FIXTURE_IDS.CLOSED_WINDOW_PERIOD_ID}）`);
  console.log("TC-HW-004 迟交作业:");
  console.log(`  homeworkId=${SKIPPED_TEST_FIXTURE_IDS.LATE_HOMEWORK_ID}（${cs101.code}，dueAt 已过，allowLate=true）`);
  console.log("TC-HW-005 重做作业:");
  console.log(`  homeworkId=${SKIPPED_TEST_FIXTURE_IDS.REDO_HOMEWORK_ID} submissionId=${SKIPPED_TEST_FIXTURE_IDS.REDO_SUBMISSION_ID}`);
  console.log("TC-LAB-002 未开始实验集:");
  console.log(`  labSetId=${SKIPPED_TEST_FIXTURE_IDS.FUTURE_LAB_SET_ID} labId=${SKIPPED_TEST_FIXTURE_IDS.FUTURE_LAB_ID}`);
  console.log("TC-LAB-007 已打回实验:");
  console.log(`  labId=${SKIPPED_TEST_FIXTURE_IDS.RETURNED_LAB_ID} submissionId=${SKIPPED_TEST_FIXTURE_IDS.RETURNED_SUBMISSION_ID}`);
  console.log(`  GET /submissions/${SKIPPED_TEST_FIXTURE_IDS.RETURNED_SUBMISSION_ID} 含 returnReason / returnedAt`);
  console.log("==============================================\n");
}
