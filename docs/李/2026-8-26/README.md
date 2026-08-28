# 2026-08-26 容器化交付材料

## 交付结论

本日已完成项目容器化配置、镜像构建和 Compose 运行验收：

- 后端、前端和评测 Worker 的本地生产构建通过。
- `docker compose config --quiet` 解析通过。
- 后端错误的根目录本地依赖已移除。
- 数据库迁移改为独立的一次性 Compose 服务。
- API 与 Worker 已共享持久化上传目录。
- PostgreSQL、Redis、API 和 Nginx 均配置健康检查。
- 前端 Nginx 已补充通知 SSE 代理配置。
- 已提供显式且带清库警告的 seed 服务。
- 根目录已增加 `.dockerignore`，避免把依赖、构建产物和大型交付文件发送到 Docker 构建上下文。
- 镜像依赖下载已增加 npm 缓存/重试和 apt 重试，降低代理链路波动造成的失败。
- Worker 构建阶段已补齐 OpenSSL，使 Prisma 生成与 Debian Bookworm 匹配的查询引擎。
- 全部常驻服务已启动；live、ready 和课程列表接口均通过 Nginx 返回 200。
- 浏览器登录、选课、个人课表、公告已读、资料收藏/预览/下载、通知 SSE 和实际评测链路均已验收。
- 自动集成测试 12/12 通过。

Docker Desktop 图形界面由用户本人启动和调整；在用户明确授权后，Codex 执行了 Docker CLI 和内置浏览器验收。未修改 Docker Desktop 设置或 WSL，也未执行会清空数据的 seed。

## 文档目录

| 文件 | 内容 |
| --- | --- |
| [01-容器化实现说明.md](./01-容器化实现说明.md) | 项目现状、架构、修改内容和交付物 |
| [02-Docker-Compose操作手册.md](./02-Docker-Compose操作手册.md) | 用户需要执行的详细软件操作步骤 |
| [03-容器化验收记录.md](./03-容器化验收记录.md) | 已完成的静态验证及待填写的运行验证 |
| [04-问题与风险清单.md](./04-问题与风险清单.md) | 已修正问题、剩余环境风险和排障方法 |
| [05-浏览器与业务链路验收.md](./05-浏览器与业务链路验收.md) | 浏览器逐页检查、SSE、资料和实际评测证据 |

## 本次相关代码

| 文件 | 用途 |
| --- | --- |
| `/.dockerignore` | 根构建上下文过滤规则 |
| `/backend/Dockerfile` | 后端构建与运行镜像 |
| `/judge-worker/Dockerfile` | 评测 Worker 构建与运行镜像 |
| `/nginx/Dockerfile` | 前端 Vite 构建与 Nginx 运行镜像 |
| `/nginx/default.conf` | SPA、API 和 SSE 反向代理 |
| `/docker-compose.yml` | PostgreSQL、Redis、迁移、seed、API、Worker 和 Nginx 编排 |
| `/.env.example` | Compose 环境变量模板 |

## 当前状态

| 检查项 | 状态 |
| --- | --- |
| 后端 TypeScript 构建 | 通过 |
| 前端 Vite 生产构建 | 通过，存在原有的主包大于 500 kB 警告 |
| Worker TypeScript 构建 | 通过 |
| 后端锁文件一致性检查 | 通过 |
| Compose 配置解析 | 通过 |
| Docker 服务端检查 | 通过：Client/Server 29.3.1，Docker Desktop 4.67.0 |
| Docker 镜像实际构建 | 通过：api、migrate、judge-worker、nginx 全部 Built |
| 全栈容器启动 | 通过：db、redis、api、nginx healthy；worker Up；migrate Exited (0) |
| `/health/live` | 通过：`ok=true` |
| `/health/ready` | 通过：`ok=true` |
| `/api/courses` | 通过：返回 14 门课程 |
| 四组关键日志 | 通过：未发现运行错误；仅有 Prisma 配置弃用提示 |
| 浏览器端到端联调 | 通过：学生登录及主要页面正常 |
| 通知 SSE | 通过：Nginx 日志多次返回 HTTP 200 |
| 课程资料 | 通过：收藏、预览、下载均复验成功 |
| 实际评测链路 | 通过：JavaScript 测试提交返回 100 分 |
| 自动集成测试 | 通过：12/12，失败 0 |

### 运行验收摘要

首次构建曾遇到 Docker Hub EOF、npm `ECONNRESET` 和 Debian 源 502。用户调整 Docker Desktop 代理后基础镜像可正常拉取；项目又增加了下载缓存和重试，最终以下命令退出码为 0：

```powershell
docker compose build --progress=plain
docker compose up -d
```

Worker 首次启动暴露了 Prisma OpenSSL 引擎不匹配，修复构建镜像后已稳定监听 `judge-submissions`。详细过程见 `03-容器化验收记录.md` 和 `04-问题与风险清单.md`。

浏览器首次读取资料时发现数据库记录与新命名上传卷不同步，预览和下载返回 404。将宿主机已有 `backend/uploads` 非破坏性合并到 `api_uploads` 后，卷内文件由 1 个增至 494 个，预览恢复，下载请求返回 HTTP 200；本轮新实验提交文件仍保留。
