import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Profile() {
  const { user, setSession, token } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [resetEmail, setResetEmail] = useState(user?.email ?? "");
  const [resetToken, setResetToken] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        setName(data.user.name ?? "");
        setAvatarUrl(data.user.avatarUrl ?? "");
        setResetEmail(data.user.email ?? "");
      } catch {
        /* ignore */
      }
    })();
  }, [token]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      const { data } = await api.patch("/auth/me", {
        name,
        avatarUrl: avatarUrl.trim() || null,
      });
      setSession(localStorage.getItem("token"), data.user);
      setMsg("个人信息已更新");
    } catch (e2: unknown) {
      const msg2 =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg2 ?? "更新失败");
    }
  }

  return (
    <div className="container">
      <h2 style={{ marginTop: 10 }}>个人中心</h2>
      {msg ? <div className="muted">{msg}</div> : null}
      {err ? <div className="err">{err}</div> : null}

      <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <form className="card grid" onSubmit={saveProfile}>
          <div style={{ fontWeight: 800 }}>个人信息</div>
          <div className="field">
            <label>姓名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>头像 URL（可选）</label>
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
          </div>
          <button className="btn primary" type="submit">
            保存
          </button>
        </form>

        <form
          className="card grid"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            setMsg(null);
            try {
              await api.patch("/auth/password", { oldPassword, newPassword });
              setOldPassword("");
              setNewPassword("");
              setMsg("密码已修改");
            } catch (e2: unknown) {
              const msg2 =
                typeof e2 === "object" && e2 !== null && "response" in e2
                  ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                  : null;
              setErr(msg2 ?? "修改失败");
            }
          }}
        >
          <div style={{ fontWeight: 800 }}>修改密码</div>
          <div className="field">
            <label>旧密码</label>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>新密码（≥8位）</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} />
          </div>
          <button className="btn primary" type="submit">
            更新密码
          </button>
        </form>
      </div>

      <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="card grid">
          <div style={{ fontWeight: 800 }}>邮箱验证（演示版）</div>
          <div className="muted">
            当前状态：{user?.emailVerified ? "已验证" : "未验证"}
          </div>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              setErr(null);
              setMsg(null);
              try {
                const { data } = await api.post("/auth/send-verify-email", {});
                setMsg(`已生成验证令牌（演示）：${data.verifyTokenHint}`);
              } catch {
                setErr("发送失败");
              }
            }}
          >
            发送验证邮件（生成令牌）
          </button>
          <div className="field">
            <label>验证令牌</label>
            <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} />
          </div>
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              setErr(null);
              setMsg(null);
              try {
                await api.post("/auth/verify-email", { token: verifyToken });
                const { data } = await api.get("/auth/me");
                setSession(localStorage.getItem("token"), data.user);
                setMsg("邮箱验证成功");
              } catch {
                setErr("验证失败");
              }
            }}
          >
            验证邮箱
          </button>
        </div>

        <div className="card grid">
          <div style={{ fontWeight: 800 }}>忘记密码（演示版）</div>
          <div className="field">
            <label>邮箱</label>
            <input value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} />
          </div>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              setErr(null);
              setMsg(null);
              try {
                const { data } = await api.post("/auth/forgot-password", { email: resetEmail });
                setMsg(`已生成重置令牌（演示）：${data.resetTokenHint ?? "若邮箱不存在则不会返回令牌"}`);
              } catch {
                setErr("生成失败");
              }
            }}
          >
            发送重置邮件（生成令牌）
          </button>
          <div className="field">
            <label>重置令牌</label>
            <input value={resetToken} onChange={(e) => setResetToken(e.target.value)} />
          </div>
          <div className="field">
            <label>新密码</label>
            <input
              type="password"
              minLength={8}
              value={resetNewPassword}
              onChange={(e) => setResetNewPassword(e.target.value)}
            />
          </div>
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              setErr(null);
              setMsg(null);
              try {
                await api.post("/auth/reset-password", { token: resetToken, newPassword: resetNewPassword });
                setMsg("重置成功，请用新密码登录");
              } catch {
                setErr("重置失败");
              }
            }}
          >
            重置密码
          </button>
        </div>
      </div>
    </div>
  );
}

