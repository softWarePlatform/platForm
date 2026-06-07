import { Link } from "react-router-dom";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

export default function CourseGrades() {
  const { courseId, isTeacher, user } = useCourse();

  return (
    <div>
      <CourseSectionHead title="成绩统计" />
      {isTeacher ? (
        <Link className="btn primary" to={`/courses/${courseId}/gradebook`}>
          打开成绩册
        </Link>
      ) : user?.role === "STUDENT" ? (
        <Link className="btn primary" to="/my-homework">
          我的作业与成绩
        </Link>
      ) : (
        <p className="muted">暂无权限查看成绩。</p>
      )}
    </div>
  );
}
