import CourseSectionHead from "./CourseSectionHead";

export default function CoursePlaceholder({ title }: { title: string; hint?: string }) {
  return (
    <div>
      <CourseSectionHead title={title} />
    </div>
  );
}
