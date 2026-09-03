import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildKnowledgeGraphFromCourse } from "../../src/lib/knowledge-graph.js";

describe("UC-01 知识图谱生成", () => {
  it("UNIT-13-01：根节点使用课程标题", () => {
    const g = buildKnowledgeGraphFromCourse({ title: "数据结构", labTitles: [] });
    assert.equal(g.nodes[0]?.id, "root");
    assert.equal(g.nodes[0]?.label, "数据结构");
  });

  it("UNIT-13-02：每个实验生成 lab 节点与「实验」边", () => {
    const g = buildKnowledgeGraphFromCourse({
      title: "C 语言",
      labTitles: ["实验一", "实验二", "实验三"],
    });
    const labNodes = g.nodes.filter((n) => n.id.startsWith("lab_"));
    assert.equal(labNodes.length, 3);
    assert.equal(g.edges.filter((e) => e.label === "实验").length, 3);
    assert.equal(labNodes[2]?.label, "实验三");
  });

  it("UNIT-13-03：描述按句切分并生成「要点」节点", () => {
    const g = buildKnowledgeGraphFromCourse({
      title: "操作系统",
      description: "进程管理。内存管理；文件系统\n死锁处理",
      labTitles: [],
    });
    const kps = g.nodes.filter((n) => n.id.startsWith("kp_"));
    assert.equal(kps.length, 4);
    assert.equal(g.edges.filter((e) => e.label === "要点").length, 4);
  });

  it("UNIT-13-04：描述中空行和空白段被过滤", () => {
    const g = buildKnowledgeGraphFromCourse({
      title: "网络",
      description: "TCP/IP；;  \n;UDP",
      labTitles: [],
    });
    const kps = g.nodes.filter((n) => n.id.startsWith("kp_"));
    assert.ok(kps.length >= 2);
    assert.ok(kps.every((n) => n.label.length > 0));
  });

  it("UNIT-13-05：超长要点截断到 36 字符并加省略号", () => {
    const longText = "要点".repeat(30); // 60 字符
    const g = buildKnowledgeGraphFromCourse({
      title: "T",
      description: longText,
      labTitles: [],
    });
    const kp = g.nodes.find((n) => n.id.startsWith("kp_"));
    assert.equal(kp?.label.length, 37);
    assert.ok(kp?.label.endsWith("…"));
  });

  it("UNIT-13-06：无描述时不生成要点节点", () => {
    const g = buildKnowledgeGraphFromCourse({ title: "T", description: "   ", labTitles: [] });
    assert.equal(g.nodes.filter((n) => n.id.startsWith("kp_")).length, 0);
  });

  it("UNIT-13-07：无实验时仅保留根节点", () => {
    const g = buildKnowledgeGraphFromCourse({ title: "T", description: null, labTitles: [] });
    assert.equal(g.nodes.length, 1);
    assert.equal(g.edges.length, 0);
  });
});
