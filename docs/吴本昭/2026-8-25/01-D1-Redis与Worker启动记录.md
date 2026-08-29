# D1 Redis 与 Worker 启动记录

- 日期：2026-08-25
- 负责人：吴本昭
- 对应任务：启动 Redis 和评测 Worker
- 验收：Worker 能消费 `judge-submissions` 队列中的评测任务

## 1. 环境探测

| 项目 | 结果 |
| --- | --- |
| Node.js | v24.15.0 |
| Docker Engine | 29.1.3（Docker Desktop 启动后可用） |
| 本机 PostgreSQL 服务 | `postgresql-x64-18` 正在运行，占用 **5433**（进程 `postgres`） |
| 本机 Python | Anaconda `python` 3.13.5 可用；`python3` 指向 WindowsApps 占位程序，Worker 调用 `python3` 会失败 |
| `backend/.env` | 本次按 `backend/.env.example` 创建（已 gitignore，不入库） |

## 2. Redis

命令：`docker compose up -d redis`

| 检查 | 结果 |
| --- | --- |
| 容器 | `platform-redis-1`，镜像 `redis:7-alpine` |
| 端口 | `0.0.0.0:6379->6379/tcp` |
| 健康 | `healthy` |
| `docker compose exec -T redis redis-cli ping` | `PONG` |
| API `/health/ready` | HTTP 200，`ok=true`（含 Redis） |

## 3. PostgreSQL（评测依赖，本任务联调）

`docker compose up -d db` 已拉起 `platform-db-1`，内部用户 `platform` 正常。但宿主机 **5433 已被本机 PostgreSQL 18 占用**，从 Windows 连 `localhost:5433` 会打到本机实例并出现 Prisma `P1000` 认证失败。

处理（不改仓库 `docker-compose.yml`）：另起容器映射 **5434**：

```text
docker run -d --name platform-db-5434 --network platform_default
  -e POSTGRES_USER=platform -e POSTGRES_PASSWORD=platform
  -e POSTGRES_DB=teaching_platform -p 5434:5432 postgres:16-alpine
```

`backend/.env` 中 `DATABASE_URL` 使用 `localhost:5434`。随后：

| 命令 | 结果 |
| --- | --- |
| `cd backend && npm run db:deploy` | 24 条迁移全部应用 |
| `npm run db:seed` | 演示数据写入成功（12 课 / 5 教师 / 20 学生） |

依赖安装：首次 `npm install` 在系统代理 `127.0.0.1:7897` 不可用时失败。取消 `HTTP_PROXY`/`HTTPS_PROXY` 后，backend / frontend / judge-worker 依赖安装完成。

## 4. API 与 Worker

| 进程 | 启动方式 | 结果 |
| --- | --- | --- |
| 后端 API | `cd backend && npm run dev`（`DATABASE_URL` 指向 5434） | 监听 `http://127.0.0.1:3000` |
| judge-worker | `cd judge-worker && npm run dev` | 日志：`Judge worker listening on judge-submissions` |
| 前端 Vite | `cd frontend && npm run dev` | 进程报 `http://localhost:5173/`；实际仅监听 **IPv6 `::1:5173`**，IPv4 `127.0.0.1:5173` 连不上 |

## 5. Worker 消费证据

独立脚本 `node scripts/d1-uc06-uc08-verify.mjs` 提交 JavaScript 题后轮询提交记录：

| 步骤 | submissionId | 入队状态 | 终态 |
| --- | --- | --- | --- |
| 正确代码 | `9681e3d6-4e8c-4fef-a143-1a2132cecfe3` | PENDING | **ACCEPTED / 100** |
| 错误代码 | （脚本日志） | PENDING | **WRONG_ANSWER / 0** |
| 打回后补交 | `c5cfe5c5-9c68-4e9c-b107-9b44404ce23e` | PENDING | **ACCEPTED** |

现有脚本 `node scripts/retest-lab-submit.mjs`：

| 用例 | 结果 |
| --- | --- |
| TC-LAB-003-js-hello | **ACCEPTED / 100**（Worker 消费 JS 任务正常） |
| TC-LAB-003-py-apb | 入队成功，终态 **ERROR / 0**（本机无可用 `python3` 命令） |

原始 JSON：`raw/uc06-uc08-verify.json`。

## 6. 本步缺陷 / 环境备注

| 编号 | 说明 | 是否阻塞 D1 验收 |
| --- | --- | --- |
| ENV-D1-01 | 宿主机 5433 被本机 PostgreSQL 占用，与 compose `db` 端口冲突 | 否（已用 5434 绕过）；需告知李璐曼/范文歆 |
| ENV-D1-02 | Worker 用 `python3` 跑 Python 题，Windows 默认失败 | 否（JS 题已证明队列消费）；D3 建议 runner 回退到 `python`/`py` |
| ENV-D1-03 | Vite 只绑 `::1`，部分客户端和 `step6` 前端可达性检查失败 | 否（UC 主证据走 API）；D4 README 应写明 `--host 127.0.0.1` |
| ENV-D1-04 | 系统 HTTP 代理 7897 未开时 npm 失败 | 否（已临时取消代理安装） |
