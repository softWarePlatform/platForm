import { Link } from "react-router-dom";
import PageHeader from "../components/layout/PageHeader";
import PageShell from "../components/layout/PageShell";

export default function Help() {
  return (
    <PageShell>
      <PageHeader title="使用说明" lead="演示账号与常用操作" />
      <div className="panel">
        <div className="panel__body prose-help">
          <h3>演示账号</h3>
          <p>密码均为 <code>Demo123456</code></p>
          <ul>
            <li>学生：<code>student@demo.local</code>、<code>zhao@demo.local</code> 等</li>
            <li>教师：<code>teacher@demo.local</code></li>
            <li>管理员：<code>admin@demo.local</code></li>
          </ul>
          <h3>推荐路径</h3>
          <ul>
            <li>学生：主界面 → 课程 → 实验 / 作业</li>
            <li>教师：教学台 → 实验管理 / 作业批改</li>
          </ul>
          <h3>实验评测</h3>
          <p>自动评测需启动 Redis 与 judge-worker，详见项目根目录 <code>RUN.txt</code>。</p>
          <p className="muted">
            <Link to="/login">返回登录</Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
