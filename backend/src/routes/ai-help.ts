import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";

function makeHint(payload: {
  labTitle: string;
  labDesc?: string | null;
  language: string;
  visibleTestcases: Array<{ input: string; expected: string }>;
  question: string;
}) {
  const examples = payload.visibleTestcases.slice(0, 2);
  const exText =
    examples.length === 0
      ? "本实验暂无公开样例用例。"
      : examples
          .map((t, i) => `样例${i + 1} 输入：${JSON.stringify(t.input)}，期望输出：${JSON.stringify(t.expected)}`)
          .join("\n");

  const langTips =
    payload.language === "python"
      ? [
          "Python：注意 input() 可能读到空行；多行输入可用 sys.stdin.read()。",
          "输出：使用 print，避免多余空格与额外提示文本。",
        ]
      : [
          "JavaScript(Node)：使用 fs.readFileSync(0,'utf8') 读取 stdin。",
          "输出：使用 console.log，避免多余空格与额外提示文本。",
        ];

  return {
    answer: [
      `【实验】${payload.labTitle}`,
      payload.labDesc ? `【说明】${payload.labDesc}` : "",
      `【你的问题】${payload.question}`,
      "",
      "【解题思路】",
      "- 先把输入解析成题目要求的数据结构，再按题意计算并输出。",
      "- 先用公开样例手动推导一遍，确保理解输入/输出格式。",
      "",
      "【样例提示】",
      exText,
      "",
      "【常见坑】",
      "- 输出必须与期望完全一致（不要打印调试文字）。",
      "- 注意末尾换行与空格；建议输出后只带一个换行。",
      ...langTips.map((x) => `- ${x}`),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

const aiHelpRoutes: FastifyPluginAsync = async (app) => {
  app.post("/labs/:labId/ai-help", { preHandler: authRequired() }, async (req, reply) => {
    const { labId } = req.params as { labId: string };
    const body = z.object({ question: z.string().min(1).max(800) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const lab = await prisma.lab.findUnique({
      where: { id: labId },
      include: { course: true, testCases: { where: { hidden: false } } },
    });
    if (!lab) return reply.code(404).send({ error: "实验不存在" });

    // 权限：教师/管理员/已选课学生
    if (req.auth!.role !== "ADMIN" && lab.course.teacherId !== req.auth!.sub) {
      const en = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: req.auth!.sub, courseId: lab.courseId } },
      });
      if (!en) return reply.code(403).send({ error: "未选课" });
    }

    return makeHint({
      labTitle: lab.title,
      labDesc: lab.description,
      language: lab.language,
      visibleTestcases: lab.testCases.map((t) => ({ input: t.input, expected: t.expected })),
      question: body.data.question,
    });
  });
};

export default aiHelpRoutes;

