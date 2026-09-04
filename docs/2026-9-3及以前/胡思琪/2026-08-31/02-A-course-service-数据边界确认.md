# A：course-service 数据边界确认

- 日期：2026-08-31
- 状态：首日拆分边界已确认
- 依据：`任务划分-后五天.md`、`docs/范文歆/2026-8-29/01-D6-微服务划分图.md`、`docs/范文歆/2026-8-29/02-D6-最终服务接口清单.md`。

## 1. 本服务直接拥有的数据

`course-service` 的 Prisma Schema 仅定义以下课程域模型：

| 分类 | 模型 |
| --- | --- |
| 身份与角色 | `User` |
| 课程与班级 | `Course`、`Class` |
| 选课 | `Enrollment`、`EnrollmentWaitlist`、`EnrollmentLog`、`EnrollmentPeriod`、`TimetableConfirmation` |
| 公告 | `CourseAnnouncement`、`AnnouncementMark`、`AnnouncementRead` |
| 资料 | `CourseMaterial`、`MaterialFavorite` |
| 通知 | `SiteNotification` |

`Course.labWeight` 和 `Course.homeworkWeight` 没有进入新服务的 Schema；成绩权重后续由 `homework-grade-service` 管理。通知中允许保留 `homeworkId`、`labSetId` 作为外部业务 ID，但不建立外域数据库关联，也不查询其对应表。

## 2. 明确排除的数据

下列模型均不出现在 `course-service/prisma/schema.prisma`，且 `course-service/src` 不含对其 Prisma Client 的访问：

| 归属服务 | 排除模型 |
| --- | --- |
| `homework-grade-service` | `Homework`、`HomeworkAttachment`、`HomeworkRevision`、`HomeworkSubmission`、`HomeworkSubmissionVersion`、`HomeworkStudentFile`、`HomeworkRedoRequest`、`HomeworkKnowledgeAnalysis`、`HomeworkQuestion`、`GradingConfig` |
| `lab-practice-service` | `LabSet`、`Lab`、`LabFile`、`TestCase`、`Submission`、`PracticeKnowledgeTag`、`PracticeQuestion`、`PracticeSession`、`PracticeSessionItem`、`PracticeQuestionFeedback`、`WrongBookEntry`、`DiscussionPost`、`DiscussionComment`、`DiscussionAttachment` |

首日使用现有 `teaching_platform` 演示数据库完成独立启动验证，属于过渡连接；本服务的可访问模型已在 Schema 中收紧。9 月 1 日再建立课程服务独立数据库/schema 和迁移，禁止把现有单体表整体复制为课程服务 Schema。

## 3. 路由迁移边界

| 路由族 | 单体来源 | 8 月 31 日状态 | 后续动作 |
| --- | --- | --- | --- |
| `/api/courses/**` | `backend/src/routes/courses.ts` | 课程目录与详情已迁入；其余写接口待迁 | 9 月 1 日完成课程管理与选课核心链路 |
| `/api/auth/**` | `backend/src/routes/auth.ts` | 已登记 | 迁移认证与当前用户能力 |
| `/api/enrollment/**` | `backend/src/routes/enrollment.ts` | 已登记 | 迁移选课、候补、时段与课表 |
| `/api/announcements/**` | `backend/src/routes/announcements.ts` | 已登记 | 迁移公告和已读 |
| `/api/materials/**` | `backend/src/routes/course-materials.ts` | 已登记 | 迁移资料、下载、收藏与文件鉴权 |
| `/api/notifications/**` | `backend/src/routes/notifications.ts` | 已登记 | 迁移通知查询与写入 |
| `/api/admin/**` | `backend/src/routes/admin.ts` | 已登记 | 迁移管理员与审计能力 |
| `/api/dashboard/**` | `backend/src/routes/dashboard.ts` | 已登记，禁止直接迁移外域查询 | 9 月 2 日改为调用 homework/lab 内部汇总 API |

## 4. 边界校验结论

- 通过：新服务的 Schema 及源码未包含或直接访问作业、实验、练习、讨论、评测和成绩模型。
- 通过：`/courses` 的实现仅查询 `Course`、`User` 和 `Enrollment` 关系。
- 通过：单体 Dashboard 中的 `Homework`、`LabSet`、`Submission` 等直接查询未被复制到新服务。
- 待后续：内部权限/名单/通知 API 在 9 月 2 日按已冻结契约实现；在此之前 B/C 不得依赖未实现端点。
