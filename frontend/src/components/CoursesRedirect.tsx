import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/** 旧「课程中心」链接：学生去选课，教师去教学台 */
export default function CoursesRedirect() {
  const { user } = useAuth();
  if (user?.role === "TEACHER") return <Navigate to="/teaching" replace />;
  return <Navigate to="/enrollment" replace />;
}
