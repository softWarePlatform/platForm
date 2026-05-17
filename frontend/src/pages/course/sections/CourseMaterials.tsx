import { api } from "../../../api/client";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

export default function CourseMaterials() {
  const { courseId, token, materials } = useCourse();

  if (!token) {
    return (
      <div>
        <CourseSectionHead title="课程资料管理" description="登录后可查看与下载讲义、课件等资料。" />
        <p className="muted">请先登录。</p>
      </div>
    );
  }

  return (
    <div>
      <CourseSectionHead
        title="课程资料管理"
        description="下载教师上传的讲义与课件；上传请在「课程设置」中操作。"
      />
      {materials.length === 0 ? (
        <div className="course-section-empty">暂无资料</div>
      ) : (
        <div>
          {materials.map((m: { id: string; title: string; fileName: string }) => (
            <div key={m.id} className="course-list-item">
              <span style={{ fontWeight: 600 }}>{m.title}</span>
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  const res = await api.get(`/courses/${courseId}/materials/${m.id}/download`, {
                    responseType: "blob",
                  });
                  const url = URL.createObjectURL(res.data);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = m.fileName;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                下载
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
