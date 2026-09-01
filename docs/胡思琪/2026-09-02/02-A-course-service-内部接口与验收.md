# 课程服务内部接口契约与验收

- 日期：2026-09-02
- 调用身份：所有 `/internal/**` 均要求 `x-internal-service-token`；未通过返回 `401 INTERNAL_UNAUTHORIZED`。
- 追踪：调用方可传递 `x-request-id`，响应与错误对象均返回 `requestId`。

## 冻结契约

| 能力 | 路径 | 调用方可用字段 | 失败语义 |
| --- | --- | --- | --- |
| 用户与角色 | `GET /internal/users/:userId` | `id,email,name,role,status`；当前服务无禁用态，`status` 固定为 `ACTIVE` | `404 USER_NOT_FOUND` |
| 课程 | `GET /internal/courses/:courseId` | 课程、教师、容量、已选数 | `404 COURSE_NOT_FOUND` |
| 课程权限 | `GET /internal/courses/:courseId/access/:userId` | 服务端查询的 `role,canView,isTeacher,isEnrolled,classId,classIds` | 404；不接受调用方传入 role |
| 学生名单 | `GET /internal/courses/:courseId/enrollments?page=1&pageSize=200&classId?` | `{ courseId,items:[{id,email,name,role,classId}],total,page,pageSize }` | 404 |
| 班级 | `GET /internal/courses/:courseId/classes` | 班级、选课人数 | 404 |
| 通知写入 | `POST /internal/notifications` | 请求体 `userIds[]`；响应 `created,deduped,notification,idempotentReplay` | 缺少合法 `Idempotency-Key` 为 `400` |
| 批量课程摘要 | `POST /internal/dashboard/course-summaries:batch` | `summaries,missingCourseIds` | 至多 100 个 UUID |

通知的幂等键在 `InternalNotificationRequest` 中唯一保存，并与实际 `SiteNotification` 在同一数据库操作中创建；同一键重试返回同一通知，不重复写入。

## Dashboard 上游约定

课程服务向 C 的作业服务从 `HOMEWORK_SERVICE_URL` 读取，调用 C 已实现的：

```text
GET {HOMEWORK_SERVICE_URL}/internal/courses/{courseId}/homework-summary
Headers: x-internal-service-token, x-request-id
```

期望响应为 `{ courseId, homeworkCount, publishedCount, submittedCount, gradedCount, averageScore, calculatedAt }`。Lab 的 Dashboard 摘要尚未由 B 冻结；课程服务暂保留可配置 HTTP 降级。任一上游未配置、超时或非 2xx 时，`GET /dashboard/me` 返回相应 `dependencies.*.status = "UNAVAILABLE"` 与 `reason`；对应课程的远端数据为 `null`。

## 本地验收结果

| 命令 | 结果 |
| --- | --- |
| `npm run db:seed` | 重新生成专用演示数据成功 |
| `npm run test` | 4/4 通过：路由归属、未配置降级、上游成功响应、超时降级 |
| `npm run test:api` | 通过：公开业务、内部鉴权、服务端权限判定、名单、批量摘要、通知幂等、Dashboard `UNAVAILABLE` |

API 冒烟测试使用本地 `course_service` 演示库，执行前应运行 `npm run db:seed`；不要对真实业务数据库执行该重置命令。
