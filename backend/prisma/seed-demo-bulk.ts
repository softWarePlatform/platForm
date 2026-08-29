/**
 * 大规模演示数据：≥10 门课、5 教师、20 学生、每课 ≥2 作业 + ≥3 实验集、资料/题解/提交、丰富练习题库。
 */
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { seedSkippedTestCases } from "./seed-skipped-test-cases.js";

export const DEMO_PASSWORD = "Demo123456";

const SEMESTER_KEY = "2026-spring";
const SEMESTER_LABEL = "2026-2027 春季学期";

const TEACHERS = [
  { email: "teacher@demo.local", name: "张老师" },
  { email: "teacher2@demo.local", name: "李老师" },
  { email: "teacher3@demo.local", name: "王老师" },
  { email: "teacher4@demo.local", name: "刘老师" },
  { email: "teacher5@demo.local", name: "陈老师" },
] as const;

const STUDENT_NAMES = [
  "张三",
  "李四",
  "王五",
  "赵六",
  "钱七",
  "孙八",
  "周九",
  "吴十",
  "郑十一",
  "王小明",
  "李小红",
  "陈小华",
  "林小雨",
  "黄大力",
  "杨静",
  "徐志远",
  "朱丽",
  "高飞",
  "马超",
  "谢娜",
] as const;

const COURSES = [
  { code: "CS101", title: "程序设计基础", category: "程序设计", teacherIdx: 0, credits: 3 },
  { code: "CS102", title: "数据结构与算法", category: "数据结构", teacherIdx: 0, credits: 4 },
  { code: "CS201", title: "计算机组成原理", category: "计算机系统", teacherIdx: 1, credits: 3 },
  { code: "CS202", title: "操作系统概论", category: "计算机系统", teacherIdx: 1, credits: 3 },
  { code: "CS301", title: "数据库系统", category: "数据库", teacherIdx: 2, credits: 3 },
  { code: "CS302", title: "软件工程", category: "软件工程", teacherIdx: 2, credits: 2 },
  { code: "CS401", title: "计算机网络", category: "网络", teacherIdx: 3, credits: 3 },
  { code: "CS402", title: "编译原理", category: "编译", teacherIdx: 3, credits: 3 },
  { code: "CS501", title: "人工智能导论", category: "人工智能", teacherIdx: 4, credits: 2 },
  { code: "CS502", title: "机器学习基础", category: "人工智能", teacherIdx: 4, credits: 3 },
  { code: "MA101", title: "离散数学", category: "数学", teacherIdx: 0, credits: 3 },
  { code: "EN101", title: "专业英语", category: "通识", teacherIdx: 1, credits: 2 },
] as const;

let _uidSeq = 0x10000;
/** 单调递增 UUID，避免多维下标碰撞 */
function nextUid() {
  _uidSeq += 1;
  return `00000000-0000-4000-8000-${_uidSeq.toString(16).padStart(12, "0")}`;
}

type EnsureFile = (rel: string, content: string) => Promise<void>;

function studentEmail(i: number) {
  return i === 0 ? "student@demo.local" : `student${String(i + 1).padStart(2, "0")}@demo.local`;
}

function scheduleJson(courseIdx: number) {
  const day = (courseIdx % 5) + 1;
  return JSON.stringify([
    { dayOfWeek: day, periodStart: 1 + (courseIdx % 3), periodEnd: 2 + (courseIdx % 3), room: `教学楼 ${String.fromCharCode(65 + (courseIdx % 4))}${201 + courseIdx}` },
    { dayOfWeek: ((day + 2) % 7) + 1, periodStart: 5, periodEnd: 6, room: `实验楼 B${101 + (courseIdx % 5)}` },
  ]);
}

