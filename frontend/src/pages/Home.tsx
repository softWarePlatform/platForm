import { Link } from "react-router-dom";
import Reveal from "../components/motion/Reveal";
import StaggerGrid, { StaggerItem } from "../components/motion/StaggerGrid";
import { useAuth } from "../auth/AuthContext";
import Dashboard from "./Dashboard";

const FEATURES = [
  {
    icon: "课",
    title: "课程与选课",
    desc: "按学期浏览课表，一键加入课程，公告与资料集中查看。",
  },
  {
    icon: "验",
    title: "在线实验",
    desc: "代码编辑、自动评测、进度追踪，实验集状态一目了然。",
  },
  {
    icon: "作",
    title: "作业批改",
    desc: "在线提交与迟交规则，教师批改后成绩统一发布。",
  },
  {
    icon: "练",
    title: "智能练习",
    desc: "题库练习、错题本与 AI 答疑，巩固课堂知识点。",
  },
] as const;

function GuestLanding() {
  return (
    <div className="landing container">
      <div className="landing__glow landing__glow--a" aria-hidden />
      <div className="landing__glow landing__glow--b" aria-hidden />
      <div className="landing__glow landing__glow--c" aria-hidden />

      <section className="landing-hero">
        <Reveal>
          <p className="landing-hero__eyebrow">Teaching Platform</p>
          <h1 className="landing-hero__title">在线教学与实训平台</h1>
          <p className="landing-hero__lead">
            为高校教学设计的一体化空间：选课、实验、作业、练习与消息，流程连贯、界面统一。
          </p>
          <div className="landing-hero__actions">
            <Link className="btn primary" to="/login">
              登录
            </Link>
            <Link className="btn" to="/register">
              注册账号
            </Link>
            <Link className="btn" to="/help">
              使用说明
            </Link>
          </div>
        </Reveal>
        <div className="landing-scroll-hint" aria-hidden>
          <span className="landing-scroll-hint__line" />
          向下探索
        </div>
      </section>

      <section className="landing-section" id="features">
        <Reveal delay={0.05}>
          <h2 className="landing-section__title">核心能力</h2>
          <p className="landing-section__lead">教学全流程在一个平台完成，减少跳转与割裂感。</p>
        </Reveal>
        <StaggerGrid className="entity-card-grid">
          {FEATURES.map((f) => (
            <StaggerItem key={f.title}>
              <article className="landing-feature">
                <div className="landing-feature__icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </article>
            </StaggerItem>
          ))}
        </StaggerGrid>
      </section>

      <section className="landing-section">
        <Reveal>
          <h2 className="landing-section__title">为什么选择我们</h2>
          <p className="landing-section__lead">轻量部署，演示数据开箱即用，适合课程试点与实训展示。</p>
          <div className="landing-stats">
            <div className="landing-stat">
              <strong>1200px</strong>
              <span>统一内容宽度</span>
            </div>
            <div className="landing-stat">
              <strong>实验+作业</strong>
              <span>评测与批改闭环</span>
            </div>
            <div className="landing-stat">
              <strong>多角色</strong>
              <span>学生 / 教师 / 管理员</span>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

export default function Home() {
  const { token } = useAuth();
  if (token) return <Dashboard />;
  return <GuestLanding />;
}
