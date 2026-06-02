/**
 * 演示数据（可重复执行）：多用户、两门课程、班级、实验与评测用例、作业与批改、讨论区、示例提交。
 * 实验管理改动：多状态实验集（进行中/补交/未开始/提醒/手动批改）、FILE 提交、单题讨论、实验提醒通知。
 * 运行：cd backend && npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Demo123456";

/** 固定 UUID，便于 upsert 与幂等重跑 */
const CID1 = "00000000-0000-4000-8000-000000000001";
const CID2 = "00000000-0000-4000-8000-000000000002";
const LS_C1 = "00000000-0000-4000-8000-000000000013";
const LS_C2 = "00000000-0000-4000-8000-000000000014";
const LS_C3 = "00000000-0000-4000-8000-000000000015";
const LS_C4 = "00000000-0000-4000-8000-000000000016";
const LS_MANUAL = "00000000-0000-4000-8000-000000000017";
const LAB_HELLO = "00000000-0000-4000-8000-000000000010";
const LAB_APB = "00000000-0000-4000-8000-000000000011";
const LAB_P42 = "00000000-0000-4000-8000-000000000012";
const LAB_MANUAL = "00000000-0000-4000-8000-000000000018";
const DISC_HELLO = "00000000-0000-4000-8000-000000000090";
const DISC_APB = "00000000-0000-4000-8000-000000000091";
const DISC_COMMENT = "00000000-0000-4000-8000-000000000092";
const HW_A1 = "00000000-0000-4000-8000-000000000020";
const HW_A2 = "00000000-0000-4000-8000-000000000021";
const HW_B1 = "00000000-0000-4000-8000-000000000022";
const CLASS_C1 = "00000000-0000-4000-8000-000000000030";
const ADMIN_ID = "00000000-0000-4000-8000-000000000099";

const UPLOAD_ROOT = join(process.cwd(), "uploads");

