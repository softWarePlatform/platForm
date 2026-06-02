/** 根据课程标题、简介与实验标题生成简易知识图谱（演示用，可替换为真实 NLP/图算法） */
export type KgNode = { id: string; label: string };
export type KgEdge = { from: string; to: string; label?: string };

export function buildKnowledgeGraphFromCourse(input: {
  title: string;
  description?: string | null;
  labTitles: string[];
}): { nodes: KgNode[]; edges: KgEdge[] } {
  const nodes: KgNode[] = [{ id: "root", label: input.title }];
  const edges: KgEdge[] = [];

  input.labTitles.forEach((t, i) => {
    const id = `lab_${i}`;
    nodes.push({ id, label: t });
    edges.push({ from: "root", to: id, label: "实验" });
  });

  const desc = (input.description ?? "").trim();
  if (desc) {
    const parts = desc
      .split(/[。；;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    parts.forEach((p, i) => {
      const id = `kp_${i}`;
      const label = p.length > 36 ? `${p.slice(0, 36)}…` : p;
      nodes.push({ id, label });
      edges.push({ from: "root", to: id, label: "要点" });
    });
  }

  return { nodes, edges };
}
