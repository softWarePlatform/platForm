type Props = {
  title: string;
  description: string;
};

export default function AdminPlaceholder({ title, description }: Props) {
  return (
    <>
      <header className="admin-page-header">
        <h1>{title}</h1>
        <p className="muted" style={{ margin: 0 }}>{description}</p>
      </header>
      <div className="card">
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
          该模块界面开发中。相关后端接口已部分就绪，详见{" "}
          <code>docs/超级管理员待办.md</code>。
        </p>
      </div>
    </>
  );
}
