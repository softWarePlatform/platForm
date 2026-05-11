/**
 * 演示数据（可重复执行）：多用户、两门课程、班级、实验与评测用例、作业与批改、讨论区、示例提交。
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
const LAB_HELLO = "00000000-0000-4000-8000-000000000010";
const LAB_APB = "00000000-0000-4000-8000-000000000011";
const LAB_P42 = "00000000-0000-4000-8000-000000000012";
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

  const course1 = await prisma.course.upsert({
    where: { id: CID1 },
    update: { title: "程序设计基础（演示）" },
    create: {
      id: CID1,
      title: "程序设计基础（演示）",
      description: "涵盖 JavaScript 输出与 Python A+B；含作业与成绩册演示数据。",
      category: "程序设计",
      published: true,
      teacherId: teacher.id,
      labWeight: 0.6,
      homeworkWeight: 0.4,
    },
  });

  const course2 = await prisma.course.upsert({
    where: { id: CID2 },
    update: {},
    create: {
      id: CID2,
      title: "数据结构导论（演示）",
      description: "入门课：简单输出实验 + 思考题作业。适合与课程二联调路由与选课。",
      category: "数据结构",
      published: true,
      teacherId: teacher.id,
      labWeight: 0.5,
      homeworkWeight: 0.5,
    },
  });

  const labHello = await prisma.lab.upsert({
    where: { id: LAB_HELLO },
    update: {},
    create: {
      id: LAB_HELLO,
      courseId: course1.id,
      title: "实验一：标准输出",
      description: "输出一行 Hello。Node 下使用 console.log。",
      language: "javascript",
      starterCode: 'console.log("Hello")\n',
    },
  });

  const labApb = await prisma.lab.upsert({
    where: { id: LAB_APB },
    update: {},
    create: {
      id: LAB_APB,
      courseId: course1.id,
      title: "实验二：A+B（Python）",
      description: "读入一行两个整数，输出其和。",
      language: "python",
      starterCode: "a, b = map(int, input().split())\nprint(a + b)\n",
    },
  });

  const labP42 = await prisma.lab.upsert({
    where: { id: LAB_P42 },
    update: {},
    create: {
      id: LAB_P42,
      courseId: course2.id,
      title: "实验：整数输出",
      description: "输出整数 42。",
      language: "python",
      starterCode: "print(42)\n",
    },
  });

  await prisma.testCase.deleteMany({ where: { labId: { in: [labHello.id, labApb.id, labP42.id] } } });

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

  await prisma.courseMaterial.createMany({
    data: [
      {
        courseId: course1.id,
        title: "课程大纲（seed）",
        fileName: "syllabus.txt",
        storedPath: `courses/${course1.id}/seed_syllabus.txt`,
        mimeType: "text/plain",
        sizeBytes: 100,
        uploadedById: teacher.id,
      },
      {
        courseId: course1.id,
        title: "第一讲讲义（seed）",
        fileName: "slides.txt",
        storedPath: `courses/${course1.id}/seed_slides.txt`,
        mimeType: "text/plain",
        sizeBytes: 160,
        uploadedById: teacher.id,
      },
      {
        courseId: course2.id,
        title: "课程说明（seed）",
        fileName: "readme.txt",
        storedPath: `courses/${course2.id}/seed_readme.txt`,
        mimeType: "text/plain",
        sizeBytes: 80,
        uploadedById: teacher.id,
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

  /** 须在引用 targetClassId 的作业之前创建班级 */
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

  /** 重置本种子涉及的提交记录，避免重复跑脚本时翻倍 */
  await prisma.submission.deleteMany({
    where: { labId: { in: [labHello.id, labApb.id, labP42.id] } },
  });

  const demoSubs: Array<{
    id: string;
    labId: string;
    userId: string;
    code: string;
    status: "ACCEPTED" | "WRONG_ANSWER";
    score: number;
  }> = [
    {
      id: "00000000-0000-4000-8000-000000000201",
      labId: labHello.id,
      userId: s1.id,
      code: 'console.log("Hello")\n',
      status: "ACCEPTED",
      score: 100,
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      labId: labHello.id,
      userId: s2.id,
      code: 'console.log("Hell")\n',
      status: "WRONG_ANSWER",
      score: 0,
    },
    {
      id: "00000000-0000-4000-8000-000000000203",
      labId: labHello.id,
      userId: s3.id,
      code: 'console.log("Hello")\n',
      status: "ACCEPTED",
      score: 100,
    },
    {
      id: "00000000-0000-4000-8000-000000000211",
      labId: labApb.id,
      userId: s1.id,
      code: "a,b=map(int,input().split())\nprint(a+b)\n",
      status: "ACCEPTED",
      score: 100,
    },
    {
      id: "00000000-0000-4000-8000-000000000212",
      labId: labApb.id,
      userId: s2.id,
      code: "a,b=map(int,input().split())\nprint(a+b)\n",
      status: "ACCEPTED",
      score: 100,
    },
    {
      id: "00000000-0000-4000-8000-000000000213",
      labId: labApb.id,
      userId: s3.id,
      code: "print(0)\n",
      status: "WRONG_ANSWER",
      score: 50,
    },
    {
      id: "00000000-0000-4000-8000-000000000221",
      labId: labP42.id,
      userId: s1.id,
      code: "print(42)\n",
      status: "ACCEPTED",
      score: 100,
    },
    {
      id: "00000000-0000-4000-8000-000000000222",
      labId: labP42.id,
      userId: s2.id,
      code: "print(41)\n",
      status: "WRONG_ANSWER",
      score: 0,
    },
  ];

  for (const r of demoSubs) {
    await prisma.submission.create({
      data: {
        id: r.id,
        labId: r.labId,
        userId: r.userId,
        code: r.code,
        status: r.status,
        score: r.score,
        resultJson: JSON.stringify({ seeded: true, note: "演示数据，非真实评测结果" }),
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

  console.log("Seed OK — 演示数据已写入（可重复执行）。");
  console.log(`  管理员: admin@demo.local / ${DEMO_PASSWORD}`);
  console.log(`  教师: teacher@demo.local / ${DEMO_PASSWORD}`);
  console.log(`  学生: student@demo.local（张三）、li@demo.local（李四）、wang@demo.local（王五） / ${DEMO_PASSWORD}`);
  console.log("  课程一:", course1.title, course1.id);
  console.log("  课程二:", course2.title, course2.id);
  console.log("  班级:", cls.name);
  console.log("  已生成课程资料与实验附件文件：backend/uploads 下");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
