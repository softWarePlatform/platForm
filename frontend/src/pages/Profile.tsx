import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import PageHeader from "../components/layout/PageHeader";
import PageShell from "../components/layout/PageShell";
import StatusBadge from "../components/layout/StatusBadge";

export default function Profile() {
  const { user, setSession, token } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [signature, setSignature] = useState(user?.signature ?? "");
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
        setSignature(data.user.signature ?? "");
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
        signature: signature.trim() || null,
      });
      setSession(localStorage.getItem("token"), data.user);
      setMsg("已保存");
    } catch (e2: unknown) {
      const msg2 =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg2 ?? "更新失败");
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="个人中心"
        lead={user?.email ?? ""}
        below={
          <div className="page-header__meta">
            <StatusBadge tone={user?.emailVerified ? "ok" : "warn"}>
              {user?.emailVerified ? "邮箱已验证" : "邮箱未验证"}
            </StatusBadge>
          </div>
        }
      />

      {msg ? <div className="page-alert ok">{msg}</div> : null}
      {err ? <div className="page-alert err">{err}</div> : null}

      <div className="profile-layout">
        <form className="panel panel--form panel--accent" onSubmit={saveProfile}>
          <div className="panel__head">
            <h2 className="panel__title">基本信息</h2>
          </div>
          <div className="panel__body grid">
            <div className="field">
              <label>姓名</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>头像 URL</label>
              <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="field">
              <label>个性签名</label>
              <input
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                maxLength={120}
                placeholder="显示在主界面欢迎区，全站同步"
              />
            </div>
            <div className="form-actions">
              <button className="btn primary" type="submit">
                保存
              </button>
            </div>
          </div>
        </form>

        <form
          className="panel panel--form panel--accent"
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
          <div className="panel__head">
            <h2 className="panel__title">修改密码</h2>
          </div>
          <div className="panel__body grid">
            <div className="field">
              <label>旧密码</label>
              <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
            </div>
            <div className="field">
              <label>新密码</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} />
            </div>
            <div className="form-actions">
              <button className="btn primary" type="submit">
                更新密码
              </button>
            </div>
          </div>
        </form>

        <div className="panel panel--form panel--accent">
          <div className="panel__head">
            <h2 className="panel__title">邮箱验证</h2>
          </div>
          <div className="panel__body grid">
            <button
              className="btn"
              type="button"
              onClick={async () => {
                setErr(null);
                setMsg(null);
                try {
                  const { data } = await api.post("/auth/send-verify-email", {});
                  setMsg(`验证令牌：${data.verifyTokenHint}`);
                } catch {
                  setErr("发送失败");
                }
              }}
            >
              生成令牌
            </button>
            <div className="field">
              <label>令牌</label>
              <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} />
            </div>
            <div className="form-actions">
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
                    setMsg("验证成功");
                  } catch {
                    setErr("验证失败");
                  }
                }}
              >
                验证邮箱
              </button>
            </div>
          </div>
        </div>

        <div className="panel panel--form panel--accent">
          <div className="panel__head">
            <h2 className="panel__title">重置密码</h2>
          </div>
          <div className="panel__body grid">
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
                  setMsg(`重置令牌：${data.resetTokenHint ?? "—"}`);
                } catch {
                  setErr("生成失败");
                }
              }}
            >
              生成令牌
            </button>
            <div className="field">
              <label>令牌</label>
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
            <div className="form-actions">
              <button
                className="btn primary"
                type="button"
                onClick={async () => {
                  setErr(null);
                  setMsg(null);
                  try {
                    await api.post("/auth/reset-password", { token: resetToken, newPassword: resetNewPassword });
                    setMsg("重置成功");
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
      </div>
    </PageShell>
  );
}
