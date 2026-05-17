import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Dashboard from "./Dashboard";

export default function Home() {
  const { token } = useAuth();

  if (token) return <Dashboard />;

  return (
    <div className="container">
      <div className="card" style={{ marginTop: 18, maxWidth: 720 }}>
        <h1 style={{ margin: "6px 0 12px" }}>在线教学与实训平台</h1>
        <p className="muted" style={{ lineHeight: 1.7 }}>
          登录后进入主界面：个人课表、分类课程、选课与各教学模块入口。演示账号见{" "}
          <code>RUN.txt</code>（如 teacher@demo.local / Demo123456）。
        </p>
        <div className="row" style={{ marginTop: 16 }}>
          <Link className="btn primary" to="/login">
            登录
          </Link>
          <Link className="btn" to="/register">
            注册
          </Link>
        </div>
      </div>
    </div>
  );
}
