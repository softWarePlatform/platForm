import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
      nav("/");
    } catch (err: unknown) {
      const msg =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setError(msg ?? "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <div className="card" style={{ marginTop: 28 }}>
        <h2 style={{ marginTop: 0 }}>登录</h2>
        <form className="grid" onSubmit={onSubmit}>
          <div className="field">
            <label>邮箱</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>
          <div className="field">
            <label>密码</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </div>
          {error ? <div className="err">{error}</div> : null}
          <button className="btn primary" disabled={loading} type="submit">
            {loading ? "登录中…" : "登录"}
          </button>
          <div className="muted">
            还没有账号？<Link to="/register">去注册</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
