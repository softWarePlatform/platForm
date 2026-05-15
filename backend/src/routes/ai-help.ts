import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/authGuard.js";
import { config } from "../lib/config.js";
import { mapLlmErrorToPublicMessage, openaiChatCompletion, type ChatMessage } from "../lib/openai-chat.js";
import { prisma } from "../lib/prisma.js";

const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(12_000),
});

const bodySchema = z
  .object({
    /** 兼容旧前端：单轮提问 */
    question: z.string().max(4000).optional(),
    /** 多轮：仅 user / assistant，须以 user 开头 */
    messages: z.array(chatTurnSchema).max(32).optional(),
  })
  .refine(
    (d) => {
      const q = d.question?.trim();
      const hasM = d.messages && d.messages.length > 0;
      return hasM || !!q;
    },
    { message: "messages 或 question 必填其一" },
  )
  .refine(
    (d) => {
      if (!d.messages?.length) return true;
      return d.messages[0].role === "user";
    },
    { message: "messages 须以 user 消息开头" },
  );

function normalizeTurns(data: z.infer<typeof bodySchema>): { role: "user" | "assistant"; content: string }[] {
  if (data.messages?.length) {
    return data.messages
      .map((m) => ({ role: m.role, content: m.content.trim() }))
      .filter((m) => m.content.length > 0);
  }
  return [{ role: "user", content: data.question!.trim() }];
}

function lastUserContent(turns: { role: "user" | "assistant"; content: string }[]): string {
  const u = [...turns].reverse().find((m) => m.role === "user");
  return u?.content ?? turns[turns.length - 1]?.content ?? "";
}

function buildSystemPrompt(lab: {
  title: string;
  descriptionMd: string | null;
  description: string | null;
  language: string;
  testCases: { input: string; expected: string; hidden: boolean }[];
}): string {
  const desc = (lab.descriptionMd ?? lab.description ?? "").slice(0, 12_000);
  const visible = lab.testCases.filter((t) => !t.hidden);
  const exBlock =
    visible.length === 0
      ? "公开样例：无。"
      : visible
          .slice(0, 8)
          .map(
            (t, i) =>
              `样例${i + 1} 输入：${JSON.stringify(t.input)}\n样例${i + 1} 期望输出：${JSON.stringify(t.expected)}`,
          )
          .join("\n\n");

  return [
    "你是编程实验课助教，用中文回答（除非学生明确使用其他语言）。",
    "",
    "【硬性约束】",
    "- 不得透露、猜测或要求学生使用任何隐藏测试用例的具体输入或期望输出。",
    "- 仅可依据下方「题目与公开样例」及你与学生的对话作答。",
    "- 不要直接给出可提交的完整题解代码；以思路、伪代码、小片段或调试建议为主。",
    "",
    `【题目】${lab.title}`,
    "",
    "【题目说明 / 题干】",
    desc || "（无文字说明）",
    "",
    `【允许语言】：${lab.language}`,
    "",
    "【公开样例（仅供说明 I/O 格式）】",
    exBlock,
  ].join("\n");
}

function makeTemplateAnswer(payload: {
  labTitle: string;
  labDesc?: string | null;
  language: string;
  visibleTestcases: Array<{ input: string; expected: string }>;
  question: string;
}): string {
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

  return [
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
    .join("\n");
}

const aiHelpRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: config.aiRouteRateLimitMaxPerMinute,
      timeWindow: "1 minute",
    });

    scope.post("/labs/:labId/ai-help", { preHandler: authRequired() }, async (req, reply) => {
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten().formErrors.join("；") || "参数无效" });
      }

      const { labId } = req.params as { labId: string };
      const lab = await prisma.lab.findUnique({
        where: { id: labId },
        include: { course: true, testCases: { where: { hidden: false } } },
      });
      if (!lab) return reply.code(404).send({ error: "实验不存在" });

      if (req.auth!.role !== "ADMIN" && lab.course.teacherId !== req.auth!.sub) {
        const en = await prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: req.auth!.sub, courseId: lab.courseId } },
        });
        if (!en) return reply.code(403).send({ error: "未选课" });
      }

      const turns = normalizeTurns(parsed.data);
      if (turns.length === 0) {
        return reply.code(400).send({ error: "有效对话内容为空" });
      }

      const visible = lab.testCases.map((t) => ({ input: t.input, expected: t.expected }));
      const labDesc = lab.descriptionMd ?? lab.description;
      const templateQuestion = lastUserContent(turns);

      if (!config.openaiApiKey) {
        const answer = makeTemplateAnswer({
          labTitle: lab.title,
          labDesc,
          language: lab.language,
          visibleTestcases: visible,
          question: templateQuestion,
        });
        return {
          answer,
          source: "template" as const,
          model: null,
          notice: "未配置 OPENAI_API_KEY（或 DEEPSEEK_API_KEY），已使用本地规则提示。",
        };
      }

      const system = buildSystemPrompt(lab);
      const apiMessages: ChatMessage[] = [
        { role: "system", content: system },
        ...turns.map((t) => ({ role: t.role, content: t.content })),
      ];

      try {
        const { content, rawRequestId } = await openaiChatCompletion({
          baseUrl: config.openaiBaseUrl,
          apiKey: config.openaiApiKey,
          model: config.openaiModel,
          messages: apiMessages,
          timeoutMs: config.aiTimeoutMs,
          maxTokens: config.aiMaxTokens,
        });
        req.log.info(
          { labId, model: config.openaiModel, upstreamRequestId: rawRequestId },
          "ai-help llm ok",
        );
        return {
          answer: content,
          source: "llm" as const,
          model: config.openaiModel,
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message.slice(0, 500) : String(err);
        req.log.warn({ labId, err: detail, requestId: req.id }, "ai-help llm failed");
        return reply.code(503).send({ error: mapLlmErrorToPublicMessage(err) });
      }
    });
  });
};

export default aiHelpRoutes;
