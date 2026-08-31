# A：course-service 首日验收记录

- 日期：2026-08-31
- 验收对象：`course-service/`
- 结论：**通过首日拆分验收**。

## 1. 已完成项

| 清单项 | 结果 | 证据 |
| --- | --- | --- |
| 独立工程与脚本 | 通过 | `course-service/package.json` 包含 `dev`、`build`、`start`、`test`、`db:generate`、`db:migrate` |
| 独立配置样例 | 通过 | `course-service/.env.example`；运行实例使用本地 `.env` |
| 课程域最小 Prisma Client | 通过 | `course-service/prisma/schema.prisma` 仅含课程域模型 |
| 存活检查 | 通过 | `GET http://localhost:3001/health/live` 返回 `ok=true` |
| 数据库就绪检查 | 通过 | `GET http://localhost:3001/health/ready` 返回 `ok=true` |
| 核心课程 API | 通过 | `GET http://localhost:3001/courses` 返回 14 条演示课程 |
| 参数异常 | 通过 | `GET /courses/not-a-uuid` 返回 HTTP 400 与“课程 ID 无效” |
| 独立构建 | 通过 | `npm run db:generate`、`npm run build` 均退出成功 |
| 路由归属测试 | 通过 | `npm run test`：1/1 通过 |
| 迁移命令 | 通过 | `npm run db:migrate` 成功执行；首日没有课程服务专属迁移待应用 |
| 路由与数据边界盘点 | 通过 | `course-service/src/route-ownership.ts` 与 `02-A-course-service-数据边界确认.md` |

## 2. 执行命令

```powershell
cd E:\Projects\SE_edu_platform\platForm\course-service
npm run db:generate
npm run build
npm run test
npm run db:migrate
npm run start
```

在另一个 PowerShell 窗口执行：

```powershell
Invoke-RestMethod http://localhost:3001/health/live
Invoke-RestMethod http://localhost:3001/health/ready
Invoke-RestMethod http://localhost:3001/courses
```

## 3. 本机环境修正

发现宿主机另一个 `postgres.exe` 占用了 IPv4 `5433`，会导致 Windows 上直接运行的新服务连接到错误数据库。项目 Docker PostgreSQL 已改映射到 `55432`，配置同步如下：

- 根目录 `.env`：`POSTGRES_PORT=55432`；
- `backend/.env`、`judge-worker/.env`、`course-service/.env`：连接 `localhost:55432`；
- Docker 容器内部仍使用 `db:5432`，现有数据卷和演示数据未删除。

## 4. 范围说明

首日完成的是“独立工程、健康检查、核心课程 API、路由/数据边界审计”，符合 D6 的独立启动与核心 API 验收目标。课程创建、选课、公告、资料、通知、管理、内部接口和远程 Dashboard 聚合分别进入 9 月 1 日和 9 月 2 日清单；本记录不将它们误记为已完成。
