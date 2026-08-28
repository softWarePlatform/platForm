# Docker Compose 操作手册

本文用于指导用户手工复现。2026-08-26 的验收中，Docker Desktop 图形界面由用户操作；用户明确授权后，Docker CLI 检查由 Codex 执行。执行前请保存正在编辑的文件。

## 1. 启动 Docker Desktop

1. 打开 Windows 开始菜单。
2. 搜索并打开 **Docker Desktop**。
3. 等待界面显示 Docker Engine 已运行，不要在初始化过程中反复点击重启。
4. 打开一个新的 PowerShell 窗口，无特殊需求时不必使用管理员身份。
5. 进入项目目录：

```powershell
cd "E:\2026暑假\软工小学期\code\platForm"
```

6. 检查客户端和服务端是否都能显示版本：

```powershell
docker version
docker compose version
```

如果 `docker version` 只有 Client、没有 Server，或提示连接 `dockerDesktopLinuxEngine` 失败，说明引擎尚未就绪。回到 Docker Desktop 查看提示，不要继续构建。

## 2. 准备环境变量

首次使用时执行：

```powershell
Copy-Item .env.example .env
notepad .env
```

至少将 `JWT_SECRET` 改成较长的随机字符串。默认端口如下：

```dotenv
POSTGRES_PORT=5433
REDIS_PORT=6379
WEB_PORT=80
CORS_ORIGIN=http://localhost
```

如果把 `WEB_PORT` 改为 `8080`，同时把 `CORS_ORIGIN` 改为 `http://localhost:8080`，访问地址也改为 `http://localhost:8080`。

## 3. 检查端口占用

在 PowerShell 中执行：

```powershell
Get-NetTCPConnection -LocalPort 80,5433,6379 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess
```

如果端口被其他程序占用，优先修改 `.env` 中对应端口。不要在不知道进程用途的情况下强制结束进程。

## 4. 校验 Compose

```powershell
docker compose config --quiet
```

命令无输出且退出码为 0 表示配置解析通过。需要查看展开后的完整配置时执行：

```powershell
docker compose config
```

## 5. 构建镜像

```powershell
docker compose build --progress=plain
```

Compose 可能提示 `--progress` 更适合作为全局参数；等价的推荐写法是：

```powershell
docker compose --progress plain build
```

应完成以下构建：

- backend build/runtime；
- judge-worker build/runtime；
- frontend + nginx。

若 Docker Hub 出现证书、代理或超时错误，应在 Docker Desktop 中检查代理和镜像源；不要通过删除锁文件规避网络问题。

网络较慢时可按服务顺序重试，以降低并发连接数；已成功的层会从缓存复用：

```powershell
docker compose --progress plain build migrate
docker compose --progress plain build api
docker compose --progress plain build judge-worker
docker compose --progress plain build nginx
docker compose build --progress=plain
```

## 6. 启动已有数据库环境

如果数据库卷中已有需要保留的数据，执行：

```powershell
docker compose up -d
```

该命令会自动执行待应用的 Prisma migration，但不会运行 seed，也不会主动清空数据。

## 7. 首次创建演示环境

仅在确认允许清空并重建演示数据时执行以下步骤：

```powershell
docker compose up -d db redis
docker compose up migrate
docker compose --profile tools run --rm seed
docker compose up -d api judge-worker nginx
```

警告：第三条 seed 命令会清空所有业务表和演示上传文件。共享数据库、保留数据环境或生产环境禁止执行。

### 7.1 已有数据库迁移到新上传卷

若保留了已有 PostgreSQL 数据，但 `api_uploads` 是首次创建，可能出现“资料列表正常、预览和下载返回 404”。先确认宿主机 `backend/uploads` 中确有与数据库匹配的旧文件，然后执行：

```powershell
$apiContainerId = docker compose ps -q api
docker cp "backend/uploads/." "${apiContainerId}:/app/uploads/"
docker compose exec -T api sh -c "find /app/uploads -type f | wc -l"
```

该操作把旧文件合并进命名卷，不删除数据库或卷；同名文件可能被宿主机版本覆盖，因此只用于确认数据库和宿主机上传目录属于同一套环境的迁移场景。不要为解决该问题执行 `down -v` 或重新 seed。

## 8. 检查容器状态

```powershell
docker compose ps -a
```

预期：

| 服务 | 预期状态 |
| --- | --- |
| `db` | `Up ... (healthy)` |
| `redis` | `Up ... (healthy)` |
| `migrate` | `Exited (0)` |
| `api` | `Up ... (healthy)` |
| `judge-worker` | `Up` |
| `nginx` | `Up ... (healthy)` |

## 9. 检查日志

```powershell
docker compose logs --tail 100 migrate
docker compose logs --tail 100 api
docker compose logs --tail 100 judge-worker
docker compose logs --tail 100 nginx
```

重点确认：

- migrate 显示所有迁移已应用或数据库已是最新；
- API 没有 Prisma、Redis、端口或 JWT 启动错误；
- Worker 已监听 `judge-submissions` 队列；
- Nginx 没有 upstream 连接失败。

## 10. 健康和 API 验证

```powershell
Invoke-RestMethod http://localhost/health/live
Invoke-RestMethod http://localhost/health/ready
Invoke-RestMethod http://localhost/api/courses
```

前两个接口应返回 `ok=true`，第三个接口应包含 `courses` 数组。

如果修改了 `WEB_PORT`，请在 URL 中带上新端口。

## 11. 浏览器验证

1. 打开 `http://localhost`。
2. 使用演示账号登录。
3. 检查首页、课表、选课、公告和课程资料。
4. 打开浏览器开发者工具的 Network 面板。
5. 确认普通 `/api/*` 请求没有 502。
6. 确认 `/api/notifications/events` 不再出现 `ECONNREFUSED`，并保持长连接。
7. 提交一个已有实验时，检查 Worker 是否处理评测任务。

本次实测还应确认：

- 打开公告详情后，返回列表可看到“未读”变成“已读”；
- 资料收藏按钮由 `☆` 变为 `★`；
- 资料预览弹出标题和 iframe；
- 下载请求在 Nginx 日志中为 HTTP 200；
- SSE 日志中的 `/api/notifications/events` 为 HTTP 200；
- 实验提交最终显示“通过”及分数。

## 12. 自动集成验证

演示数据存在时，在项目根目录执行：

```powershell
$env:API_BASE_URL="http://localhost/api"
$env:WEB_BASE_URL="http://localhost"
npm run test:integration
Remove-Item Env:API_BASE_URL
Remove-Item Env:WEB_BASE_URL
```

结果会写入 `test-results/ci-integration.json`。

## 13. 停止与再次启动

停止容器但保留数据：

```powershell
docker compose down
```

再次启动：

```powershell
docker compose up -d
```

只查看实时日志：

```powershell
docker compose logs -f api nginx judge-worker
```

不要随意执行 `docker compose down -v`。`-v` 会删除 PostgreSQL、Redis 和上传文件卷，属于数据清除操作。
