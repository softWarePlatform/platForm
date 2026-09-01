export const homeworkServiceRouteOwnership = [
  { path: "/api/homework/**", source: "backend/src/routes/homework.ts", status: "in-progress" },
  { path: "/api/courses/:courseId/homework", source: "backend/src/routes/homework.ts", status: "in-progress" },
  { path: "/api/grades/**", source: "backend/src/routes/grades.ts", status: "in-progress" },
  { path: "/api/courses/:courseId/grading-config", source: "backend/src/routes/grades.ts", status: "in-progress" },
  { path: "/api/courses/:courseId/gradebook", source: "backend/src/routes/grades.ts", status: "in-progress" },
  { path: "/api/wrong-book/**", source: "backend/src/routes/homework-student.ts", status: "forward-to-lab" },
] as const;
