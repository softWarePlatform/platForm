# A：课程服务交付与验收记录

## 交付位置

| 项目 | 位置 |
| --- | --- |
| 服务、环境样例、测试 | `course-service/` |
| Schema、迁移、seed | `course-service/prisma/` |
| 生产 Dockerfile | `course-service/Dockerfile` |
| 基础 K8s 资源 | `k8s/course-service/course-service.yaml` |
| K8s 配置样例 | `k8s/course-service/config.example.yaml` |
| 内部 API 契约 | `docs/胡思琪/2026-09-02/02-A-course-service-内部接口与验收.md` |

## 架构与数据归属

```text
Gateway（C，待接入）
        ↓ 公开 /api 路由
course-service ──HTTP── homework-grade-service（C，待提供摘要）
        │        └────── lab-practice-service（B，待提供摘要）
        ↓
course_service PostgreSQL（A 独占）
```

独占表为 User、Course、Class、Enrollment、EnrollmentWaitlist、EnrollmentLog、EnrollmentPeriod、TimetableConfirmation、CourseAnnouncement、AnnouncementMark、AnnouncementRead、CourseMaterial、MaterialFavorite、SiteNotification 与 `InternalNotificationRequest`。课程服务不包含、也不查询作业、实验、提交或评测表。

## 启动与验证

1. 复制 `.env.example` 为本地 `.env` 并设置 `DATABASE_URL`、JWT 与内部服务令牌。
2. `npm run db:migrate`：只应用迁移，不重置数据。
3. 空演示环境使用 `npm run db:seed`；该命令会清空 **course_service**，不可用于真实环境。
4. `npm run build && npm run start`。
5. `npm run test` 与在已启动、已 seed 的演示服务上执行 `npm run test:api`。

本次实测：迁移无待执行项；Unit/契约测试 4/4 通过；API 冒烟测试通过；镜像 `teaching-platform-course-service:local-20260903` 构建成功，非 root 用户 `course` 运行，容器内 live/ready 都返回 200。

## 配置变量

`DATABASE_URL`、`PORT`、`CORS_ORIGIN`、`JWT_SECRET`、`INTERNAL_SERVICE_TOKEN`、`UPLOAD_DIR`、`HOMEWORK_SERVICE_URL`、`LAB_SERVICE_URL`、`UPSTREAM_TIMEOUT_MS` 均在 `.env.example` 中说明。

## UC01 代表用例证据

`npm run test:api` 验证学生登录后选中 `CS-SVC-101` 返回 201；再选择时段重叠的 `CS-SVC-102` 返回 409。相同测试还验证学生不能创建课程（403）、内部令牌缺失（401）、内部通知重试不重复写入、以及两个上游不可用时 Dashboard 明确返回 `UNAVAILABLE`。

## 已知边界

- B/C 的独立服务、批量摘要端点和 Gateway 尚未在工作区出现，真实跨服务与 `/api/**` 网关回归待其完成后执行。
- 本机没有可连接 Kubernetes API Server，YAML 已提供但未作集群 apply。
- `npm audit` 提示 3 个高风险依赖项；为避免未经评估的破坏性升级，本次未自动执行 `audit fix --force`。
