import CourseSectionHead from "./CourseSectionHead";

export default function CoursePlaceholder({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <CourseSectionHead title={title} description={hint} />
      <div className="course-section-empty">功能开发中，敬请期待</div>
    </div>
  );
}
