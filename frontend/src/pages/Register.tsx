import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiError } from "../api/errors";
import { api } from "../api/client";
import { useAuth, type Role } from "../auth/AuthContext";

export default function Register() {
  const nav = useNavigate();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("STUDENT");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/register", { email, password, name, role });
      setSession(data.token, data.user);
      nav("/");
    } catch (err: unknown) {
      setError(getApiError(err, "注册失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="container auth-card">
        <div className="card">
          <h2>注册</h2>
        <form className="grid" onSubmit={onSubmit}>
          <div className="field">
            <label>姓名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>邮箱</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>
          <div className="field">
            <label>密码（≥8位）</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              minLength={8}
              required
            />
          </div>
          <div className="field">
            <label>身份</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="STUDENT">学生</option>
              <option value="TEACHER">教师</option>
            </select>
          </div>
          {error ? <div className="err">{error}</div> : null}
          <button className="btn primary" disabled={loading} type="submit">
            {loading ? "提交中…" : "创建账号"}
          </button>
          <div className="muted">
            已有账号？<Link to="/login">去登录</Link>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
