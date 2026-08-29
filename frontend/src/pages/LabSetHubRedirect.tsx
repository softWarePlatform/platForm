import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { coursePathForRole } from "../lib/coursePaths";

/** 旧链接 /courses/:courseId/lab-sets/:labSetId → 课程实验 Tab 内 */
export default function LabSetHubRedirect() {
  const { user } = useAuth();
  const { courseId = "", labSetId = "" } = useParams();
  return <Navigate to={coursePathForRole(courseId, `labs/sets/${labSetId}`, user?.role)} replace />;
}
