import { Link } from "react-router-dom";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

export default function CourseGrades() {
  const { courseId, isTeacher, user } = useCourse();

  return (
    <div>
      <CourseSectionHead
        title="成绩统计"
        description={
          isTeacher
            ? "全班成绩册、分数段分布、权重配置与 CSV 导出。"
            : "查看已发布的作业与实验成绩及课程总评。"
        }
      />
      {isTeacher ? (
        <Link className="btn primary" to={`/courses/${courseId}/gradebook`}>
          打开成绩册
        </Link>
      ) : user?.role === "STUDENT" || user?.role === "ADMIN" ? (
        <Link className="btn primary" to="/my-homework">
          我的作业与成绩
        </Link>
      ) : (
        <p className="muted">暂无权限查看成绩。</p>
      )}
    </div>
  );
}
