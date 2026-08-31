# A：course-service 首日同步说明

- 日期：2026-08-31
- 同步目的：让 B、C、D、E 知道可用能力、未实现接口和后续依赖，避免提前接入或跨库访问。

## 当前可用

| 项目 | 地址/命令 | 说明 |
| --- | --- | --- |
| 服务端口 | `http://localhost:3001` | 仅本机直接开发验证；尚未接入 Gateway |
| 存活检查 | `GET /health/live` | 进程存活 |
| 就绪检查 | `GET /health/ready` | 需要课程服务数据库可访问 |
| 课程目录 | `GET /courses?category=&search=` | 只返回已发布课程 |
| 课程详情 | `GET /courses/:id` | 仅已发布课程；非法 UUID 返回 400 |
| 构建 | `npm run build` | 在 `course-service/` 目录执行 |

## 当前不可依赖

以下路由目前只完成归属登记，**尚未实现为 course-service API**：认证、选课/候补、公告、资料、通知、管理员、内部权限/名单/通知接口和 Dashboard 聚合。B/C 不得读取课程数据库或假设这些端点已经可调用。

## 给 B 与 C

1. 课程域表由 A 管理；不得直接连接或查询 `User`、`Course`、`Class`、`Enrollment`、公告、资料和通知表。
2. 计划于 9 月 2 日提供并冻结：用户、课程、课程权限、课程成员/班级、通知写入等 `/internal/**` 接口。
3. 请在接口启用前提交所需字段、调用方身份和异常场景；权限依赖失败将采用 fail-closed。

## 给 C（Gateway）

当前仅可把开发验证流量路由到课程目录/详情。其余 `/api/auth/**`、`/api/enrollment/**`、`/api/announcements/**`、`/api/materials/**`、`/api/notifications/**`、`/api/admin/**`、`/api/dashboard/**` 的最终转发配置须等 A 逐项实现后启用。Dashboard 必须等 homework/lab 的内部汇总接口可用后再聚合，不能转回直连数据库。

## 给 D（容器与部署）

- 服务名：`course-service`
- 本机开发端口：`3001`
- 配置：`DATABASE_URL`、`PORT`、`CORS_ORIGIN`
- 健康检查：`/health/live`、`/health/ready`
- Dockerfile、Deployment、Service 在 9 月 3 日由 A 提供基础版本；D 负责统一镜像、K8s 和 CI/CD 集成。

## 给 E（质量）

当前可复现首日验证：独立构建、两类健康检查、课程目录、课程详情和非法 ID。请将 UC01—UC04、UC10 的完整 E2E 标记为待后续课程路由迁移完成后执行；本日不把单体回归结果混作微服务结果。

## 环境注意事项

本机 `5433` 已被非项目 PostgreSQL 占用。项目 Docker PostgreSQL 对宿主机暴露 `55432`；所有本机源码服务应使用 `localhost:55432`。容器间连接仍为 `db:5432`。
