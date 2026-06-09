import type { ReactNode } from "react";

type Props = {
  title: string;
  hint?: string;
  children: ReactNode;
};

/** 扁平表单分区：仅用分隔线与左侧强调线，不再套盒子 */
export default function FormSection({ title, hint, children }: Props) {
  return (
    <section className="form-section">
      <div className="form-section__head">
        <h4 className="form-section__title">{title}</h4>
        {hint ? <p className="form-section__hint">{hint}</p> : null}
      </div>
      <div className="form-section__body">{children}</div>
    </section>
  );
}
