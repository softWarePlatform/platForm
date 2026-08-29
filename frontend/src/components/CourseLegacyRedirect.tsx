import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { legacyCoursePathToRolePath } from "../lib/coursePaths";

export default function CourseLegacyRedirect() {
  const { user } = useAuth();
  const location = useLocation();
  const target = `${legacyCoursePathToRolePath(location.pathname, user?.role)}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}
