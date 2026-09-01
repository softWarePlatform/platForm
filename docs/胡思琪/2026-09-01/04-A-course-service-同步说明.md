# A：course-service 9 月 1 日同步说明

## 已可提供的能力

| 类别 | 公开路径（服务直连） |
| --- | --- |
| 认证 | `POST /auth/register`、`POST /auth/login`、`GET /auth/me` |
| 课程 | `GET/POST /courses`、`GET/PATCH /courses/:id`、`POST /courses/:id/publish`、`GET /courses/mine` |
| 选课 | `GET /enrollment/status`、`GET /enrollment/catalog`、`POST/DELETE /enrollment/courses/:courseId/enroll`、`POST /enrollment/courses/:courseId/waitlist` |
| 公告 | `GET/POST /courses/:courseId/announcements`、`POST /announcements/:id/read` |
| 资料 | `GET/POST /courses/:courseId/materials`、`POST /materials/:id/favorite`、`GET /materials/:id/download` |
| 通知 | `GET /notifications`、`GET /notifications/unread-count`、`PATCH /notifications/:id/read` |
| 管理 | `GET /admin/users`、`GET/PUT /admin/enrollment-period`、`GET /admin/enrollment-logs` |
| 健康 | `GET /health/live`、`GET /health/ready` |

服务地址为 `http://localhost:3001`；本地账户为 `admin@course.local`、`teacher@course.local`、`student@course.local`，密码均为 `Course123456`。

## 给 B/C

- 课程服务已拥有自己的 `course_service` 数据库。不得读取或写入其 `User`、`Course`、`Class`、选课、公告、资料和通知表。
- 当前可先按公开 API 完成 Gateway 路由联调；外部路径最终由 C 映射为 `/api/**`。
- 用户、课程、权限、班级成员/学生名单、通知写入的 `/internal/**` 契约将在 9 月 2 日冻结。请在当天开始前提交必要字段、批量需求和调用方身份。

## 给 D

- 服务名：`course-service`；端口：`3001`；数据库：`course_service`。
- 配置变量：`DATABASE_URL`、`PORT`、`CORS_ORIGIN`、`JWT_SECRET`、`INTERNAL_SERVICE_TOKEN`、`UPLOAD_DIR`。
- 健康探针：`/health/live` 与 `/health/ready`。
- Dockerfile、Deployment、Service 在 9 月 3 日由 A 提供基础版本；请不要把本服务回接到 `teaching_platform`。

## 给 E

课程服务已有可复现入口：

```powershell
cd E:\Projects\SE_edu_platform\platForm\course-service
npm run db:seed
npm run start
# 新终端：npm run test:api
```

API 冒烟测试覆盖 UC01—UC04、UC10 的代表正常、权限和冲突路径。网关/浏览器 E2E 仍待 C 的路由接入后执行；请将其标记为“待网关联调”，不要用单体结果替代。
