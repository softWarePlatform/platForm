import WelcomeSignatureLine from "../welcome/WelcomeSignatureLine";

type Props = {
  name: string;
  section: string;
  lead?: string;
};

export default function TeachingWelcome({ name, section, lead }: Props) {
  return (
    <header className="dash-welcome teach-welcome">
      <div className="dash-welcome__text">
        <p className="dash-welcome__eyebrow">教师工作台 · {section}</p>
        <h1 className="dash-welcome__title page-title">欢迎回来，{name}</h1>
        <WelcomeSignatureLine meta={lead} />
      </div>
      <div className="dash-welcome__decor" aria-hidden>
        <div className="dash-welcome__blob dash-welcome__blob--a" />
        <div className="dash-welcome__blob dash-welcome__blob--b" />
      </div>
    </header>
  );
}
