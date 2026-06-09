type Option = { id: string; text: string };

export function formatCorrectAnswer(
  type: string,
  answer: unknown,
  options?: Option[] | null,
): string {
  if (!answer || typeof answer !== "object") {
    return String(answer ?? "—");
  }
  const a = answer as Record<string, unknown>;
  if (type === "CHOICE") {
    const id = String(a.choiceId ?? "");
    const opt = options?.find((o) => o.id === id);
    return opt ? `${id}. ${opt.text}` : id || "—";
  }
  if (type === "FILL") {
    const blanks = (a.blanks as string[]) ?? [];
    return blanks.length ? blanks.join("；") : "—";
  }
  if (type === "SHORT_ANSWER") {
    return String(a.text ?? "—");
  }
  if (type === "CODE") {
    const cases = (a.cases as { input: string; expected: string }[]) ?? [];
    if (!cases.length) return "见参考代码";
    return cases
      .map((c, i) => `用例 ${i + 1}：输入 ${JSON.stringify(c.input.trim())} → 输出 ${c.expected}`)
      .join("\n");
  }
  return JSON.stringify(answer, null, 2);
}

export function formatResultDetail(type: string, resultJson: unknown): string | null {
  if (!resultJson || typeof resultJson !== "object") return null;
  const r = resultJson as Record<string, unknown>;
  if (type === "CODE" && Array.isArray(r.cases)) {
    const lines = (r.cases as { input: string; expected: string; got: string; pass: boolean }[]).map(
      (c, i) =>
        `用例 ${i + 1}：${c.pass ? "通过" : "未通过"}（期望 ${c.expected}，实际 ${c.got}）`,
    );
    return lines.join("\n");
  }
  if (r.note) return String(r.note);
  if (r.reason) return String(r.reason);
  return null;
}
