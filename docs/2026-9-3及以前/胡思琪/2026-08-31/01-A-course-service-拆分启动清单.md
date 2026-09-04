# A 任务清单：course-service 拆分启动

- 日期：2026-08-31
- 范围：`course-service` 的独立工程与 UC01—UC04、UC10 的课程域基础能力。
- 不在本日范围：作业/成绩（C）、实验/练习/讨论/Judge Worker（B）、网关、CI/CD、Kubernetes 集群集成（D）。

## 今日目标

建立一个能独立构建、启动和健康检查的 `course-service/`，明确课程域的代码、路由与数据边界。先保证服务骨架和最小 API 可用，再迁移业务实现；不要把其他两个服务的表或路由复制进来。

## 任务清单

- [x] 新建 `course-service/` 独立 Node.js/Fastify/TypeScript 工程，提供 `dev`、`build`、`start`、`test` 与 `db:migrate` 命令。
- [x] 提供 `GET /health/live` 与 `GET /health/ready`；`ready` 实际检查本服务数据库连接。
- [x] 迁移课程目录、课程详情核心 API，并整理认证、选课/候补、公告、课程资料、通知、管理和 Dashboard 的后续路由入口；未迁移功能见 `02-A-course-service-数据边界确认.md`。
- [x] 建立公开路由归属表，保留现有前端兼容路径：`/api/auth/**`、`/api/courses/**`、`/api/enrollment/**`、`/api/announcements/**`、`/api/materials/**`、`/api/notifications/**`、`/api/admin/**`、`/api/dashboard/**`。
- [x] 将下列单体文件按“可迁移 / 需改为远程调用 / 不属于本服务”标记，并记录目标位置：`auth.ts`、`courses.ts`、`enrollment.ts`、`announcements.ts`、`course-materials.ts`、`notifications.ts`、`admin.ts`、`dashboard.ts`。
- [x] 建立服务配置样例：端口、`DATABASE_URL`、JWT 校验、上传目录、内部服务认证/Request-ID 配置；未提交真实密钥。
- [x] 完成独立服务最小验证：构建、路由归属测试、`/health/live`、`/health/ready`、课程目录和非法 ID 校验均通过。

## 数据边界确认

课程服务独占：`User`、`Course`、`Class`、`Enrollment`、`EnrollmentWaitlist`、`EnrollmentLog`、`EnrollmentPeriod`、`TimetableConfirmation`、`CourseAnnouncement`、`AnnouncementMark`、`AnnouncementRead`、`CourseMaterial`、`MaterialFavorite`、`SiteNotification`。

作业、成绩、实验、练习、讨论和评测表不复制到本服务。涉及这些数据的 Dashboard 逻辑先保留聚合接口边界，9 月 2 日改为调用其他服务的内部 API。

## 完成标准与证据

1. `course-service` 可以在不启动单体 API 的前提下独立执行构建和启动。
2. 健康检查区分存活与就绪；数据库不可用时就绪检查失败。
3. 路由、配置和数据归属清单提交到仓库；无跨服务表的直接 Prisma 查询。
4. 保存构建日志、健康检查响应与提交记录，供当天站会和后续测试追溯使用。

实际证据见 `03-A-course-service-验收记录.md`；跨成员使用说明见 `04-A-course-service-同步说明.md`。

## 需同步给其他成员

- 给 C：公开路由归属与认证/Request-ID 传递要求，供 Gateway 精确转发。
- 给 B/C：课程服务内部接口草案与调用身份约定；具体接口在 9 月 2 日冻结。
- 给 D：服务名称、端口、健康检查路径和配置变量，供容器与 K8s 规范接入。
