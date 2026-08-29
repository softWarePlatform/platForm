import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApiError } from "../../api/errors";
import { api } from "../../api/client";
import { FormSkeleton } from "../../components/layout/PageSkeleton";
import { coursePathForRole } from "../../lib/coursePaths";

/** 旧链接 /teaching/homework/:id → 课程内作业详情 */
export default function TeachingHomeworkRedirect() {
  const { homeworkId = "" } = useParams();
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/homework/${homeworkId}/submissions`);
        const courseId = data?.homework?.courseId as string | undefined;
        if (!courseId) {
          if (!cancelled) setErr("无法定位课程");
          return;
        }
        if (!cancelled) navigate(coursePathForRole(courseId, `homework/${homeworkId}`, "TEACHER"), { replace: true });
      } catch (e: unknown) {
        if (!cancelled) setErr(getApiError(e, "作业不存在或无权访问"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homeworkId, navigate]);

  if (err) {
    return (
      <div className="page-shell">
        <div className="container page-shell__inner">
          <div className="page-alert err">{err}</div>
          <Link className="btn" to="/teaching/homework">
            返回作业列表
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container page-shell__inner">
        <FormSkeleton />
      </div>
    </div>
  );
}
