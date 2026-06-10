import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import GradebookPanel from "../../../components/grades/GradebookPanel";
import EmptyState from "../../../components/layout/EmptyState";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

type MyCourseGrade = {
  courseId: string;
  courseTitle: string;
  rank?: number | null;
  classSize?: number | null;
  summary?: {
    labAverage?: number | null;
    homeworkAverage?: number | null;
    totalScore?: number | null;
  };
  weights?: { lab?: number; homework?: number };
};

function scoreText(value?: number | null) {
  return value == null ? "-" : Number(value).toFixed(1);
}

function weightText(value?: number | null) {
  return value == null ? "-" : `${Math.round(Number(value) * 100)}%`;
}

function StudentCourseGrades({ courseId }: { courseId: string }) {
  const [grade, setGrade] = useState<MyCourseGrade | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data } = await api.get<{ courses?: MyCourseGrade[] }>("/grades/me");
        if (!cancelled) {
          setGrade((data.courses ?? []).find((item) => item.courseId === courseId) ?? null);
        }
      } catch {
        if (!cancelled) setErr("成绩加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (loading) return <div className="panel-loading muted">加载中...</div>;
  if (err) return <div className="page-alert err">{err}</div>;
  if (!grade) return <EmptyState title="暂无成绩统计" />;

  return (
    <section className="student-grade-panel">
      <article className="student-grade-panel__hero">
        <span>总评</span>
        <strong>{scoreText(grade.summary?.totalScore)}</strong>
        <p>
          排名 {grade.rank ?? "-"} / {grade.classSize ?? "-"}
        </p>
      </article>
      <div className="student-grade-panel__grid">
        <article>
          <span>实验均分</span>
          <strong>{scoreText(grade.summary?.labAverage)}</strong>
          <p>权重 {weightText(grade.weights?.lab)}</p>
        </article>
        <article>
          <span>作业均分</span>
          <strong>{scoreText(grade.summary?.homeworkAverage)}</strong>
          <p>权重 {weightText(grade.weights?.homework)}</p>
        </article>
      </div>
    </section>
  );
}

export default function CourseGrades() {
  const { courseId, isTeacher, user } = useCourse();

  return (
    <div>
      <CourseSectionHead title="成绩统计" />
      {isTeacher ? (
        <GradebookPanel courseId={courseId} />
      ) : user?.role === "STUDENT" ? (
        <StudentCourseGrades courseId={courseId} />
      ) : (
        <p className="muted">暂无权限查看成绩。</p>
      )}
    </div>
  );
}
