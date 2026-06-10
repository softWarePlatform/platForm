import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Shell from "./components/Shell";
import CoursesRedirect from "./components/CoursesRedirect";
import CourseLegacyRedirect from "./components/CourseLegacyRedirect";
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
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminUserLogs from "./pages/admin/AdminUserLogs";
import AdminLogs from "./pages/admin/AdminLogs";
import AdminClassServe from "./pages/admin/AdminClassServe";
import AdminHomeworkCompletion from "./pages/admin/AdminHomeworkCompletion";
import AdminShell from "./pages/admin/AdminShell";
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
        <Route path="/courses/:courseId/*" element={<CourseLegacyRedirect />} />
        <Route
          path="/student/courses/:courseId/manage"
          element={
            <RequireRole roles={["STUDENT"]}>
              <Navigate to=".." replace />
            </RequireRole>
          }
        />
        <Route
          path="/teacher/courses/:courseId/manage"
          element={
            <RequireRole roles={["TEACHER"]}>
              <CourseManage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/courses/:courseId/manage"
          element={
            <RequireRole roles={["ADMIN"]}>
              <CourseManage />
            </RequireRole>
          }
        />
        <Route
          path="/student/courses/:courseId"
          element={
            <RequireRole roles={["STUDENT"]}>
              <CourseLayout />
            </RequireRole>
          }
        >
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
          path="/teacher/courses/:courseId"
          element={
            <RequireRole roles={["TEACHER"]}>
              <CourseLayout />
            </RequireRole>
          }
        >
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
          path="/admin/courses/:courseId"
          element={
            <RequireRole roles={["ADMIN"]}>
              <CourseLayout />
            </RequireRole>
          }
        >
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
          path="/teacher/courses/:courseId/lab-sets/:labSetId/manage"
          element={
            <RequireRole roles={["TEACHER"]}>
              <LabSetManage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/courses/:courseId/lab-sets/:labSetId/manage"
          element={
            <RequireRole roles={["ADMIN"]}>
              <LabSetManage />
            </RequireRole>
          }
        />
        <Route
          path="/student/courses/:courseId/lab-sets/:labSetId"
          element={
            <RequireAuth>
              <LabSetHubRedirect />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/courses/:courseId/lab-sets/:labSetId"
          element={
            <RequireAuth>
              <LabSetHubRedirect />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/courses/:courseId/lab-sets/:labSetId"
          element={
            <RequireAuth>
              <LabSetHubRedirect />
            </RequireAuth>
          }
        />
        <Route
          path="/student/courses/:courseId/labs/:labId"
          element={
            <RequireAuth>
              <Lab />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/courses/:courseId/labs/:labId"
          element={
            <RequireAuth>
              <Lab />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/courses/:courseId/labs/:labId"
          element={
            <RequireAuth>
              <Lab />
            </RequireAuth>
          }
        />
        <Route
          path="/student/courses/:courseId/labs/:labId/discussions/:postId"
          element={
            <RequireAuth>
              <LabDiscussionThread />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/courses/:courseId/labs/:labId/discussions/:postId"
          element={
            <RequireAuth>
              <LabDiscussionThread />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/courses/:courseId/labs/:labId/discussions/:postId"
          element={
            <RequireAuth>
              <LabDiscussionThread />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/courses/:courseId/gradebook"
          element={
            <RequireRole roles={["TEACHER"]}>
              <Gradebook />
            </RequireRole>
          }
        />
        <Route
          path="/admin/courses/:courseId/gradebook"
          element={
            <RequireRole roles={["ADMIN"]}>
              <Gradebook />
            </RequireRole>
          }
        />
        <Route
          path="/teaching/homework/:homeworkId"
          element={
            <RequireRole roles={["TEACHER"]}>
              <TeachingHomeworkRedirect />
            </RequireRole>
          }
        />
        <Route
          path="/teaching/homework"
          element={
            <RequireRole roles={["TEACHER"]}>
              <HomeworkList />
            </RequireRole>
          }
        />
        <Route
          path="/teaching/labs"
          element={
            <RequireRole roles={["TEACHER"]}>
              <TeachingLabs />
            </RequireRole>
          }
        />
        <Route
          path="/teaching"
          element={
            <RequireRole roles={["TEACHER"]}>
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
        <Route path="/practice" element={<Navigate to="/" replace />} />
      </Route>

      <Route
        element={
          <RequireRole roles={["ADMIN"]}>
            <AdminShell />
          </RequireRole>
        }
      >
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/users/:userId/logs" element={<AdminUserLogs />} />
        <Route path="/admin/logs" element={<AdminLogs />} />
        <Route path="/admin/classserve" element={<AdminClassServe />} />
        <Route path="/admin/homework-completion" element={<AdminHomeworkCompletion />} />
      </Route>
    </Routes>
  );
}
