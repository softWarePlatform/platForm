import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";
import MaterialsPanel from "../../../features/materials/MaterialsPanel";

export default function CourseMaterials() {
  const { courseId, token, isTeacher, setErr } = useCourse();

  if (!token) {
    return (
      <div>
        <CourseSectionHead title="课程资料管理" />
        <p className="muted">请先登录。</p>
      </div>
    );
  }

  return (
    <div>
      <CourseSectionHead title="课程资料管理" />
      <MaterialsPanel courseId={courseId} isTeacher={isTeacher} onError={setErr} />
    </div>
  );
}
