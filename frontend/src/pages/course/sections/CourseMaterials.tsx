import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";
import MaterialsPanel from "../../../features/materials/MaterialsPanel";

export default function CourseMaterials() {
  const { courseId, token, isTeacher, setErr } = useCourse();

  if (!token) {
    return (
      <div>
        <CourseSectionHead
          title="课程资料管理"
          description="登录后可浏览、预览、下载讲义与课件，并收藏常用资料。"
        />
        <p className="muted">请先登录。</p>
      </div>
    );
  }

  return (
    <div>
      <CourseSectionHead
        title="课程资料管理"
        description={
          isTeacher
            ? "按目录管理教学大纲与课件：上传、可见范围、置顶、版本与下载统计；学生可预览与批量下载。"
            : "浏览课程资料，支持在线预览、下载、收藏与按条件搜索。"
        }
      />
      <MaterialsPanel courseId={courseId} isTeacher={isTeacher} onError={setErr} />
    </div>
  );
}
