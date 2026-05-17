import { useCourse } from "../CourseContext";

export default function CourseIntro() {
  const { course } = useCourse();
  return (
    <div>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>课程介绍</h2>
      <div style={{ lineHeight: 1.8 }}>{course.description ?? "暂无课程介绍"}</div>
      {(course.startAt || course.endAt) && (
        <div className="muted" style={{ marginTop: 16 }}>
          {course.startAt ? <>开课：{new Date(course.startAt).toLocaleString()} </> : null}
          {course.endAt ? <>· 结课：{new Date(course.endAt).toLocaleString()}</> : null}
        </div>
      )}
    </div>
  );
}
