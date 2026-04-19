import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell";
import CourseDetail from "./pages/CourseDetail";
import CourseManage from "./pages/CourseManage";
import Courses from "./pages/Courses";
import Gradebook from "./pages/Gradebook";
import Home from "./pages/Home";
import Lab from "./pages/Lab";
import Login from "./pages/Login";
import MyHomework from "./pages/MyHomework";
import Register from "./pages/Register";
import Teaching from "./pages/Teaching";
import { useAuth } from "./auth/AuthContext";

function RequireAuth({ children }: { children: ReactElement }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({
  roles,
  children,
}: {
  roles: Array<"STUDENT" | "TEACHER" | "ADMIN">;
  children: ReactElement;
}) {
  const { user, token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/courses" element={<Courses />} />
        <Route
          path="/courses/:courseId/manage"
          element={
            <RequireRole roles={["TEACHER", "ADMIN"]}>
              <CourseManage />
            </RequireRole>
          }
        />
        <Route path="/courses/:id" element={<CourseDetail />} />
        <Route
          path="/courses/:courseId/labs/:labId"
          element={
            <RequireAuth>
              <Lab />
            </RequireAuth>
          }
        />
        <Route
          path="/courses/:courseId/gradebook"
          element={
            <RequireRole roles={["TEACHER", "ADMIN"]}>
              <Gradebook />
            </RequireRole>
          }
        />
        <Route
          path="/teaching"
          element={
            <RequireRole roles={["TEACHER", "ADMIN"]}>
              <Teaching />
            </RequireRole>
          }
        />
        <Route
          path="/my-homework"
          element={
            <RequireRole roles={["STUDENT", "ADMIN"]}>
              <MyHomework />
            </RequireRole>
          }
        />
      </Route>
    </Routes>
  );
}
