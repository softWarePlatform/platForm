import type { ReactNode } from "react";

type Props = {
  title: string;
  hint?: string;
  children: ReactNode;
};

export default function FormBlock({ title, hint, children }: Props) {
  return (
    <section className="form-block">
      <div className="form-block__head">
        <h3 className="form-block__title">{title}</h3>
        {hint ? <p className="form-block__hint">{hint}</p> : null}
      </div>
      <div className="form-block__body">{children}</div>
    </section>
  );
}
