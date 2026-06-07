import { Navigate, useParams } from "react-router-dom";

/** 旧链接 /courses/:courseId/lab-sets/:labSetId → 课程实验 Tab 内 */
export default function LabSetHubRedirect() {
  const { courseId = "", labSetId = "" } = useParams();
  return <Navigate to={`/courses/${courseId}/labs/sets/${labSetId}`} replace />;
}
