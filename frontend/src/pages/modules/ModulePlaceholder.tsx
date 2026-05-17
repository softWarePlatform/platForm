import { Link } from "react-router-dom";

type Props = {
  title: string;
  description: string;
  docHint?: string;
};

export default function ModulePlaceholder({ title, description, docHint }: Props) {
  return (
    <div>
      <div className="card" style={{ maxWidth: 560, margin: "40px auto" }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p className="muted" style={{ lineHeight: 1.7 }}>
          {description}
        </p>
        {docHint ? (
          <p className="muted" style={{ fontSize: 13 }}>
            设计说明见文档：{docHint}
          </p>
        ) : null}
        <Link className="btn primary" to="/">
          返回主界面
        </Link>
      </div>
    </div>
  );
}
