import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiError } from "../api/errors";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const nav = useNavigate();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setSession(data.token, data.user);
      nav(data.user.role === "ADMIN" ? "/admin" : "/");
    } catch (err: unknown) {
      setError(getApiError(err, "登录失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="container auth-card">
        <div className="auth-card__brand">
          <div className="auth-card__logo" aria-hidden>
            学
          </div>
          <h1 className="auth-card__title">教学实训平台</h1>
          <p className="auth-card__lead">登录以继续</p>
        </div>
        <div className="card auth-card__form">
          <h2 className="auth-card__form-title">登录</h2>
          <form className="grid" onSubmit={onSubmit}>
            <div className="field">
              <label>邮箱</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" />
            </div>
            <div className="field">
              <label>密码</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {error ? <div className="page-alert err">{error}</div> : null}
            <button className="btn primary" disabled={loading} type="submit">
              {loading ? "登录中…" : "登录"}
            </button>
            <div className="muted auth-card__footer">
              还没有账号？<Link to="/register">去注册</Link>
              <span className="auth-card__dot">·</span>
              <Link to="/help">使用说明</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
