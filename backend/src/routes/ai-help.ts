import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/authGuard.js";
import { config } from "../lib/config.js";
import {
  buildAttachmentContextBlock,
  buildSubmissionContextBlock,
  LAB_AI_ATTACHMENT_TITLE_PREFIX,
} from "../lib/lab-ai-context.js";
import { mapLlmErrorToPublicMessage, openaiChatCompletion, type ChatMessage } from "../lib/openai-chat.js";
import { prisma } from "../lib/prisma.js";
import { saveLabFile } from "../lib/uploads.js";

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
    /** 注入该次提交的代码与评测结果 */
    submissionId: z.string().uuid().optional(),
    /** 本会话上传的 LabFile（AI 会话附件） */
    attachmentIds: z.array(z.string().uuid()).max(5).optional(),
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

const AI_ATTACH_MAX_BYTES = 2 * 1024 * 1024;
const AI_ATTACH_EXT = new Set([
  ".txt",
  ".py",
  ".js",
  ".ts",
  ".java",
  ".cpp",
  ".c",
  ".h",
  ".md",
  ".json",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
]);

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

function buildSystemPrompt(
  lab: {
    title: string;
    descriptionMd: string | null;
    description: string | null;
    language: string;
    testCases: { input: string; expected: string; hidden: boolean }[];
  },
  extraBlocks: string[],
): string {
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
    "- 仅可依据下方「题目与公开样例」、学生提交与评测信息（若有）及你与学生的对话作答。",
    "- 不要直接给出可提交的完整题解代码；以思路、伪代码、小片段或调试建议为主。",
    "- 分析提交时：指出可疑逻辑/边界问题，结合评测结果解释 WA/TLE/RE 等，并给出可操作的修改方向。",
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
    ...extraBlocks.filter((b) => b.trim().length > 0),
  ].join("\n");
}

function makeTemplateAnswer(payload: {
  labTitle: string;
  labDesc?: string | null;
  language: string;
  visibleTestcases: Array<{ input: string; expected: string }>;
  question: string;
  submissionHint?: string | null;
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
    payload.submissionHint ? `\n${payload.submissionHint}` : "",
    "",
    "【解题思路】",
    "- 先把输入解析成题目要求的数据结构，再按题意计算并输出。",
    "- 先用公开样例手动推导一遍，确保理解输入/输出格式。",
    "- 若评测未通过：对照 resultJson 中失败用例（公开部分）检查输出格式、边界与算法复杂度。",
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

async function assertLabAccess(
  userId: string,
  role: string,
  lab: { courseId: string; course: { teacherId: string } },
): Promise<boolean> {
  if (role === "ADMIN" || lab.course.teacherId === userId) return true;
  const en = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: lab.courseId } },
  });
  return !!en;
}

const aiHelpRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: config.aiRouteRateLimitMaxPerMinute,
      timeWindow: "1 minute",
    });

    /** AI 会话附件（文本/图片等），仅存 LabFile 且 title 带前缀，供当次 ai-help 引用 */
    scope.post(
      "/labs/:labId/ai-help/attachments",
      { preHandler: authRequired() },
      async (req, reply) => {
        const { labId } = req.params as { labId: string };
        const lab = await prisma.lab.findUnique({
          where: { id: labId },
          include: { course: true },
        });
        if (!lab) return reply.code(404).send({ error: "实验不存在" });
        if (!(await assertLabAccess(req.auth!.sub, req.auth!.role, lab))) {
          return reply.code(403).send({ error: "未选课" });
        }

        const parts = (req as { parts: () => AsyncIterable<{ type: string; fieldname: string; filename?: string; mimetype?: string; toBuffer: () => Promise<Buffer> }> }).parts();
        let fileBuf: Buffer | null = null;
        let origName = "file.bin";
        let mime = "application/octet-stream";

        for await (const part of parts) {
          if (part.type === "file" && part.fieldname === "file") {
            origName = part.filename ?? origName;
            mime = part.mimetype ?? mime;
            fileBuf = await part.toBuffer();
          }
        }
        if (!fileBuf) return reply.code(400).send({ error: "请使用 multipart，字段名 file 上传文件" });
        if (fileBuf.length > AI_ATTACH_MAX_BYTES) {
          return reply.code(400).send({ error: "附件不能超过 2MB" });
        }
        const ext = origName.includes(".") ? origName.slice(origName.lastIndexOf(".")).toLowerCase() : "";
        if (ext && !AI_ATTACH_EXT.has(ext)) {
          return reply.code(400).send({
            error: `不支持的扩展名，允许：${[...AI_ATTACH_EXT].join(" ")}`,
          });
        }

        const { storedPath, fileName } = await saveLabFile(labId, origName, fileBuf);
        const row = await prisma.labFile.create({
          data: {
            labId,
            title: `${LAB_AI_ATTACHMENT_TITLE_PREFIX}${origName}`,
            fileName,
            storedPath,
            mimeType: mime,
            sizeBytes: fileBuf.length,
            uploadedById: req.auth!.sub,
          },
        });
        return {
          attachment: {
            id: row.id,
            fileName: row.fileName,
            sizeBytes: row.sizeBytes,
          },
        };
      },
    );

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

      if (!(await assertLabAccess(req.auth!.sub, req.auth!.role, lab))) {
        return reply.code(403).send({ error: "未选课" });
      }

      const turns = normalizeTurns(parsed.data);
      if (turns.length === 0) {
        return reply.code(400).send({ error: "有效对话内容为空" });
      }

      const extraBlocks: string[] = [];
      if (parsed.data.submissionId) {
        const subBlock = await buildSubmissionContextBlock({
          labId,
          submissionId: parsed.data.submissionId,
          userId: req.auth!.sub,
          role: req.auth!.role,
        });
        if (subBlock) extraBlocks.push(subBlock);
      }
      if (parsed.data.attachmentIds?.length) {
        const attachBlock = await buildAttachmentContextBlock({
          labId,
          userId: req.auth!.sub,
          attachmentIds: parsed.data.attachmentIds,
        });
        if (attachBlock) extraBlocks.push(attachBlock);
      }

      const visible = lab.testCases.map((t) => ({ input: t.input, expected: t.expected }));
      const labDesc = lab.descriptionMd ?? lab.description;
      const templateQuestion = lastUserContent(turns);
      const submissionHint = parsed.data.submissionId
        ? extraBlocks.some((b) => b.includes("【学生本次提交"))
          ? "【已载入你的提交与评测结果，请结合上文分析。】"
          : "【未找到有效提交记录，将仅根据题目回答。】"
        : null;

      if (!config.openaiApiKey) {
        const answer = makeTemplateAnswer({
          labTitle: lab.title,
          labDesc,
          language: lab.language,
          visibleTestcases: visible,
          question: templateQuestion,
          submissionHint,
        });
        return {
          answer,
          source: "template" as const,
          model: null,
          notice: "未配置 OPENAI_API_KEY（或 DEEPSEEK_API_KEY），已使用本地规则提示。",
          contextUsed: {
            submission: !!parsed.data.submissionId && extraBlocks.some((b) => b.includes("【学生本次提交")),
            attachments: (parsed.data.attachmentIds?.length ?? 0) > 0,
          },
        };
      }

      const system = buildSystemPrompt(lab, extraBlocks);
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
          contextUsed: {
            submission: !!parsed.data.submissionId && extraBlocks.some((b) => b.includes("【学生本次提交")),
            attachments: (parsed.data.attachmentIds?.length ?? 0) > 0,
          },
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
