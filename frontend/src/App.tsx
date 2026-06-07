import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Shell from "./components/Shell";
import CoursesRedirect from "./components/CoursesRedirect";
import CourseLayout from "./pages/course/CourseLayout";
import CourseManage from "./pages/CourseManage";
import {
  CourseAnnouncements,
  CourseAnnouncementDetail,
  CourseGrades,
  CourseHomework,
  CourseLabs,
  CourseMaterials,
  CoursePractice,
} from "./pages/course/sections";
import PracticeSession from "./pages/course/PracticeSession";
import CourseHomeworkDetail from "./pages/course/sections/CourseHomeworkDetail";
import CourseLabSetProblems from "./pages/course/sections/CourseLabSetProblems";
import EnrollmentPage from "./pages/enrollment/EnrollmentPage";
import TeachingHub from "./pages/teaching/TeachingHub";
import HomeworkList from "./pages/teaching/HomeworkList";
import TeachingHomeworkRedirect from "./pages/teaching/TeachingHomeworkRedirect";
import Gradebook from "./pages/Gradebook";
import Home from "./pages/Home";
import Lab from "./pages/Lab";
import LabDiscussionThread from "./pages/LabDiscussionThread";
import LabSetHubRedirect from "./pages/LabSetHubRedirect";
import LabSetManage from "./pages/LabSetManage";
import Login from "./pages/Login";
import Messages from "./pages/Messages";
import MyHomework from "./pages/MyHomework";
import MyLabs from "./pages/MyLabs";
import TeachingLabs from "./pages/teaching/TeachingLabs";
import Profile from "./pages/Profile";
import Register from "./pages/Register";
import AdminUsers from "./pages/AdminUsers";
import Help from "./pages/Help";

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
        <Route path="/help" element={<Help />} />
        <Route
          path="/enrollment"
          element={
            <RequireRole roles={["STUDENT", "ADMIN"]}>
              <EnrollmentPage />
            </RequireRole>
          }
        />
        <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="/courses" element={<CoursesRedirect />} />
        <Route
          path="/courses/:courseId/manage"
          element={
            <RequireRole roles={["TEACHER", "ADMIN"]}>
              <CourseManage />
            </RequireRole>
          }
        />
        <Route path="/courses/:courseId" element={<CourseLayout />}>
          <Route index element={<Navigate to="announcements" replace />} />
          <Route path="announcements" element={<CourseAnnouncements />} />
          <Route path="announcements/:announcementId" element={<CourseAnnouncementDetail />} />
          <Route path="homework" element={<CourseHomework />} />
          <Route path="homework/:homeworkId" element={<CourseHomeworkDetail />} />
          <Route path="labs" element={<CourseLabs />} />
          <Route path="labs/sets/:labSetId" element={<CourseLabSetProblems />} />
          <Route path="grades" element={<CourseGrades />} />
          <Route path="practice" element={<CoursePractice />} />
          <Route
            path="practice/session/:sessionId"
            element={
              <RequireAuth>
                <PracticeSession />
              </RequireAuth>
            }
          />
          <Route path="materials" element={<CourseMaterials />} />
          <Route path="*" element={<Navigate to="announcements" replace />} />
        </Route>
        <Route
          path="/courses/:courseId/lab-sets/:labSetId/manage"
          element={
            <RequireRole roles={["TEACHER", "ADMIN"]}>
              <LabSetManage />
            </RequireRole>
          }
        />
        <Route
          path="/courses/:courseId/lab-sets/:labSetId"
          element={
            <RequireAuth>
              <LabSetHubRedirect />
            </RequireAuth>
          }
        />
        <Route
          path="/courses/:courseId/labs/:labId"
          element={
            <RequireAuth>
              <Lab />
            </RequireAuth>
          }
        />
        <Route
          path="/courses/:courseId/labs/:labId/discussions/:postId"
          element={
            <RequireAuth>
              <LabDiscussionThread />
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
          path="/teaching/homework/:homeworkId"
          element={
            <RequireRole roles={["TEACHER", "ADMIN"]}>
              <TeachingHomeworkRedirect />
            </RequireRole>
          }
        />
        <Route
          path="/teaching/homework"
          element={
            <RequireRole roles={["TEACHER", "ADMIN"]}>
              <HomeworkList />
            </RequireRole>
          }
        />
        <Route
          path="/teaching/labs"
          element={
            <RequireRole roles={["TEACHER", "ADMIN"]}>
              <TeachingLabs />
            </RequireRole>
          }
        />
        <Route
          path="/teaching"
          element={
            <RequireRole roles={["TEACHER", "ADMIN"]}>
              <TeachingHub />
            </RequireRole>
          }
        />
        <Route
          path="/my-homework"
          element={
            <RequireRole roles={["STUDENT"]}>
              <MyHomework />
            </RequireRole>
          }
        />
        <Route
          path="/my-labs/*"
          element={
            <RequireRole roles={["STUDENT"]}>
              <MyLabs />
            </RequireRole>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireRole roles={["ADMIN"]}>
              <AdminUsers />
            </RequireRole>
          }
        />
        <Route path="/practice" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