function buildPracticeQuestions(
  courseId: string,
  courseTitle: string,
  category: string,
  teacherId: string,
) {
  const tagRoot = category || courseTitle;
  const items: Array<Record<string, unknown>> = [];
  let statSeq = 0;
  const choiceStems = [
    [`${courseTitle}：下列表述正确的是？`, "b", "核心概念理解", "EASY"],
    [`关于${tagRoot}，时间复杂度 O(n log n) 常见于？`, "b", "算法分析", "MEDIUM"],
    [`${courseTitle}中「抽象」的主要作用是？`, "a", "基础概念", "EASY"],
    [`以下哪项属于${tagRoot}的典型应用？`, "c", "应用", "MEDIUM"],
  ] as const;

  for (const [stem, ans, sub, diff] of choiceStems) {
    const s = statSeq++;
    items.push({
      id: nextUid(),
      courseId,
      type: "CHOICE",
      stem,
      optionsJson: JSON.stringify([
        { id: "a", text: "隐藏实现细节、降低耦合" },
        { id: "b", text: "高效排序与分治算法" },
        { id: "c", text: "实际工程场景中的问题建模" },
        { id: "d", text: "与课程无关的硬件驱动" },
      ]),
      answerJson: JSON.stringify({ choiceId: ans }),
      explanation: `本题考查${tagRoot}中「${sub}」相关知识点，请参考课程讲义与实验说明。`,
      tagPath: `${tagRoot} > ${sub}`,
      difficulty: diff,
      attemptCount: 20 + (s % 30),
      correctCount: 12 + (s % 15),
      totalTimeMs: 180_000 + s * 1000,
      createdById: teacherId,
      answerSource: "TEACHER",
      answerConfirmed: true,
    });
  }

  const fills = [
    [`${tagRoot}中，顺序表随机访问的时间复杂度为 O(____)。`, ["1"], "线性表", "EASY"],
    [`栈的插入删除操作发生在同一端，称为 ____ 特性。`, ["LIFO", "后进先出"], "栈", "MEDIUM"],
    [`二叉树前序遍历的顺序为：____ → 左 → 右。`, ["根", "根结点"], "树", "MEDIUM"],
    [`关系数据库中，用于唯一标识元组的是 ____ 键。`, ["主", "主键"], "数据库", "EASY"],
  ] as const;

  for (const [stem, blanks, sub, diff] of fills) {
    const s = statSeq++;
    items.push({
      id: nextUid(),
      courseId,
      type: "FILL",
      stem,
      optionsJson: null,
      answerJson: JSON.stringify({ blanks }),
      explanation: `标准答案：${blanks[0]}。${sub}是${courseTitle}的重要基础。`,
      tagPath: `${tagRoot} > ${sub}`,
      difficulty: diff,
      attemptCount: 15 + (s % 20),
      correctCount: 10 + (s % 10),
      totalTimeMs: 120_000 + s * 800,
      createdById: teacherId,
      answerSource: "TEACHER",
      answerConfirmed: true,
    });
  }

  const shorts = [
    [`简述${courseTitle}中一个核心概念及其学习意义。`, "理解", "综合", "MEDIUM"],
    [`举例说明${tagRoot}在实验或作业中的应用。`, "实验", "应用", "MEDIUM"],
    [`什么是${tagRoot}中的「模块化」思想？`, "模块", "设计", "EASY"],
  ] as const;

  for (const [stem, kw, sub, diff] of shorts) {
    const s = statSeq++;
    items.push({
      id: nextUid(),
      courseId,
      type: "SHORT_ANSWER",
      stem,
      optionsJson: null,
      answerJson: JSON.stringify({ text: kw }),
      explanation: `参考答案应包含「${kw}」等要点，并结合${courseTitle}课堂内容展开。`,
      tagPath: `${tagRoot} > ${sub}`,
      difficulty: diff,
      attemptCount: 10 + (s % 15),
      correctCount: 6 + (s % 8),
      totalTimeMs: 300_000 + s * 1200,
      createdById: teacherId,
      answerSource: "TEACHER",
      answerConfirmed: true,
    });
  }

  const codeStems = [
    {
      stem: "编写程序：读入两个整数，输出它们的和。",
      code: "a, b = map(int, input().split())\nprint(a + b)",
      cases: [
        { input: "3 5\n", expected: "8" },
        { input: "10 20\n", expected: "30" },
      ],
      tag: "程序设计 > 输入输出",
    },
    {
      stem: "编写程序：读入一个整数 n，输出 1 到 n 的和。",
      code: "n = int(input())\nprint(n * (n + 1) // 2)",
      cases: [
        { input: "5\n", expected: "15" },
        { input: "10\n", expected: "55" },
      ],
      tag: `${tagRoot} > 编程练习`,
    },
    {
      stem: "编写程序：读入一行字符串，输出其长度。",
      code: 's = input()\nprint(len(s))',
      cases: [
        { input: "hello\n", expected: "5" },
        { input: "abc\n", expected: "3" },
      ],
      tag: `${tagRoot} > 字符串`,
    },
  ] as const;

  for (const c of codeStems) {
    const s = statSeq++;
    items.push({
      id: nextUid(),
      courseId,
      type: "CODE",
      stem: c.stem,
      optionsJson: null,
      answerJson: JSON.stringify({ language: "python", cases: c.cases }),
      explanation: `参考实现：\n\`\`\`python\n${c.code}\n\`\`\``,
      tagPath: c.tag,
      difficulty: "MEDIUM",
      language: "python",
      attemptCount: 25 + (s % 20),
      correctCount: 14 + (s % 12),
      totalTimeMs: 600_000 + s * 2000,
      createdById: teacherId,
      answerSource: "TEACHER",
      answerConfirmed: true,
    });
  }

  // AI 出题待确认样例（智能出题演示）
  items.push({
    id: nextUid(),
    courseId,
    type: "CHOICE",
    stem: `【AI 待确认】${courseTitle}：以下哪项最适合作为期末复习重点？`,
    optionsJson: JSON.stringify([
      { id: "a", text: "课程核心概念与实验能力" },
      { id: "b", text: "与课程无关的历史人物" },
      { id: "c", text: "未讲授的高级硬件细节" },
      { id: "d", text: "随机猜测即可" },
    ]),
    answerJson: JSON.stringify({ choiceId: "a" }),
    explanation: "AI 生成解析：应围绕课程大纲与实验/作业要求系统复习。",
    tagPath: `${tagRoot} > AI出题 > 复习`,
    difficulty: "EASY",
    attemptCount: 0,
    correctCount: 0,
    totalTimeMs: 0,
    createdById: teacherId,
    answerSource: "AI",
    answerConfirmed: false,
    auditStatus: "PENDING_REVIEW",
  });

  return items;
}

