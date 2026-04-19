export default function Home() {
  return (
    <div className="container">
      <div className="card" style={{ marginTop: 18 }}>
        <div className="muted" style={{ marginBottom: 14, padding: "12px 14px", background: "#eff6ff", borderRadius: 12 }}>
          <strong>演示数据：</strong>在 <code>backend</code> 执行 <code style={{ fontSize: 13 }}>npm run db:seed</code>
          。教师 <code>teacher@demo.local</code>；学生 <code>student@demo.local</code>（张三）、
          <code>li@demo.local</code>（李四）、<code>wang@demo.local</code>（王五）；密码均为{" "}
          <code>Demo123456</code>。含两门课、班级、多实验与作业及成绩演示。
        </div>
        <div className="spread">
          <div>
            <h1 style={{ margin: "6px 0 6px" }}>在线教学与实训平台</h1>
            <div className="muted" style={{ maxWidth: 720, lineHeight: 1.7 }}>
              面向课程管理、在线实验、自动评测、作业与成绩统计的一体化骨架。API 无状态横向扩展，Redis 队列承载
              OJ 评测压力；前端静态资源由 Nginx 分发，便于支撑大规模并发访问。
            </div>
          </div>
          <div className="grid" style={{ width: 260 }}>
            <div className="muted">容量建议（示例）</div>
            <div className="card" style={{ boxShadow: "none", padding: 12 }}>
              <div style={{ fontWeight: 700 }}>≈1000 在线会话</div>
              <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
                nginx 反向代理 + 多实例 api + 多 worker + Postgres/Redis 集群，可按流量水平扩容。
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: 16 }}>
        {[
          { t: "课程与班级", d: "发布课程、选课、分班与问答区。" },
          { t: "在线实验 / IDE", d: "Monaco 编辑器 + 多语言提交。" },
          { t: "自动评测", d: "BullMQ 隔离队列，评测与 Web 请求解耦。" },
          { t: "作业与成绩单", d: "作业批改、导出统计、学生侧成绩总览。" },
        ].map((x) => (
          <div key={x.t} className="card">
            <div style={{ fontWeight: 800 }}>{x.t}</div>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
              {x.d}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
