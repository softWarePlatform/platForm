import { useCourse } from "../CourseContext";
import { KgPreview } from "../KgPreview";

export default function CourseSyllabus() {
  const { course } = useCourse();
  return (
    <div>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>课程大纲</h2>
      <div style={{ lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
        {course.description ?? "教师尚未上传大纲正文，请查看课程介绍或联系任课教师。"}
      </div>
      {course.knowledgeGraphJson ? (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 700 }}>知识图谱</div>
          <KgPreview json={course.knowledgeGraphJson} />
        </div>
      ) : null}
    </div>
  );
}