async function ensureFile(rel: string, content: string) {
  const abs = join(UPLOAD_ROOT, ...rel.split("/").filter(Boolean));
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, content, "utf8");
}

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: {
      id: ADMIN_ID,
      email: "admin@demo.local",
      name: "演示管理员",
      role: "ADMIN",
      passwordHash: hash,
      emailVerifiedAt: new Date(),
    },
  });

  const teacher = await prisma.user.upsert({
    where: { email: "teacher@demo.local" },
    update: { emailVerifiedAt: new Date() },
    create: {
      email: "teacher@demo.local",
      name: "张老师",
      role: "TEACHER",
      passwordHash: hash,
      emailVerifiedAt: new Date(),
    },
  });

  const s1 = await prisma.user.upsert({
    where: { email: "student@demo.local" },
    update: { emailVerifiedAt: new Date() },
    create: {
      email: "student@demo.local",
      name: "张三",
      role: "STUDENT",
      passwordHash: hash,
      emailVerifiedAt: new Date(),
    },
  });

  const s2 = await prisma.user.upsert({
    where: { email: "li@demo.local" },
    update: {},
    create: {
      email: "li@demo.local",
      name: "李四",
      role: "STUDENT",
      passwordHash: hash,
    },
  });

  const s3 = await prisma.user.upsert({
    where: { email: "wang@demo.local" },
    update: {},
    create: {
      email: "wang@demo.local",
      name: "王五",
      role: "STUDENT",
      passwordHash: hash,
    },
  });

  const scheduleC1 = JSON.stringify([
    { dayOfWeek: 1, periodStart: 1, periodEnd: 2, room: "教学楼 A301" },
    { dayOfWeek: 3, periodStart: 5, periodEnd: 6, room: "实验楼 B102" },
  ]);
  const scheduleC2 = JSON.stringify([
    { dayOfWeek: 2, periodStart: 3, periodEnd: 4, room: "教学楼 C205" },
  ]);

  const semesterKey = "2026-spring";
  const semesterLabel = "2026-2027 春季学期";
  const enrollmentFields = {
    semesterKey,
    credits: 3,
    capacity: 80,
    courseNature: "REQUIRED" as const,
    subjectCategory: "CORE_MAJOR" as const,
    offeringCollegeCode: "21",
  };

  const course1 = await prisma.course.upsert({
    where: { id: CID1 },
    update: {
      title: "程序设计基础（演示）",
      scheduleSlotsJson: scheduleC1,
      courseCode: "CS101",
      ...enrollmentFields,
    },
    create: {
      id: CID1,
      title: "程序设计基础（演示）",
      description: "涵盖 JavaScript 输出与 Python A+B；含作业与成绩册演示数据。",
      category: "程序设计",
      published: true,
      teacherId: teacher.id,
      labWeight: 0.6,
      homeworkWeight: 0.4,
      scheduleSlotsJson: scheduleC1,
      courseCode: "CS101",
      ...enrollmentFields,
    },
  });

  const course2 = await prisma.course.upsert({
    where: { id: CID2 },
    update: {
      scheduleSlotsJson: scheduleC2,
      courseCode: "CS201",
      semesterKey,
      credits: 2,
      capacity: 50,
      courseNature: "RENXIU",
      subjectCategory: "CORE_MAJOR",
      offeringCollegeCode: "6",
    },
    create: {
      id: CID2,
      title: "数据结构导论（演示）",
      description: "入门课：简单输出实验 + 思考题作业。适合与课程二联调路由与选课。",
      category: "数据结构",
      published: true,
      teacherId: teacher.id,
      labWeight: 0.5,
      homeworkWeight: 0.5,
      scheduleSlotsJson: scheduleC2,
      courseCode: "CS201",
      semesterKey,
      credits: 2,
      capacity: 50,
      courseNature: "RENXIU",
      subjectCategory: "CORE_MAJOR",
      offeringCollegeCode: "6",
    },
  });

  const now = Date.now();
  const H = 3600 * 1000;
  const D = 24 * H;

  /** 实验集时间窗（相对 seed 执行时刻，便于联调列表/提醒/补交） */
  const labSetTime = {
    /** 课一主集：进行中 + AUTO 文件提交 */
    c1Main: {
      startAt: new Date(now - D),
      dueAt: new Date(now + 7 * D),
      allowMakeup: false,
      makeupDueAt: null as Date | null,
      outsideAccessMode: "BLOCK",
      judgeMode: "AUTO" as const,
      allowedLanguages: ["python", "javascript"],
      allowedFileExtensions: [".py", ".js"],
    },
    /** 课二：已过截止、开放补交（李四/王五未完成） */
    c2Makeup: {
      startAt: new Date(now - 14 * D),
      dueAt: new Date(now - 2 * D),
      allowMakeup: true,
      makeupDueAt: new Date(now + 5 * D),
      outsideAccessMode: "BLOCK",
      judgeMode: "AUTO" as const,
      allowedLanguages: ["python"],
      allowedFileExtensions: [".py"],
    },
    /** 课一：未开始 + BLOCK */
    c1NotStarted: {
      startAt: new Date(now + 3 * D),
      dueAt: new Date(now + 14 * D),
      allowMakeup: false,
      makeupDueAt: null as Date | null,
      outsideAccessMode: "BLOCK",
      judgeMode: "AUTO" as const,
      allowedLanguages: ["python", "javascript"],
      allowedFileExtensions: [".py", ".js"],
    },
    /** 课一：截止约 90 分钟后，用于实验提醒横幅/站内信 */
    c1Reminder: {
      startAt: new Date(now - D),
      dueAt: new Date(now + 90 * 60 * 1000),
      allowMakeup: false,
      makeupDueAt: null as Date | null,
      outsideAccessMode: "BLOCK",
      judgeMode: "AUTO" as const,
      allowedLanguages: ["python"],
      allowedFileExtensions: [".py"],
    },
    /** 课一：手动批改演示 */
    c1Manual: {
      startAt: new Date(now - D),
      dueAt: new Date(now + 10 * D),
      allowMakeup: false,
      makeupDueAt: null as Date | null,
      outsideAccessMode: "BLOCK",
      judgeMode: "MANUAL" as const,
      allowedLanguages: ["python"],
      allowedFileExtensions: [".py", ".txt"],
    },
  };

  await prisma.enrollmentPeriod.upsert({
    where: { semesterKey },
    update: {
      label: semesterLabel,
      phase: "FORMAL",
      openAt: new Date(now - 7 * 24 * 3600 * 1000),
      closeAt: new Date(now + 60 * 24 * 3600 * 1000),
      confirmDeadline: new Date(now + 90 * 24 * 3600 * 1000),
    },
    create: {
      semesterKey,
      label: semesterLabel,
      phase: "FORMAL",
      openAt: new Date(now - 7 * 24 * 3600 * 1000),
      closeAt: new Date(now + 60 * 24 * 3600 * 1000),
      confirmDeadline: new Date(now + 90 * 24 * 3600 * 1000),
    },
  });

  const labSet1 = await prisma.labSet.upsert({
    where: { id: LS_C1 },
    update: {
      title: "程序设计综合实验（演示）",
      description: "含 Hello 与 A+B 两道题目；状态：进行中，AUTO 文件提交。",
      sortOrder: 0,
      ...labSetTime.c1Main,
    },
    create: {
      id: LS_C1,
      courseId: course1.id,
      title: "程序设计综合实验（演示）",
      description: "含 Hello 与 A+B 两道题目；状态：进行中，AUTO 文件提交。",
      sortOrder: 0,
      ...labSetTime.c1Main,
    },
  });

  const labSet2 = await prisma.labSet.upsert({
    where: { id: LS_C2 },
    update: {
      title: "入门实验（演示）",
      description: "单题整数输出；状态：补交中（部分学生未完成）。",
      sortOrder: 0,
      ...labSetTime.c2Makeup,
    },
    create: {
      id: LS_C2,
      courseId: course2.id,
      title: "入门实验（演示）",
      description: "单题整数输出；状态：补交中（部分学生未完成）。",
      sortOrder: 0,
      ...labSetTime.c2Makeup,
    },
  });

  const labSet3 = await prisma.labSet.upsert({
    where: { id: LS_C3 },
    update: {
      title: "未开始实验（演示）",
      description: "开始时间在 3 天后；用于测试「未开始」分组与 BLOCK 门禁。",
      sortOrder: 1,
      ...labSetTime.c1NotStarted,
    },
    create: {
      id: LS_C3,
      courseId: course1.id,
      title: "未开始实验（演示）",
      description: "开始时间在 3 天后；用于测试「未开始」分组与 BLOCK 门禁。",
      sortOrder: 1,
      ...labSetTime.c1NotStarted,
    },
  });

  const labSet4 = await prisma.labSet.upsert({
    where: { id: LS_C4 },
    update: {
      title: "截止提醒实验（演示）",
      description: "截止约在 seed 后 90 分钟；用于主界面实验提醒横幅与站内信。",
      sortOrder: 2,
      ...labSetTime.c1Reminder,
    },
    create: {
      id: LS_C4,
      courseId: course1.id,
      title: "截止提醒实验（演示）",
      description: "截止约在 seed 后 90 分钟；用于主界面实验提醒横幅与站内信。",
      sortOrder: 2,
      ...labSetTime.c1Reminder,
    },
  });

  const labSetManual = await prisma.labSet.upsert({
    where: { id: LS_MANUAL },
    update: {
      title: "手动批改实验（演示）",
      description: "MANUAL 模式；王五有一条 PENDING_REVIEW 提交供教师弹窗批改。",
      sortOrder: 3,
      ...labSetTime.c1Manual,
    },
    create: {
      id: LS_MANUAL,
      courseId: course1.id,
      title: "手动批改实验（演示）",
      description: "MANUAL 模式；王五有一条 PENDING_REVIEW 提交供教师弹窗批改。",
      sortOrder: 3,
      ...labSetTime.c1Manual,
    },
  });

  const labHello = await prisma.lab.upsert({
    where: { id: LAB_HELLO },
    update: {
      labSetId: labSet1.id,
      descriptionMd: "## 标准输出\n\n输出一行 `Hello`。Node 下使用 `console.log`。",
    },
    create: {
      id: LAB_HELLO,
      courseId: course1.id,
      labSetId: labSet1.id,
      title: "实验一：标准输出",
      description: "输出一行 Hello。Node 下使用 console.log。",
      descriptionMd: "## 标准输出\n\n输出一行 `Hello`。Node 下使用 `console.log`。",
      language: "javascript",
      starterCode: 'console.log("Hello")\n',
    },
  });

  const labApb = await prisma.lab.upsert({
    where: { id: LAB_APB },
    update: {
      labSetId: labSet1.id,
      descriptionMd: "## A+B（Python）\n\n读入一行两个整数，输出其和。",
    },
    create: {
      id: LAB_APB,
      courseId: course1.id,
      labSetId: labSet1.id,
      title: "实验二：A+B（Python）",
      description: "读入一行两个整数，输出其和。",
      descriptionMd: "## A+B（Python）\n\n读入一行两个整数，输出其和。",
      language: "python",
      starterCode: "a, b = map(int, input().split())\nprint(a + b)\n",
    },
  });

  const labP42 = await prisma.lab.upsert({
    where: { id: LAB_P42 },
    update: {
      labSetId: labSet2.id,
      descriptionMd: "## 整数输出\n\n输出整数 **42**。\n",
    },
    create: {
      id: LAB_P42,
      courseId: course2.id,
      labSetId: labSet2.id,
      title: "实验：整数输出",
      description: "输出整数 42。",
      descriptionMd: "## 整数输出\n\n输出整数 **42**。\n",
      language: "python",
      starterCode: "print(42)\n",
    },
  });

  const labManual = await prisma.lab.upsert({
    where: { id: LAB_MANUAL },
    update: {
      labSetId: labSetManual.id,
      descriptionMd: "## 简述变量（手动批改）\n\n用 Python 写一段不少于 20 字的程序说明「变量」的作用，输出到标准输出。\n",
    },
    create: {
      id: LAB_MANUAL,
      courseId: course1.id,
      labSetId: labSetManual.id,
      title: "实验：变量说明（手动批改）",
      description: "提交 .py 或 .txt，教师手动评分。",
      descriptionMd: "## 简述变量（手动批改）\n\n用 Python 写一段不少于 20 字的程序说明「变量」的作用，输出到标准输出。\n",
      language: "python",
      starterCode: '# 示例：print("变量用于存储数据")\n',
    },
  });

  /** 提醒集占位题（无测试用例，仅用于列表/提醒联调） */
  const labReminderPlaceholder = await prisma.lab.upsert({
    where: { id: "00000000-0000-4000-8000-000000000019" },
    update: { labSetId: labSet4.id },
    create: {
      id: "00000000-0000-4000-8000-000000000019",
      courseId: course1.id,
      labSetId: labSet4.id,
      title: "提醒演示占位题",
      description: "本集主要用于实验截止提醒联调，可无实际提交。",
      descriptionMd: "本实验集用于演示**截止前 2 小时**提醒，题目本身无评测要求。",
      language: "python",
      starterCode: "",
    },
  });

  await prisma.testCase.deleteMany({
    where: { labId: { in: [labHello.id, labApb.id, labP42.id, labManual.id] } },
  });

  await prisma.testCase.createMany({
    data: [
      { labId: labHello.id, input: "", expected: "Hello", hidden: false, weight: 1 },
      {
        labId: labApb.id,
        input: "3 5\n",
        expected: "8",
        hidden: false,
        weight: 1,
      },
      {
        labId: labApb.id,
        input: "10 20\n",
        expected: "30",
        hidden: true,
        weight: 1,
      },
      { labId: labP42.id, input: "", expected: "42", hidden: false, weight: 1 },
    ],
  });

  /** 课程资料（讲义/讲稿） */
  await prisma.courseMaterial.deleteMany({ where: { courseId: { in: [course1.id, course2.id] } } });
  // 写入示例文件到 backend/uploads
  await ensureFile(`courses/${course1.id}/seed_syllabus.txt`, "【演示课程资料】\n\n本文件由 seed.ts 生成，用于演示课程资料上传/下载。\n");
  await ensureFile(`courses/${course1.id}/seed_slides.txt`, "【演示讲义】\n\n1) Hello 输出\n2) A+B 输入输出\n3) 注意标准输入与输出格式\n");
  await ensureFile(`courses/${course2.id}/seed_readme.txt`, "【数据结构导论】\n\n本讲义用于演示课程资料。\n");

  const MAT_C1_SYL = "00000000-0000-4000-8000-000000000050";
  const MAT_C1_SLIDES = "00000000-0000-4000-8000-000000000051";
  const MAT_C2_README = "00000000-0000-4000-8000-000000000052";
  await prisma.courseMaterial.createMany({
    data: [
      {
        id: MAT_C1_SYL,
        courseId: course1.id,
        title: "课程大纲（seed）",
        fileName: "syllabus.txt",
        storedPath: `courses/${course1.id}/seed_syllabus.txt`,
        mimeType: "text/plain",
        sizeBytes: 100,
        uploadedById: teacher.id,
        folderPath: "教学大纲",
        pinned: true,
        groupId: MAT_C1_SYL,
        version: 1,
        isCurrent: true,
      },
      {
        id: MAT_C1_SLIDES,
        courseId: course1.id,
        title: "第一讲讲义（seed）",
        fileName: "slides.txt",
        storedPath: `courses/${course1.id}/seed_slides.txt`,
        mimeType: "text/plain",
        sizeBytes: 160,
        uploadedById: teacher.id,
        folderPath: "第1章/课件",
        groupId: MAT_C1_SLIDES,
        version: 1,
        isCurrent: true,
      },
      {
        id: MAT_C2_README,
        courseId: course2.id,
        title: "课程说明（seed）",
        fileName: "readme.txt",
        storedPath: `courses/${course2.id}/seed_readme.txt`,
        mimeType: "text/plain",
        sizeBytes: 80,
        uploadedById: teacher.id,
        folderPath: "",
        groupId: MAT_C2_README,
        version: 1,
        isCurrent: true,
      },
    ],
  });

  /** 实验附件（数据文件/说明） */
  await prisma.labFile.deleteMany({ where: { labId: { in: [labHello.id, labApb.id, labP42.id] } } });
  await ensureFile(`labs/${labApb.id}/seed_input_examples.txt`, "3 5\n10 20\n");
  await ensureFile(`labs/${labApb.id}/seed_hint.txt`, "提示：读取一行两个整数，输出其和。\n");
  await ensureFile(`labs/${labHello.id}/seed_readme.txt`, "输出一行 Hello，注意不要输出多余文字。\n");

  await prisma.labFile.createMany({
    data: [
      {
        labId: labApb.id,
        title: "样例输入（seed）",
        fileName: "input_examples.txt",
        storedPath: `labs/${labApb.id}/seed_input_examples.txt`,
        mimeType: "text/plain",
        sizeBytes: 20,
        uploadedById: teacher.id,
      },
      {
        labId: labApb.id,
        title: "实验提示（seed）",
        fileName: "hint.txt",
        storedPath: `labs/${labApb.id}/seed_hint.txt`,
        mimeType: "text/plain",
        sizeBytes: 60,
        uploadedById: teacher.id,
      },
      {
        labId: labHello.id,
        title: "实验说明补充（seed）",
        fileName: "readme.txt",
        storedPath: `labs/${labHello.id}/seed_readme.txt`,
        mimeType: "text/plain",
        sizeBytes: 50,
        uploadedById: teacher.id,
      },
    ],
  });

  /** 须在引用 targetClassId 的作业之前创建班级，否则违反 Homework_targetClassId_fkey */
  const cls = await prisma.class.upsert({
    where: { id: CLASS_C1 },
    update: {},
    create: {
      id: CLASS_C1,
      courseId: course1.id,
      name: "计科 2022-1 班（演示）",
    },
  });

  const hw1 = await prisma.homework.upsert({
    where: { id: HW_A1 },
    update: {},
    create: {
      id: HW_A1,
      courseId: course1.id,
      title: "作业一：在线实验心得",
      description: "不少于 30 字，谈谈在线编程与本地环境的差异。",
      dueAt: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      published: true,
      publishedAt: new Date(),
    },
  });

  const hw2 = await prisma.homework.upsert({
    where: { id: HW_A2 },
    update: {},
    create: {
      id: HW_A2,
      courseId: course1.id,
      title: "作业二：算法复杂度",
      description: "简述 O(n) 与 O(n²) 的区别并各举一例。",
      dueAt: new Date(Date.now() + 10 * 24 * 3600 * 1000),
      // 按班级发布示例：只发给 course1 的 CLASS_C1
      targetClassId: CLASS_C1,
      published: true,
      publishedAt: new Date(),
    },
  });

  const hwB1 = await prisma.homework.upsert({
    where: { id: HW_B1 },
    update: {},
    create: {
      id: HW_B1,
      courseId: course2.id,
      title: "思考题：你最想实现的数据结构",
      description: "任选一种（栈/队列/树等），说明用途（50 字以上）。",
      dueAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      published: true,
      publishedAt: new Date(),
    },
  });

  for (const [u, cid, classId] of [
    [s1.id, course1.id, cls.id] as const,
    [s2.id, course1.id, cls.id] as const,
    [s3.id, course1.id, cls.id] as const,
    [s1.id, course2.id, null] as const,
    [s2.id, course2.id, null] as const,
  ]) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: u, courseId: cid } },
      update: { classId },
      create: { userId: u, courseId: cid, classId: classId ?? undefined },
    });
  }

  await prisma.discussionPost.deleteMany({ where: { courseId: course1.id } });
  await prisma.discussionPost.createMany({
    data: [
      {
        courseId: course1.id,
        userId: teacher.id,
        title: "欢迎来到程序设计基础（演示）",
        body: "请按周完成实验与作业，有问题优先在答疑区发帖。",
      },
      {
        courseId: course1.id,
        userId: s1.id,
        title: "提问：评测一直 Pending？",
        body: "请问需要启动 judge-worker 和 Redis 吗？本地只跑 API 是否会卡在等待评测？",
      },
      {
        courseId: course1.id,
        userId: teacher.id,
        title: "回复：评测依赖",
        body: "是的，提交后会入队；请保证 Redis 与 judge-worker 进程可用，否则会一直 PENDING。",
      },
    ],
  });

  await prisma.discussionPost.deleteMany({ where: { courseId: course2.id } });
  await prisma.discussionPost.create({
    data: {
      courseId: course2.id,
      userId: teacher.id,
      title: "数据结构课程说明",
      body: "本演示课仅含一个简单 Python 实验，可与课一对比页面与流程。",
    },
  });

  const ANN_C1 = "00000000-0000-4000-8000-000000000040";
  const ANN_C2 = "00000000-0000-4000-8000-000000000041";
  await prisma.courseAnnouncement.deleteMany({
    where: { id: { in: [ANN_C1, ANN_C2] } },
  });
  await prisma.courseAnnouncement.create({
    data: {
      id: ANN_C1,
      courseId: course1.id,
      authorId: teacher.id,
      title: "第 1 周实验与作业安排",
      content:
        "## 本周任务\n\n1. 完成「Hello 输出」实验\n2. 提交作业 A1\n\n如有疑问请在课程问答区发帖。",
      pinned: true,
    },
  });
  await prisma.courseAnnouncement.create({
    data: {
      id: ANN_C2,
      courseId: course2.id,
      authorId: teacher.id,
      title: "数据结构课程说明",
      content: "本演示课含 Python 实验，请按实验集截止时间提交代码。",
      pinned: false,
    },
  });
  await prisma.siteNotification.deleteMany({
    where: { announcementId: { in: [ANN_C1, ANN_C2] } },
  });
  for (const sid of [s1.id, s2.id, s3.id]) {
    await prisma.siteNotification.create({
      data: {
        userId: sid,
        type: "ANNOUNCEMENT",
        title: "【课程公告】第 1 周实验与作业安排",
        body: "第 1 周实验与作业安排",
        linkPath: `/courses/${course1.id}/announcements/${ANN_C1}`,
        announcementId: ANN_C1,
      },
    });
  }

  /** 重置本种子涉及的提交记录，避免重复跑脚本时翻倍 */
  const seedLabIds = [labHello.id, labApb.id, labP42.id, labManual.id];
  await prisma.submission.deleteMany({ where: { labId: { in: seedLabIds } } });

  const subHelloAc = "00000000-0000-4000-8000-000000000201";
  const subHelloWa = "00000000-0000-4000-8000-000000000202";
  const subHelloAcS3 = "00000000-0000-4000-8000-000000000203";
  const subApbAc = "00000000-0000-4000-8000-000000000211";
  const subApbAcS2 = "00000000-0000-4000-8000-000000000212";
  const subApbWa = "00000000-0000-4000-8000-000000000213";
  const subP42Ac = "00000000-0000-4000-8000-000000000221";
  const subP42Wa = "00000000-0000-4000-8000-000000000222";
  const subManualPending = "00000000-0000-4000-8000-000000000223";

  await ensureFile(`submissions/${subHelloAc}/hello.js`, 'console.log("Hello")\n');
  await ensureFile(`submissions/${subHelloWa}/hello_wrong.js`, 'console.log("Hell")\n');
  await ensureFile(`submissions/${subApbAc}/apb.py`, "a,b=map(int,input().split())\nprint(a+b)\n");
  await ensureFile(`submissions/${subApbAcS2}/apb.py`, "a,b=map(int,input().split())\nprint(a+b)\n");
  await ensureFile(`submissions/${subApbWa}/apb_wrong.py`, "print(0)\n");
  await ensureFile(`submissions/${subP42Ac}/p42.py`, "print(42)\n");
  await ensureFile(`submissions/${subP42Wa}/p42_wrong.py`, "print(41)\n");
  await ensureFile(
    `submissions/${subManualPending}/variable.txt`,
    "变量是程序中用来保存数据的命名存储单元，可以在运行时被读取和修改。\n",
  );

  const demoSubs: Array<{
    id: string;
    labId: string;
    userId: string;
    submissionKind: "CODE" | "FILE";
    language: string | null;
    code: string;
    fileName: string | null;
    fileStoredPath: string | null;
    status: "ACCEPTED" | "WRONG_ANSWER" | "PENDING_REVIEW";
    score: number | null;
    teacherComment?: string | null;
  }> = [
    {
      id: subHelloAc,
      labId: labHello.id,
      userId: s1.id,
      submissionKind: "FILE",
      language: "javascript",
      code: "",
      fileName: "hello.js",
      fileStoredPath: `submissions/${subHelloAc}/hello.js`,
      status: "ACCEPTED",
      score: 100,
    },
    {
      id: subHelloWa,
      labId: labHello.id,
      userId: s2.id,
      submissionKind: "FILE",
      language: "javascript",
      code: "",
      fileName: "hello_wrong.js",
      fileStoredPath: `submissions/${subHelloWa}/hello_wrong.js`,
      status: "WRONG_ANSWER",
      score: 0,
    },
    {
      id: subHelloAcS3,
      labId: labHello.id,
      userId: s3.id,
      submissionKind: "CODE",
      language: "javascript",
      code: 'console.log("Hello")\n',
      fileName: null,
      fileStoredPath: null,
      status: "ACCEPTED",
      score: 100,
    },
    {
      id: subApbAc,
      labId: labApb.id,
      userId: s1.id,
      submissionKind: "FILE",
      language: "python",
      code: "",
      fileName: "apb.py",
      fileStoredPath: `submissions/${subApbAc}/apb.py`,
      status: "ACCEPTED",
      score: 100,
    },
    {
      id: subApbAcS2,
      labId: labApb.id,
      userId: s2.id,
      submissionKind: "FILE",
      language: "python",
      code: "",
      fileName: "apb.py",
      fileStoredPath: `submissions/${subApbAcS2}/apb.py`,
      status: "ACCEPTED",
      score: 100,
    },
    {
      id: subApbWa,
      labId: labApb.id,
      userId: s3.id,
      submissionKind: "FILE",
      language: "python",
      code: "",
      fileName: "apb_wrong.py",
      fileStoredPath: `submissions/${subApbWa}/apb_wrong.py`,
      status: "WRONG_ANSWER",
      score: 0,
    },
    {
      id: subP42Ac,
      labId: labP42.id,
      userId: s1.id,
      submissionKind: "FILE",
      language: "python",
      code: "",
      fileName: "p42.py",
      fileStoredPath: `submissions/${subP42Ac}/p42.py`,
      status: "ACCEPTED",
      score: 100,
    },
    {
      id: subP42Wa,
      labId: labP42.id,
      userId: s2.id,
      submissionKind: "FILE",
      language: "python",
      code: "",
      fileName: "p42_wrong.py",
      fileStoredPath: `submissions/${subP42Wa}/p42_wrong.py`,
      status: "WRONG_ANSWER",
      score: 0,
    },
    {
      id: subManualPending,
      labId: labManual.id,
      userId: s3.id,
      submissionKind: "FILE",
      language: "python",
      code: "",
      fileName: "variable.txt",
      fileStoredPath: `submissions/${subManualPending}/variable.txt`,
      status: "PENDING_REVIEW",
      score: null,
      teacherComment: null,
    },
  ];

  for (const r of demoSubs) {
    await prisma.submission.create({
      data: {
        id: r.id,
        labId: r.labId,
        userId: r.userId,
        submissionKind: r.submissionKind,
        language: r.language,
        code: r.code,
        fileName: r.fileName,
        fileStoredPath: r.fileStoredPath,
        status: r.status,
        score: r.score,
        teacherComment: r.teacherComment ?? undefined,
        resultJson: JSON.stringify({
          seeded: true,
          note: "演示数据；FILE 提交已写入 backend/uploads",
        }),
      },
    });
  }

  /** 单题讨论区示例（Hello / A+B） */
  await prisma.discussionComment.deleteMany({
    where: { postId: { in: [DISC_HELLO, DISC_APB] } },
  });
  await prisma.discussionPost.deleteMany({
    where: { id: { in: [DISC_HELLO, DISC_APB] } },
  });
  await prisma.discussionPost.create({
    data: {
      id: DISC_HELLO,
      courseId: course1.id,
      labSetId: labSet1.id,
      labId: labHello.id,
      userId: s2.id,
      title: "Hello 题输出格式疑问",
      body: "请问是否需要严格匹配大小写？我提交 `Hell` 被判 WA。\n\n```javascript\nconsole.log('Hell')\n```",
      viewCount: 12,
    },
  });
  await prisma.discussionComment.create({
    data: {
      id: DISC_COMMENT,
      postId: DISC_HELLO,
      userId: teacher.id,
      body: "需要输出 exactly `Hello`（H 大写，其余小写），不要多余空格或换行。",
    },
  });
  await prisma.discussionPost.create({
    data: {
      id: DISC_APB,
      courseId: course1.id,
      labSetId: labSet1.id,
      labId: labApb.id,
      userId: teacher.id,
      title: "【置顶】A+B 读入格式说明",
      body: "一行两个整数，空格分隔，例如输入 `3 5` 应输出 `8`。Windows 换行不影响评测。",
      pinned: true,
      viewCount: 28,
    },
  });

  /** 实验截止提醒：预写站内信（backend 扫描也会按窗去重补发） */
  const reminderDueAt = labSetTime.c1Reminder.dueAt!;
  const reminderBody = `课程「${course1.title}」的实验集「${labSet4.title}」将于 ${reminderDueAt.toLocaleString("zh-CN")} 截止，请尽快完成提交。`;
  await prisma.siteNotification.deleteMany({
    where: { labSetId: { in: [labSet4.id] }, type: "LAB_REMINDER" },
  });
  for (const sid of [s1.id, s2.id, s3.id]) {
    await prisma.siteNotification.create({
      data: {
        userId: sid,
        type: "LAB_REMINDER",
        title: `实验即将截止：${labSet4.title}`,
        body: reminderBody,
        linkPath: `/courses/${course1.id}/lab-sets/${labSet4.id}`,
        labSetId: labSet4.id,
      },
    });
  }

  await prisma.homeworkSubmission.deleteMany({
    where: { homeworkId: { in: [hw1.id, hw2.id, hwB1.id] } },
  });

  await prisma.homeworkSubmission.createMany({
    data: [
      {
        homeworkId: hw1.id,
        userId: s1.id,
        content:
          "在线实验浏览器里写代码很方便，但有时断网会担心丢失；总体来说比机房固定座位灵活很多，希望能自动保存更频繁。",
        score: 88,
        feedback: "态度认真，可补充具体功能建议。",
        graded: true,
        released: true,
        releasedAt: new Date(),
      },
      {
        homeworkId: hw1.id,
        userId: s2.id,
        content:
          "本地 IDE 补全更强，但在线环境统一了依赖版本，提交前能看到评测反馈这点非常好，减少了环境不一致导致的冤枉分。",
        score: 92,
        feedback: "写得清晰，可继续保持。",
        graded: true,
        released: false,
        releasedAt: null,
      },
      {
        homeworkId: hw1.id,
        userId: s3.id,
        content: "第一次使用还不太熟练，正在适应 Monaco 编辑器和提交流程，后续会多练几次实验。",
        score: null,
        feedback: null,
        graded: false,
      },
      {
        homeworkId: hw2.id,
        userId: s1.id,
        content:
          "O(n) 表示随输入规模线性增长，例如遍历数组一次；O(n²) 常见于双重循环。排序里冒泡最坏接近 O(n²)，归并可到 O(n log n)。",
        score: 90,
        feedback: "概念准确。",
        graded: true,
        released: true,
        releasedAt: new Date(),
      },
      {
        homeworkId: hw2.id,
        userId: s2.id,
        content:
          "O(n) 与输入成正比；O(n²) 往往有两层与 n 相关的循环。例如矩阵朴素乘法部分场景会体现平方级。",
        score: 85,
        feedback: "举例可再具体。",
        graded: true,
        released: true,
        releasedAt: new Date(),
      },
      {
        homeworkId: hwB1.id,
        userId: s1.id,
        content:
          "最想实现二叉搜索树，便于有序检索与范围查询；在字典场景下可以兼顾插入与查找效率，配合平衡策略更稳。",
        score: 95,
        feedback: "有思考深度。",
        graded: true,
        released: false,
        releasedAt: null,
      },
      {
        homeworkId: hwB1.id,
        userId: s2.id,
        content: "我对栈比较感兴趣，准备用栈做表达式求值相关练习，觉得和日常撤销操作也有联系。",
        score: null,
        feedback: null,
        graded: false,
        released: false,
      },
    ],
  });

  /** 作业问答：提问/回答示例 */
  await prisma.homeworkQuestion.deleteMany({ where: { homeworkId: { in: [hw1.id, hw2.id, hwB1.id] } } });
  await prisma.homeworkQuestion.createMany({
    data: [
      {
        homeworkId: hw1.id,
        userId: s1.id,
        question: "老师，作业一可以写成条目式总结吗？还是需要完整段落？",
        answer: "可以条目式，但每条尽量讲清楚原因与例子，避免只写一句话。",
        answeredById: teacher.id,
        answeredAt: new Date(),
      },
      {
        homeworkId: hw2.id,
        userId: s2.id,
        question: "O(n log n) 属于比 O(n) 更慢吗？能举个排序例子吗？",
        answer: "是的，O(n log n) 比 O(n) 慢。比如归并排序/快速排序平均是 O(n log n)。",
        answeredById: teacher.id,
        answeredAt: new Date(),
      },
      {
        homeworkId: hwB1.id,
        userId: s2.id,
        question: "我写栈的应用场景太少了，会扣分吗？",
      },
    ],
  });

  /** 练习模块演示数据（题库、练习记录、错题本、反馈） */
  const PQ1 = "00000000-0000-4000-8000-000000000040";
  const PQ2 = "00000000-0000-4000-8000-000000000041";
  const PQ3 = "00000000-0000-4000-8000-000000000042";
  const PQ4 = "00000000-0000-4000-8000-000000000043";
  const PQ5 = "00000000-0000-4000-8000-000000000044";
  const PQ6 = "00000000-0000-4000-8000-000000000045";
  const PQ7 = "00000000-0000-4000-8000-000000000046";
  const PQ8 = "00000000-0000-4000-8000-000000000047";
  const PQ9 = "00000000-0000-4000-8000-000000000048";
  const PQ10 = "00000000-0000-4000-8000-000000000049";
  const PQ11 = "00000000-0000-4000-8000-00000000004a";
  const PQ12 = "00000000-0000-4000-8000-00000000004b";
  const PQ13 = "00000000-0000-4000-8000-00000000004c";
  const PQ14 = "00000000-0000-4000-8000-00000000004d";
  const PQ15 = "00000000-0000-4000-8000-00000000004e";
  const PQ16 = "00000000-0000-4000-8000-00000000004f";
  const PQ2C1 = "00000000-0000-4000-8000-000000000060";
  const PQ2C2 = "00000000-0000-4000-8000-000000000061";
  const PQ2C3 = "00000000-0000-4000-8000-000000000062";
  const PQ2C4 = "00000000-0000-4000-8000-000000000063";
  const PS_GRADED = "00000000-0000-4000-8000-000000000050";
  const PS_IN_PROGRESS = "00000000-0000-4000-8000-000000000051";
  const PF_PENDING = "00000000-0000-4000-8000-000000000070";
  const PF_PENDING2 = "00000000-0000-4000-8000-000000000071";
  const PF_CLOSED = "00000000-0000-4000-8000-000000000072";

  const practiceCourseIds = [course1.id, course2.id];
  await prisma.practiceQuestionFeedback.deleteMany({ where: { courseId: { in: practiceCourseIds } } });
  await prisma.practiceSession.deleteMany({ where: { courseId: { in: practiceCourseIds } } });
  await prisma.wrongBookEntry.deleteMany({
    where: { userId: { in: [s1.id, s2.id, s3.id] }, practiceQuestionId: { not: null } },
  });
  await prisma.practiceQuestion.deleteMany({ where: { courseId: { in: practiceCourseIds } } });

  const pySumCode = "a, b = map(int, input().split())\nprint(a + b)";
  const pyMaxCode = "a, b = map(int, input().split())\nprint(a if a >= b else b)";
  const pyHelloCode = 'print("Hello")';

  await prisma.practiceQuestion.createMany({
    data: [
      {
        id: PQ1,
        courseId: course1.id,
        type: "CHOICE",
        stem: "下列时间复杂度中，通常快于 O(n²) 的是？",
        optionsJson: JSON.stringify([
          { id: "a", text: "O(1)" },
          { id: "b", text: "O(n log n)" },
          { id: "c", text: "O(n²)" },
          { id: "d", text: "O(2^n)" },
        ]),
        answerJson: JSON.stringify({ choiceId: "b" }),
        explanation: "O(n log n) 常见于高效排序算法的平均情况，一般优于 O(n²)。",
        tagPath: "数据结构 > 算法分析 > 复杂度",
        difficulty: "EASY",
        attemptCount: 48,
        correctCount: 36,
        totalTimeMs: 480_000,
        createdById: teacher.id,
      },
      {
        id: PQ2,
        courseId: course1.id,
        type: "FILL",
        stem: "数组按下标访问元素的时间复杂度为 O(____)。",
        optionsJson: null,
        answerJson: JSON.stringify({ blanks: ["1"] }),
        explanation: "数组随机访问为常数时间 O(1)。",
        tagPath: "数据结构 > 线性表 > 数组",
        difficulty: "EASY",
        attemptCount: 42,
        correctCount: 38,
        totalTimeMs: 210_000,
        createdById: teacher.id,
      },
      {
        id: PQ3,
        courseId: course1.id,
        type: "SHORT_ANSWER",
        stem: "简述栈的 LIFO 特性，并举一个应用场景。",
        optionsJson: null,
        answerJson: JSON.stringify({ text: "后进先出" }),
        explanation: "栈只允许在一端插入删除；如函数调用栈、括号匹配、撤销操作等。",
        tagPath: "数据结构 > 栈",
        difficulty: "MEDIUM",
        attemptCount: 31,
        correctCount: 22,
        totalTimeMs: 620_000,
        createdById: teacher.id,
      },
      {
        id: PQ4,
        courseId: course1.id,
        type: "CODE",
        stem: "编写程序：从标准输入读入两个整数，输出它们的和。",
        optionsJson: null,
        answerJson: JSON.stringify({
          language: "python",
          cases: [
            { input: "3 5\n", expected: "8" },
            { input: "10 20\n", expected: "30" },
          ],
        }),
        explanation: "Python 可用 input().split() 读入并 int 转换后相加。",
        tagPath: "程序设计 > 输入输出",
        difficulty: "MEDIUM",
        language: "python",
        attemptCount: 55,
        correctCount: 41,
        totalTimeMs: 1_100_000,
        createdById: teacher.id,
      },
      {
        id: PQ5,
        courseId: course1.id,
        type: "CHOICE",
        stem: "Python 中用于在控制台输出一行文本的函数是？",
        optionsJson: JSON.stringify([
          { id: "a", text: "input()" },
          { id: "b", text: "print()" },
          { id: "c", text: "scanf()" },
          { id: "d", text: "cout" },
        ]),
        answerJson: JSON.stringify({ choiceId: "b" }),
        explanation: "print() 用于输出；input() 用于读入。",
        tagPath: "程序设计 > 基础 > 语法",
        difficulty: "EASY",
        attemptCount: 60,
        correctCount: 57,
        totalTimeMs: 180_000,
        createdById: teacher.id,
      },
      {
        id: PQ6,
        courseId: course1.id,
        type: "CHOICE",
        stem: "二叉树的前序遍历访问顺序是？",
        optionsJson: JSON.stringify([
          { id: "a", text: "左 → 根 → 右" },
          { id: "b", text: "根 → 左 → 右" },
          { id: "c", text: "左 → 右 → 根" },
          { id: "d", text: "右 → 根 → 左" },
        ]),
        answerJson: JSON.stringify({ choiceId: "b" }),
        explanation: "前序：先访问根，再左子树，后右子树。",
        tagPath: "数据结构 > 树 > 二叉树 > 遍历",
        difficulty: "MEDIUM",
        attemptCount: 28,
        correctCount: 15,
        totalTimeMs: 420_000,
        createdById: teacher.id,
      },
      {
        id: PQ7,
        courseId: course1.id,
        type: "FILL",
        stem: "在单链表表头插入一个已知节点的时间复杂度为 O(____)。",
        optionsJson: null,
        answerJson: JSON.stringify({ blanks: ["1"] }),
        explanation: "表头插入只需改指针，为 O(1)。",
        tagPath: "数据结构 > 线性表 > 链表",
        difficulty: "MEDIUM",
        attemptCount: 22,
        correctCount: 17,
        totalTimeMs: 260_000,
        createdById: teacher.id,
      },
      {
        id: PQ8,
        courseId: course1.id,
        type: "CHOICE",
        stem: "快速排序在最坏情况下的时间复杂度是？",
        optionsJson: JSON.stringify([
          { id: "a", text: "O(n)" },
          { id: "b", text: "O(n log n)" },
          { id: "c", text: "O(n²)" },
          { id: "d", text: "O(log n)" },
        ]),
        answerJson: JSON.stringify({ choiceId: "c" }),
        explanation: "当划分极不平衡时，快排退化为 O(n²)。",
        tagPath: "数据结构 > 算法分析 > 排序",
        difficulty: "HARD",
        attemptCount: 19,
        correctCount: 8,
        totalTimeMs: 380_000,
        createdById: teacher.id,
      },
      {
        id: PQ9,
        courseId: course1.id,
        type: "SHORT_ANSWER",
        stem: "什么是程序中的「变量」？",
        optionsJson: null,
        answerJson: JSON.stringify({ text: "存储数据" }),
        explanation: "变量是具名的存储单元，可在程序运行中保存和更新数据。",
        tagPath: "程序设计 > 基础 > 变量",
        difficulty: "EASY",
        attemptCount: 35,
        correctCount: 30,
        totalTimeMs: 290_000,
        createdById: teacher.id,
      },
      {
        id: PQ10,
        courseId: course1.id,
        type: "CODE",
        stem: "编写程序：输出一行 Hello（不含引号）。",
        optionsJson: null,
        answerJson: JSON.stringify({
          language: "python",
          cases: [{ input: "", expected: "Hello" }],
        }),
        explanation: '使用 print("Hello") 即可。',
        tagPath: "程序设计 > 基础 > 输出",
        difficulty: "EASY",
        language: "python",
        attemptCount: 40,
        correctCount: 35,
        totalTimeMs: 320_000,
        createdById: teacher.id,
      },
      {
        id: PQ11,
        courseId: course1.id,
        type: "CHOICE",
        stem: "队列（Queue）的典型特性是？",
        optionsJson: JSON.stringify([
          { id: "a", text: "后进先出（LIFO）" },
          { id: "b", text: "先进先出（FIFO）" },
          { id: "c", text: "随机访问" },
          { id: "d", text: "只能存储整数" },
        ]),
        answerJson: JSON.stringify({ choiceId: "b" }),
        explanation: "队列从队尾入队、队头出队，符合 FIFO。",
        tagPath: "数据结构 > 队列",
        difficulty: "EASY",
        attemptCount: 26,
        correctCount: 24,
        totalTimeMs: 150_000,
        createdById: teacher.id,
      },
      {
        id: PQ12,
        courseId: course1.id,
        type: "FILL",
        stem: "二叉树中每个节点最多有 ____ 个子节点。",
        optionsJson: null,
        answerJson: JSON.stringify({ blanks: ["2"] }),
        explanation: "二叉树定义：每个节点度不超过 2。",
        tagPath: "数据结构 > 树 > 二叉树",
        difficulty: "EASY",
        attemptCount: 33,
        correctCount: 28,
        totalTimeMs: 200_000,
        createdById: teacher.id,
      },
      {
        id: PQ13,
        courseId: course1.id,
        type: "SHORT_ANSWER",
        stem: "递归算法通常需要哪两个要素？",
        optionsJson: null,
        answerJson: JSON.stringify({ text: "基准情况" }),
        explanation: "递归需要基准情况（终止）与递归关系（缩小规模）。",
        tagPath: "程序设计 > 函数 > 递归",
        difficulty: "MEDIUM",
        attemptCount: 18,
        correctCount: 11,
        totalTimeMs: 350_000,
        createdById: teacher.id,
      },
      {
        id: PQ14,
        courseId: course1.id,
        type: "CODE",
        stem: "编写程序：读入两个整数，输出较大者。",
        optionsJson: null,
        answerJson: JSON.stringify({
          language: "python",
          cases: [
            { input: "3 7\n", expected: "7" },
            { input: "-1 -5\n", expected: "-1" },
          ],
        }),
        explanation: "可用 if 比较或内置 max。",
        tagPath: "程序设计 > 分支",
        difficulty: "MEDIUM",
        language: "python",
        attemptCount: 24,
        correctCount: 16,
        totalTimeMs: 540_000,
        createdById: teacher.id,
      },
      {
        id: PQ15,
        courseId: course1.id,
        type: "CHOICE",
        stem: "下列哪种循环适合「先判断条件再执行」？",
        optionsJson: JSON.stringify([
          { id: "a", text: "while" },
          { id: "b", text: "do-while（Python 无此语法）" },
          { id: "c", text: "for 只能遍历列表" },
          { id: "d", text: "以上都不对" },
        ]),
        answerJson: JSON.stringify({ choiceId: "a" }),
        explanation: "while 先判断条件；Python 的 for 也可配合 range 使用。",
        tagPath: "程序设计 > 循环",
        difficulty: "EASY",
        attemptCount: 21,
        correctCount: 19,
        totalTimeMs: 170_000,
        createdById: teacher.id,
      },
      {
        id: PQ16,
        courseId: course1.id,
        type: "FILL",
        stem: "有序数组二分查找的平均时间复杂度为 O(____)。",
        optionsJson: null,
        answerJson: JSON.stringify({ blanks: ["log n"] }),
        explanation: "二分每次将搜索区间减半，为 O(log n)。",
        tagPath: "数据结构 > 算法分析 > 查找",
        difficulty: "HARD",
        attemptCount: 14,
        correctCount: 6,
        totalTimeMs: 310_000,
        createdById: teacher.id,
      },
      {
        id: PQ2C1,
        courseId: course2.id,
        type: "CHOICE",
        stem: "栈与队列相比，更适合解决哪类问题？",
        optionsJson: JSON.stringify([
          { id: "a", text: "括号匹配、表达式求值" },
          { id: "b", text: "广度优先搜索层序遍历" },
          { id: "c", text: "磁盘顺序读写" },
          { id: "d", text: "哈希冲突处理" },
        ]),
        answerJson: JSON.stringify({ choiceId: "a" }),
        explanation: "栈适合 LIFO 场景；BFS 常用队列。",
        tagPath: "数据结构 > 栈",
        difficulty: "EASY",
        attemptCount: 12,
        correctCount: 10,
        totalTimeMs: 90_000,
        createdById: teacher.id,
      },
      {
        id: PQ2C2,
        courseId: course2.id,
        type: "FILL",
        stem: "完全二叉树第 i 层（从 0 起）最多有 ____ 个节点。",
        optionsJson: null,
        answerJson: JSON.stringify({ blanks: ["2^i"] }),
        explanation: "第 i 层最多 2^i 个节点。",
        tagPath: "数据结构 > 树 > 二叉树",
        difficulty: "MEDIUM",
        attemptCount: 9,
        correctCount: 5,
        totalTimeMs: 120_000,
        createdById: teacher.id,
      },
      {
        id: PQ2C3,
        courseId: course2.id,
        type: "SHORT_ANSWER",
        stem: "简述「链表」相对「数组」的一个优点。",
        optionsJson: null,
        answerJson: JSON.stringify({ text: "插入" }),
        explanation: "链表插入删除不需整体移动元素（在已知位置时）。",
        tagPath: "数据结构 > 线性表 > 链表",
        difficulty: "MEDIUM",
        attemptCount: 8,
        correctCount: 6,
        totalTimeMs: 200_000,
        createdById: teacher.id,
      },
      {
        id: PQ2C4,
        courseId: course2.id,
        type: "CODE",
        stem: "读入一个整数 n，输出 1 到 n 的和（n≥1）。",
        optionsJson: null,
        answerJson: JSON.stringify({
          language: "python",
          cases: [
            { input: "5\n", expected: "15" },
            { input: "1\n", expected: "1" },
          ],
        }),
        explanation: "可用循环累加或 sum(range(1, n+1))。",
        tagPath: "程序设计 > 循环",
        difficulty: "MEDIUM",
        language: "python",
        attemptCount: 11,
        correctCount: 7,
        totalTimeMs: 280_000,
        createdById: teacher.id,
      },
    ],
  });

  const gradedAt = new Date(now - 2 * 24 * 3600 * 1000);
  const submittedAt = new Date(gradedAt.getTime() - 15 * 60 * 1000);

  await prisma.practiceSession.create({
    data: {
      id: PS_GRADED,
      userId: s1.id,
      courseId: course1.id,
      mode: "SMART",
      status: "GRADED",
      score: 4,
      maxScore: 5,
      submittedAt,
      gradedAt,
      items: {
        create: [
          {
            questionId: PQ1,
            orderIndex: 0,
            answerJson: JSON.stringify("b"),
            correct: true,
            score: 1,
            maxScore: 1,
            timeSpentMs: 45_000,
            resultJson: JSON.stringify({ expected: "b", yours: "b" }),
          },
          {
            questionId: PQ2,
            orderIndex: 1,
            answerJson: JSON.stringify("1"),
            correct: true,
            score: 1,
            maxScore: 1,
            timeSpentMs: 30_000,
          },
          {
            questionId: PQ6,
            orderIndex: 2,
            answerJson: JSON.stringify("a"),
            correct: false,
            score: 0,
            maxScore: 1,
            timeSpentMs: 90_000,
            resultJson: JSON.stringify({ expected: "b", yours: "a" }),
          },
          {
            questionId: PQ8,
            orderIndex: 3,
            answerJson: JSON.stringify("b"),
            correct: false,
            score: 0,
            maxScore: 1,
            timeSpentMs: 120_000,
            resultJson: JSON.stringify({ expected: "c", yours: "b" }),
          },
          {
            questionId: PQ4,
            orderIndex: 4,
            answerJson: JSON.stringify(pySumCode),
            correct: true,
            score: 1,
            maxScore: 1,
            timeSpentMs: 180_000,
            resultJson: JSON.stringify({
              cases: [
                { input: "3 5\n", expected: "8", got: "8", pass: true },
                { input: "10 20\n", expected: "30", got: "30", pass: true },
              ],
            }),
          },
        ],
      },
    },
  });

  await prisma.practiceSession.create({
    data: {
      id: PS_IN_PROGRESS,
      userId: s2.id,
      courseId: course1.id,
      mode: "BY_TAG",
      tagFilter: "数据结构 > 树",
      status: "IN_PROGRESS",
      maxScore: 3,
      items: {
        create: [
          {
            questionId: PQ6,
            orderIndex: 0,
            answerJson: JSON.stringify("b"),
            timeSpentMs: 60_000,
          },
          {
            questionId: PQ12,
            orderIndex: 1,
            timeSpentMs: 20_000,
          },
          {
            questionId: PQ16,
            orderIndex: 2,
            timeSpentMs: 10_000,
          },
        ],
      },
    },
  });

  await prisma.wrongBookEntry.createMany({
    data: [
      {
        userId: s1.id,
        courseId: course1.id,
        practiceQuestionId: PQ6,
        title: "二叉树前序遍历",
        content: "误选「左-根-右」，正确为根-左-右。",
        mastered: false,
      },
      {
        userId: s1.id,
        courseId: course1.id,
        practiceQuestionId: PQ8,
        title: "快排最坏复杂度",
        content: "误选 O(n log n)，最坏为 O(n²)。",
        mastered: false,
      },
      {
        userId: s1.id,
        courseId: course1.id,
        practiceQuestionId: PQ13,
        title: "递归两要素",
        content: "上次练习未完整写出基准情况与递归关系。",
        mastered: false,
      },
      {
        userId: s2.id,
        courseId: course1.id,
        practiceQuestionId: PQ3,
        title: "栈 LIFO",
        content: "简答题未写清应用场景。",
        mastered: true,
      },
    ],
  });

  await prisma.practiceQuestionFeedback.createMany({
    data: [
      {
        id: PF_PENDING,
        questionId: PQ6,
        courseId: course1.id,
        userId: s2.id,
        type: "UNCLEAR",
        description: "题干里的「前序」能否补充一个小图示？初学者容易和中序混淆。",
        status: "PENDING",
      },
      {
        id: PF_PENDING2,
        questionId: PQ8,
        courseId: course1.id,
        userId: s1.id,
        type: "TOO_HARD",
        description: "快排最坏情况课堂还没讲，建议标为选做或降低难度。",
        status: "PENDING",
      },
      {
        id: PF_CLOSED,
        questionId: PQ2,
        courseId: course1.id,
        userId: s3.id,
        type: "ANSWER_ERROR",
        description: "填空是否应写 O(1) 而不是 1？",
        status: "CLOSED",
        teacherReply: "评分支持写 1 或 O(1)；解析中已说明为 O(1)。",
        resolvedById: teacher.id,
        resolvedAt: new Date(now - 1 * 24 * 3600 * 1000),
      },
    ],
  });

  await prisma.practiceQuestion.updateMany({
    where: {
      courseId: { in: practiceCourseIds },
      OR: [{ explanation: null }, { explanation: "" }],
    },
    data: {
      explanation:
        "本题暂无详细解析。请结合课堂讲义复习相关知识点；若仍有疑问，可在题目下方提交反馈。",
    },
  });

  console.log("Seed OK — 演示数据已写入（可重复执行）。");
  console.log(`  管理员: admin@demo.local / ${DEMO_PASSWORD}`);
  console.log(`  教师: teacher@demo.local / ${DEMO_PASSWORD}`);
  console.log(`  学生: student@demo.local（张三）、li@demo.local（李四）、wang@demo.local（王五） / ${DEMO_PASSWORD}`);
  console.log("  课程一:", course1.title, course1.id);
  console.log("  课程二:", course2.title, course2.id);
  console.log("  班级:", cls.name);
  console.log("  实验集（课一）:");
  console.log("    进行中 AUTO:", labSet1.id, labSet1.title);
  console.log("    未开始 BLOCK:", labSet3.id, labSet3.title);
  console.log("    提醒演示 (~90min):", labSet4.id, labSet4.title);
  console.log("    手动批改 MANUAL:", labSetManual.id, labSetManual.title);
  console.log("  实验集（课二）补交中:", labSet2.id, labSet2.title);
  console.log("  提交: 含 FILE 上传文件（backend/uploads/submissions/）；王五手动批改待审");
  console.log("  讨论: Hello 题问答 + A+B 置顶帖；实验提醒站内信已写入");
  console.log("  练习: 课程一 16 题 + 课程二 4 题；张三已批改练习、错题本；教师端 2 条待处理反馈");
  console.log("  已生成课程资料与实验附件文件：backend/uploads 下");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
