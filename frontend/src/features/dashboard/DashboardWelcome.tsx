import WelcomeSignatureLine from "../welcome/WelcomeSignatureLine";

type Props = {
  name: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  semesterLabel?: string;
};

export default function DashboardWelcome({ name, role, semesterLabel }: Props) {
  const roleHint =
    role === "TEACHER" ? "教师工作台" : role === "ADMIN" ? "系统管理" : "学习中心";

  return (
    <header className="dash-welcome">
      <div className="dash-welcome__text">
        <p className="dash-welcome__eyebrow">{roleHint}{semesterLabel ? ` · ${semesterLabel}` : ""}</p>
        <h1 className="dash-welcome__title">欢迎回来，{name}</h1>
        <WelcomeSignatureLine editable />
      </div>
      <div className="dash-welcome__decor" aria-hidden>
        <div className="dash-welcome__blob dash-welcome__blob--a" />
        <div className="dash-welcome__blob dash-welcome__blob--b" />
      </div>
    </header>
  );
}