export async function seedDemoBulk(
  prisma: PrismaClient,
  opts: { uploadRoot: string; ensureFile: EnsureFile },
) {
  const { ensureFile } = opts;
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const now = Date.now();
  const D = 24 * 3600 * 1000;
  const H = 3600 * 1000;

  const admin = await prisma.user.create({
    data: {
      id: nextUid(),
      email: "admin@demo.local",
      name: "系统管理员",
      role: "ADMIN",
      passwordHash: hash,
      emailVerifiedAt: new Date(),
    },
  });

  const teachers = await Promise.all(
    TEACHERS.map((t, i) =>
      prisma.user.create({
        data: {
          id: nextUid(),
          email: t.email,
          name: t.name,
          role: "TEACHER",
          passwordHash: hash,
          emailVerifiedAt: new Date(),
          signature: `用心教学，欢迎选修我的课程。`,
        },
      }),
    ),
  );

  const students = await Promise.all(
    STUDENT_NAMES.map((name, i) =>
      prisma.user.create({
        data: {
          id: nextUid(),
          email: studentEmail(i),
          name,
          role: "STUDENT",
          passwordHash: hash,
          emailVerifiedAt: i < 8 ? new Date() : undefined,
        },
      }),
    ),
  );

  await prisma.enrollmentPeriod.create({
    data: {
      id: nextUid(),
      semesterKey: SEMESTER_KEY,
      label: SEMESTER_LABEL,
      phase: "FORMAL",
      openAt: new Date(now - 14 * D),
      closeAt: new Date(now + 60 * D),
      confirmDeadline: new Date(now + 90 * D),
    },
  });

  const practiceTags: Array<{ courseId: string; tagPath: string }> = [];
  const practiceQuestions: Array<Record<string, unknown>> = [];

  const courseRecords: Array<{
    id: string;
    title: string;
    code: string;
    teacherId: string;
    category: string;
    classId: string;
  }> = [];

  for (let ci = 0; ci < COURSES.length; ci++) {
    const def = COURSES[ci];
    const teacher = teachers[def.teacherIdx];
    const courseId = nextUid();
    const classId = nextUid();

    await prisma.course.create({
      data: {
        id: courseId,
        title: def.title,
        description: `${def.title}（${def.code}）演示课程：含作业、实验、资料、智能练习与样例提交。`,
        category: def.category,
        teacherId: teacher.id,
        published: true,
        labWeight: 0.55,
        homeworkWeight: 0.45,
        courseCode: def.code,
        credits: def.credits,
        capacity: 80,
        semesterKey: SEMESTER_KEY,
        courseNature: ci % 3 === 0 ? "REQUIRED" : "ELECTIVE",
        subjectCategory: "CORE_MAJOR",
        offeringCollegeCode: "21",
        scheduleSlotsJson: scheduleJson(ci),
        startAt: new Date(now - 30 * D),
        endAt: new Date(now + 120 * D),
        knowledgeGraphJson: JSON.stringify({
          nodes: [
            { id: "n1", label: "基础" },
            { id: "n2", label: "实验" },
            { id: "n3", label: "作业" },
          ],
          edges: [
            { from: "n1", to: "n2" },
            { from: "n1", to: "n3" },
          ],
        }),
      },
    });

    await prisma.class.create({
      data: { id: classId, courseId, name: `${def.code} 默认班` },
    });

    courseRecords.push({
      id: courseId,
      title: def.title,
      code: def.code,
      teacherId: teacher.id,
      category: def.category,
      classId,
    });

    // 选课：每生 5–7 门课
    for (let si = 0; si < students.length; si++) {
      if ((si + ci) % 3 === 0 || (si + ci * 2) % 5 === 0) {
        await prisma.enrollment.create({
          data: {
            id: nextUid(),
            userId: students[si].id,
            courseId,
            classId: si % 2 === 0 ? classId : undefined,
          },
        });
      }
    }

    // 公告
    await prisma.courseAnnouncement.create({
      data: {
        id: nextUid(),
        courseId,
        authorId: teacher.id,
        title: `${def.title} · 开课说明`,
        content: `欢迎选修 **${def.title}**（${def.code}）。\n\n- 请按时完成实验与作业\n- 课件与题解见「课程资料」\n- 智能练习见课程「练习」页`,
        pinned: true,
      },
    });
    await prisma.courseAnnouncement.create({
      data: {
        id: nextUid(),
        courseId,
        authorId: teacher.id,
        title: `第 ${(ci % 8) + 1} 周学习提醒`,
        content: "本周请完成实验集一与作业一；有问题在答疑区发帖。",
        pinned: false,
      },
    });

    // 课程资料 + 题解文件
    const matSylPath = `courses/${courseId}/syllabus.txt`;
    const matSlidesPath = `courses/${courseId}/slides_week1.txt`;
    const matSolutionPath = `courses/${courseId}/homework_solution_guide.txt`;
    await ensureFile(matSylPath, `【${def.code} ${def.title}】教学大纲\n\n学分：${def.credits}\n学期：${SEMESTER_LABEL}\n`);
    await ensureFile(matSlidesPath, `【${def.title}】第1周讲义\n\n1. 课程目标\n2. 实验安排\n3. 作业说明\n`);
    await ensureFile(
      matSolutionPath,
      `【${def.title}】作业参考题解\n\n作业一：结合课堂笔记阐述核心概念（不少于200字）。\n作业二：见实验样例与评分标准。\n`,
    );

    const matGroup1 = nextUid();
    const matGroup2 = nextUid();
    const matGroup3 = nextUid();
    await prisma.courseMaterial.createMany({
      data: [
        {
          id: matGroup1,
          courseId,
          title: "教学大纲",
          fileName: "syllabus.txt",
          storedPath: matSylPath,
          mimeType: "text/plain",
          sizeBytes: 256,
          uploadedById: teacher.id,
          folderPath: "00-大纲",
          pinned: true,
          groupId: matGroup1,
          version: 1,
          isCurrent: true,
        },
        {
          id: matGroup2,
          courseId,
          title: "第1周讲义",
          fileName: "slides_week1.txt",
          storedPath: matSlidesPath,
          mimeType: "text/plain",
          sizeBytes: 320,
          uploadedById: teacher.id,
          folderPath: "第1周/课件",
          groupId: matGroup2,
          version: 1,
          isCurrent: true,
        },
        {
          id: matGroup3,
          courseId,
          title: "作业题解参考",
          fileName: "homework_solution_guide.txt",
          storedPath: matSolutionPath,
          mimeType: "text/plain",
          sizeBytes: 400,
          uploadedById: teacher.id,
          folderPath: "题解与参考",
          groupId: matGroup3,
          version: 1,
          isCurrent: true,
        },
      ],
    });

    // 2 份作业 + 附件
    const hwIds = [nextUid(), nextUid()];
    const hwAttachPaths = [
      `homework/${hwIds[0]}/requirements.txt`,
      `homework/${hwIds[1]}/rubric.txt`,
    ];
    await ensureFile(
      hwAttachPaths[0],
      `【${def.title}】作业一要求\n\n主题：在线学习心得\n字数：不少于 150 字\n提交：富文本\n`,
    );
    await ensureFile(
      hwAttachPaths[1],
      `【${def.title}】作业二评分标准\n\n满分 100：概念 40 + 举例 30 + 表达 30\n`,
    );

    const due1 = new Date(now + (5 + ci) * D);
    const due2 = new Date(now + (12 + ci) * D);

    await prisma.homework.create({
      data: {
        id: hwIds[0],
        courseId,
        title: `作业一：${def.title}学习心得`,
        description: "结合实验与课堂内容，撰写不少于 150 字的学习体会。",
        descriptionMd: `## 作业一\n\n结合 **${def.title}** 实验与课堂内容撰写心得（≥150 字）。`,
        dueAt: due1,
        published: true,
        publishedAt: new Date(now - 3 * D),
        allowLate: true,
        latePenaltyPercentPerDay: 10,
        lateMaxDays: 7,
        answerMode: "RICH_TEXT",
        attachments: {
          create: {
            id: nextUid(),
            fileName: "requirements.txt",
            storedPath: hwAttachPaths[0],
            mimeType: "text/plain",
            sizeBytes: 180,
          },
        },
      },
    });

    await prisma.homework.create({
      data: {
        id: hwIds[1],
        courseId,
        targetClassId: classId,
        title: `作业二：${def.category}综合练习`,
        description: "按评分标准完成综合分析，可附图或附件。",
        dueAt: due2,
        published: true,
        publishedAt: new Date(now - 2 * D),
        allowLate: true,
        latePenaltyPercentPerDay: 5,
        answerMode: "RICH_TEXT_OR_FILE",
        attachments: {
          create: {
            id: nextUid(),
            fileName: "rubric.txt",
            storedPath: hwAttachPaths[1],
            mimeType: "text/plain",
            sizeBytes: 120,
          },
        },
      },
    });

    // 作业提交样例
    const enrolledHere = students.filter((_, si) => (si + ci) % 3 === 0 || (si + ci * 2) % 5 === 0);
    for (let ei = 0; ei < Math.min(8, enrolledHere.length); ei++) {
      const stu = enrolledHere[ei];
      const subId = nextUid();
      const graded = ei % 3 !== 2;
      const hwFilePath = `homework/${subId}/answer.txt`;
      await ensureFile(
        hwFilePath,
        `${stu.name} 的作业二作答：\n\n我认为 ${def.title} 的核心在于理论与实践结合……（演示提交）\n`,
      );
      await prisma.homeworkSubmission.create({
        data: {
          id: subId,
          homeworkId: hwIds[ei % 2],
          userId: stu.id,
          content: `${stu.name} 完成了《${def.title}》作业，已结合实验内容撰写学习体会。（演示数据）`,
          score: graded ? 75 + (ei % 20) : null,
          feedback: graded ? "表述清晰，可再补充实验细节。" : null,
          graded,
          released: graded && ei % 2 === 0,
          locked: graded,
          submittedAt: new Date(now - (ei + 1) * D),
          files:
            ei % 2 === 1
              ? {
                  create: {
                    id: nextUid(),
                    fileName: "answer.txt",
                    storedPath: hwFilePath,
                    mimeType: "text/plain",
                    sizeBytes: 200,
                  },
                }
              : undefined,
        },
      });
    }

    // 3 个实验集，每集至少 1 道题
    const labSetDefs = [
      {
        title: "第1周 基础实验",
        offset: -7,
        dueOffset: 7,
        makeup: false,
        judgeMode: "AUTO" as const,
      },
      {
        title: "第2周 进阶实验",
        offset: -3,
        dueOffset: 14,
        makeup: true,
        judgeMode: "AUTO" as const,
      },
      {
        title: "第3周 综合实验",
        offset: 3,
        dueOffset: 21,
        makeup: false,
        judgeMode: ci % 4 === 0 ? ("MANUAL" as const) : ("AUTO" as const),
      },
    ];

    for (let li = 0; li < labSetDefs.length; li++) {
      const lsDef = labSetDefs[li];
      const labSetId = nextUid();
      await prisma.labSet.create({
        data: {
          id: labSetId,
          courseId,
          title: lsDef.title,
          description: `${def.title} · ${lsDef.title}（演示）`,
          startAt: new Date(now + lsDef.offset * D),
          dueAt: new Date(now + lsDef.dueOffset * D),
          allowMakeup: lsDef.makeup,
          makeupDueAt: lsDef.makeup ? new Date(now + (lsDef.dueOffset + 5) * D) : null,
          outsideAccessMode: "BLOCK",
          judgeMode: lsDef.judgeMode,
          allowedLanguages: ["python", "javascript"],
          allowedFileExtensions: [".py", ".js", ".txt"],
          sortOrder: li,
        },
      });

      const labDefs = [
        {
          title: "标准输出 Hello",
          lang: "javascript",
          starter: 'console.log("Hello")\n',
          expected: "Hello",
          input: "",
        },
        {
          title: "A+B 整数求和",
          lang: "python",
          starter: "a, b = map(int, input().split())\nprint(a + b)\n",
          expected: "8",
          input: "3 5\n",
          extraCases: [{ input: "10 20\n", expected: "30", hidden: true }],
        },
      ];

      const labsToCreate = li === 0 ? labDefs : [labDefs[li % labDefs.length]];

      for (let lj = 0; lj < labsToCreate.length; lj++) {
        const ld = labsToCreate[lj];
        const labId = nextUid();
        await prisma.lab.create({
          data: {
            id: labId,
            courseId,
            labSetId,
            title: `${lsDef.title} · ${ld.title}`,
            description: `${def.title} 实验题：${ld.title}`,
            descriptionMd: `## ${ld.title}\n\n课程：${def.title}\n\n请按要求提交代码。`,
            language: ld.lang,
            starterCode: ld.starter,
          },
        });

        const hintPath = `labs/${labId}/hint.txt`;
        const samplePath = `labs/${labId}/sample_io.txt`;
        await ensureFile(hintPath, `【题解提示】${ld.title}\n期望输出：${ld.expected}\n`);
        await ensureFile(samplePath, ld.input ? `样例输入：\n${ld.input}期望：${ld.expected}\n` : `期望输出：${ld.expected}\n`);

        await prisma.labFile.createMany({
          data: [
            {
              id: nextUid(),
              labId,
              title: "题解提示",
              fileName: "hint.txt",
              storedPath: hintPath,
              mimeType: "text/plain",
              sizeBytes: 80,
              uploadedById: teacher.id,
            },
            {
              id: nextUid(),
              labId,
              title: "样例说明",
              fileName: "sample_io.txt",
              storedPath: samplePath,
              mimeType: "text/plain",
              sizeBytes: 60,
              uploadedById: teacher.id,
            },
          ],
        });

        await prisma.testCase.create({
          data: {
            id: nextUid(),
            labId,
            input: ld.input,
            expected: ld.expected,
            hidden: false,
            weight: 1,
          },
        });
        if (ld.extraCases) {
          for (let tc = 0; tc < ld.extraCases.length; tc++) {
            const ec = ld.extraCases[tc];
            await prisma.testCase.create({
              data: {
                id: nextUid(),
                labId,
                input: ec.input,
                expected: ec.expected,
                hidden: ec.hidden ?? false,
                weight: 1,
              },
            });
          }
        }

        // 实验提交
        for (let ei = 0; ei < Math.min(5, enrolledHere.length); ei++) {
          const stu = enrolledHere[ei];
          const subId = nextUid();
          const ok = ei % 4 !== 3;
          const code =
            ld.lang === "python"
              ? ok
                ? "a, b = map(int, input().split())\nprint(a + b)\n"
                : "print(0)\n"
              : ok
                ? 'console.log("Hello")\n'
                : 'console.log("Hell")\n';
          const filePath = `submissions/${subId}/main.${ld.lang === "python" ? "py" : "js"}`;
          await ensureFile(filePath, code);
          const isManual = lsDef.judgeMode === "MANUAL";
          await prisma.submission.create({
            data: {
              id: subId,
              labId,
              userId: stu.id,
              submissionKind: ei % 2 === 0 ? "FILE" : "CODE",
              language: ld.lang,
              code: ei % 2 === 0 ? "" : code,
              fileName: ei % 2 === 0 ? `main.${ld.lang === "python" ? "py" : "js"}` : null,
              fileStoredPath: ei % 2 === 0 ? filePath : null,
              status: isManual && ei === 2 ? "PENDING_REVIEW" : ok ? "ACCEPTED" : "WRONG_ANSWER",
              score: isManual && ei === 2 ? null : ok ? 100 : 0,
              teacherComment: isManual && ei === 2 ? null : ok ? "通过" : "输出不符",
              gradedById: !isManual && ok ? teacher.id : undefined,
              gradedAt: !isManual && ok ? new Date(now - ei * H) : undefined,
            },
          });
        }
      }
    }

    // 练习题库
    const pq = buildPracticeQuestions(courseId, def.title, def.category, teacher.id);
    practiceQuestions.push(...pq);
    for (const tag of new Set(pq.map((q) => String(q.tagPath)).filter(Boolean))) {
      practiceTags.push({ courseId, tagPath: tag });
    }
  }

  await prisma.practiceQuestion.createMany({ data: practiceQuestions as never[] });
  await prisma.practiceKnowledgeTag.createMany({
    data: practiceTags.map((t, i) => ({ id: nextUid(), ...t })),
    skipDuplicates: true,
  });

  // 学生练习会话样例（张三、李四）
  const c0 = courseRecords[0];
  const pqSample = practiceQuestions.filter((q) => q.courseId === c0.id).slice(0, 5);
  if (pqSample.length >= 3) {
    const sessionId = nextUid();
    await prisma.practiceSession.create({
      data: {
        id: sessionId,
        userId: students[0].id,
        courseId: c0.id,
        mode: "SMART",
        status: "GRADED",
        score: 80,
        maxScore: 100,
        submittedAt: new Date(now - 2 * D),
        gradedAt: new Date(now - 2 * D + H),
        items: {
          create: pqSample.slice(0, 3).map((q, i) => ({
            id: nextUid(),
            questionId: String(q.id),
            orderIndex: i,
            answerJson: JSON.stringify(
              q.type === "CHOICE" ? { choiceId: "b" } : q.type === "FILL" ? { blanks: ["1"] } : { text: "演示作答" },
            ),
            correct: i !== 2,
            score: i !== 2 ? 33.3 : 0,
            maxScore: 33.4,
            timeSpentMs: 60_000 + i * 15_000,
          })),
        },
      },
    });

    await prisma.wrongBookEntry.create({
      data: {
        id: nextUid(),
        userId: students[0].id,
        courseId: c0.id,
        practiceQuestionId: String(pqSample[2].id),
        title: String(pqSample[2].stem).slice(0, 80),
        content: "智能练习错题：需复习相关知识点后重练。",
      },
    });

    await prisma.practiceQuestionFeedback.create({
      data: {
        id: nextUid(),
        questionId: String(pqSample[1].id),
        courseId: c0.id,
        userId: students[1].id,
        type: "UNCLEAR",
        description: "题干能否再举一个与实验相关的例子？",
        status: "PENDING",
      },
    });
  }

  // 讨论帖
  await prisma.discussionPost.create({
    data: {
      id: nextUid(),
      courseId: c0.id,
      userId: teachers[0].id,
      title: "答疑区使用说明",
      body: "实验与作业问题请发答疑帖，注明课程与实验集名称。",
    },
  });

  await seedSkippedTestCases(prisma, {
    ensureFile,
    now,
    D,
    H,
    semesterKey: SEMESTER_KEY,
    semesterLabel: SEMESTER_LABEL,
    cs101: c0,
    students,
    teachers,
  });

  console.log("\n========== 演示数据已生成 ==========");
  console.log(`管理员: admin@demo.local / ${DEMO_PASSWORD}`);
  console.log(`教师 (${teachers.length}): ${TEACHERS.map((t) => t.email).join(", ")} / ${DEMO_PASSWORD}`);
  console.log(`学生 (${students.length}): student@demo.local, student02@demo.local … student20@demo.local / ${DEMO_PASSWORD}`);
  console.log(`课程 (${courseRecords.length}): ${courseRecords.map((c) => c.code).join(", ")}`);
  console.log(`每课: 2 作业 + 3 实验集（含题解附件）+ 资料 + ≥15 练习题`);
  console.log("上传目录: backend/uploads（courses / labs / homework / submissions）");
  console.log("====================================\n");

  return { admin, teachers, students, courses: courseRecords };
}
