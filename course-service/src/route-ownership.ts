export const courseServiceRouteOwnership = [
  { path: "/api/auth/**", source: "backend/src/routes/auth.ts", status: "next" },
  { path: "/api/courses/**", source: "backend/src/routes/courses.ts", status: "in-progress" },
  { path: "/api/enrollment/**", source: "backend/src/routes/enrollment.ts", status: "next" },
  { path: "/api/announcements/**", source: "backend/src/routes/announcements.ts", status: "next" },
  { path: "/api/materials/**", source: "backend/src/routes/course-materials.ts", status: "next" },
  { path: "/api/notifications/**", source: "backend/src/routes/notifications.ts", status: "next" },
  { path: "/api/admin/**", source: "backend/src/routes/admin.ts", status: "next" },
  { path: "/api/dashboard/**", source: "backend/src/routes/dashboard.ts", status: "implemented-with-http-aggregation" },
] as const;
