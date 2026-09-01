# A：course-service 独立数据与迁移记录

- 日期：2026-09-01
- 结论：**通过**。课程服务已使用独立数据库，不再读取单体 `teaching_platform`。

## 数据库与迁移

| 项目 | 结果 |
| --- | --- |
| PostgreSQL 实例 | 项目 Docker PostgreSQL，宿主机端口 `55432` |
| 单体数据库 | `teaching_platform`，未修改 |
| 课程服务数据库 | `course_service`，已新建 |
| 首个迁移 | `course-service/prisma/migrations/20260901015856_init/migration.sql` |
| 部署验证 | `npm run db:migrate`：发现 1 条迁移，无待应用迁移 |
| 演示数据 | `npm run db:seed` 成功 |

`course_service` 实际表为：`User`、`Course`、`Class`、`Enrollment`、`EnrollmentWaitlist`、`EnrollmentLog`、`EnrollmentPeriod`、`TimetableConfirmation`、`CourseAnnouncement`、`AnnouncementMark`、`AnnouncementRead`、`CourseMaterial`、`MaterialFavorite`、`SiteNotification` 及 Prisma 迁移表。

## 数据边界校验

1. 课程服务 Schema 和源码未定义/访问 `Homework`、`LabSet`、`Lab`、`Submission`、`Practice*`、`WrongBookEntry`、`Discussion*` 等外域模型。
2. `SiteNotification` 可以保留 `homeworkId`、`labSetId` 等外部业务标识，但不包含外域 Prisma 关系，也不查询外域表。
3. Dashboard 未迁入外域直查逻辑，保留到 9 月 2 日改为通过 homework/lab 内部汇总接口聚合。
4. 本服务的种子数据只写入 `course_service`，包括管理员、教师、两名学生、两门课程及选课阶段；不会影响单体演示账号或课程数据。

## 可复现命令

```powershell
cd E:\Projects\SE_edu_platform\platForm\course-service
npm run db:generate
npm run db:migrate
npm run db:seed
```

本机 `.env` 使用：

```dotenv
DATABASE_URL=postgresql://platform:platform@localhost:55432/course_service?schema=public
```

`55432` 是项目 Docker 数据库端口；宿主机 `5433` 由非项目 PostgreSQL 占用，不能用于本服务。
