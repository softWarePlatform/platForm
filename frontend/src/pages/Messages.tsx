/** 站内消息（占位，后续对接通知系统） */
export default function Messages() {
  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 32 }}>
      <h1 style={{ margin: "0 0 8px" }}>站内消息</h1>
      <p className="muted">系统通知、作业提醒与课程公告将集中展示于此，功能开发中。</p>
      <div className="card" style={{ marginTop: 16, padding: 48, textAlign: "center" }}>
        <div className="muted">暂无消息</div>
      </div>
    </div>
  );
}
