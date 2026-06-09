export function KgPreview({ json }: { json: string }) {
  try {
    const g = JSON.parse(json) as {
      nodes?: { id: string; label: string }[];
      edges?: { from: string; to: string; label?: string }[];
    };
    const nodes = g.nodes ?? [];
    const edges = g.edges ?? [];
    return (
      <div className="grid" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
        <div>
          <strong>节点</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {nodes.map((n) => (
              <li key={n.id}>{n.label}</li>
            ))}
          </ul>
        </div>
        <div>
          <strong>关系</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {edges.map((e, i) => (
              <li key={i}>
                {e.from} → {e.to}
                {e.label ? `（${e.label}）` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  } catch {
    return <div className="muted">图谱数据格式异常</div>;
  }
}
