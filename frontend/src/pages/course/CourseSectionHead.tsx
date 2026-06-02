export default function CourseSectionHead({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="course-section-head">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </header>
  );
}
