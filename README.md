# 在线教学与实训平台

本仓库包含 React 前端、API Gateway、三个 Fastify 业务微服务、兼容 API、Judge Worker、PostgreSQL 和 Redis。CI/CD 使用 GitHub Actions 构建带 Git 提交 SHA 的镜像，并在四组数据库迁移成功后部署到 Kubernetes。权威运维说明见 [`docs/devops/README.md`](docs/devops/README.md)。

## 1. 目录与服务

| 组件 | 实现 | 容器/端口 |
| --- | --- | --- |
| Web | React + Vite + Nginx | `nginx`，宿主机默认 `8080` |
| API Gateway | Fastify | `api-gateway`，容器网络 `3081`，统一转发 `/api/*` |
| Course Service | Fastify + Prisma | `course-service`，容器网络 `3001` |
| Homework Grade Service | Fastify + Prisma | `homework-grade-service`，容器网络 `3002` |
| Lab Practice Service | Fastify + Prisma | `lab-practice-service`，容器网络 `3003` |
| 兼容 API | Fastify + Prisma | `api`，仅承接尚未迁移路由，容器网络 `3000` |
| Judge Worker | BullMQ | `judge-worker` |
| 数据库 | PostgreSQL 16 官方镜像 | `db`，宿主机默认 `5433` |
| 队列 | Redis 7 官方镜像 | `redis`，宿主机默认 `6379` |

健康检查：

- `http://localhost:8080/health/live`：进程存活；
- `http://localhost:8080/health/ready`：数据库和 Redis 已就绪。

## 2. 新机器首次启动

### 2.1 环境要求

- Git；
- Docker Desktop 或 Docker Engine + Compose；
- 建议 Docker 29+、Docker Compose 5+；
- 若需要本地执行 npm 测试，安装 Node.js 24。

### 2.2 准备配置

在仓库根目录执行：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`，至少替换 `JWT_SECRET`。`.env` 不得提交到 Git。

### 2.3 构建并启动演示环境

```powershell
docker compose config --quiet
docker compose build

docker compose up -d --build
docker compose --profile tools run --rm seed
docker compose ps -a
```

`seed` 会清理业务表并写入演示数据，只能用于首次创建或允许重置的演示/测试数据库。生产环境只执行 migration，禁止执行 seed。

演示账号：

- 管理员：`admin@demo.local`；
- 教师：`teacher@demo.local`；
- 学生：`student@demo.local`；
- 密码：`Demo123456`。

浏览器访问 `http://localhost:8080`。

### 2.4 健康验证

```powershell
Invoke-RestMethod http://localhost:8080/health/live
Invoke-RestMethod http://localhost:8080/health/ready
Invoke-RestMethod http://localhost:8080/api/courses
```

前两个请求必须返回 `ok=true`，课程接口应返回 JSON。

### 2.5 日常操作

```powershell
# 启动或恢复，不重建演示数据
docker compose up -d

# 查看状态和日志
docker compose ps -a
docker compose logs --tail 100 api-gateway course-service homework-grade-service lab-practice-service judge-worker nginx

# 停止但保留数据库、Redis 和上传文件
docker compose down
```

不要在需要保留数据时执行 `docker compose down -v`，该命令会删除命名卷。

## 3. 数据库建表、迁移和测试数据

数据库定义分别位于：

- `backend/prisma/schema.prisma`；
- `course-service/prisma/schema.prisma`；
- `homework-grade-service/prisma/schema.prisma`；
- `lab-practice-service/prisma/schema.prisma`。

容器环境中：

```powershell
# 仅运行数据库初始化和四组迁移
docker compose up db-init legacy-migrate course-migrate homework-migrate lab-migrate

# 明确允许重置演示数据时才执行
docker compose --profile tools run --rm seed
```

本地 Node.js 环境中：

```powershell
# 兼容 API
npm run db:migrate
npm run db:seed

# 独立业务服务
npm run db:migrate --prefix course-service
npm run db:migrate --prefix homework-grade-service
npm run db:migrate --prefix lab-practice-service
```

## 4. 编译与测试

首次安装本地依赖：

```powershell
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix api-gateway
npm ci --prefix course-service
npm ci --prefix homework-grade-service
npm ci --prefix lab-practice-service
npm ci --prefix judge-worker
```

常用命令：

```powershell
# 编译 API、Web、Worker
npm run build

# 所有独立服务和 Worker 测试
npm run test:services

# 需要已迁移的测试数据库
npm run test:dao

# 需要已启动且包含演示数据的 API
npm run test:integration
npm run test:api
npm run test:course
```

根目录 `npm test` 依次执行 Unit、DAO 和 API 测试；DAO/API 测试的数据库和服务依赖由 CI 自动准备。

## 5. CI/CD

流水线文件：`.github/workflows/ci-cd.yml`。

主分支 Push 的强依赖顺序：

```text
取代码 → 安装依赖 → migration/seed 测试库 → 编译
→ 单元测试 → DAO 集成测试 → 启动应用
→ HTTP/API 集成测试 → 构建并推送镜像
→ 数据库初始化与四组 migration Job → 部署 → rollout/健康检查/HPA 指标检查
```

`images` Job 依赖 `quality`，`deploy` Job 依赖全部镜像构建。任何命令返回非零，后续部署不会继续。

应用镜像发布到 GHCR，生产部署只使用不可变标签：

```text
sha-<40 位 Git commit SHA>
```

不使用 `latest` 部署。测试和部署证据通过 Actions Artifact 保存 90 天。

手工运行工作流时：

- `deploy=true`：允许部署当前提交；
- `simulate_failure=true`：在镜像构建前注入失败，用于验收后续 Job 是否被阻断。

## 6. Kubernetes 部署

清单位于 `k8s/monolith/`，部署脚本为：

- `scripts/deploy-k8s.ps1`；
- `scripts/health-check.ps1`。

生产部署脚本要求当前 kubeconfig 能连接集群，并通过环境变量提供：

```text
POSTGRES_PASSWORD
DATABASE_URL
JWT_SECRET
CORS_ORIGIN
GHCR_USERNAME
GHCR_PAT
```

示例：

```powershell
./scripts/deploy-k8s.ps1 `
  -ImagePrefix "ghcr.io/<owner>/teaching-platform" `
  -GitSha "<40位提交SHA>" `
  -EvidenceDirectory "test-results/deployment"
```

脚本会先部署 PostgreSQL/Redis，创建三个独立业务数据库，然后串行执行兼容 API、Course、Homework 和 Lab 的迁移任务；全部成功后才部署 Gateway、三个业务服务、兼容 API、Web 和 Worker。最终清单、日志和健康检查结果写入 `test-results/deployment/`。

Docker Desktop 本地一键部署：

```powershell
./scripts/install-metrics-server.ps1
./scripts/deploy-k8s-local.ps1
```

HPA 与负载实验见 [`docs/devops/HPA实验.md`](docs/devops/HPA实验.md)。

本地清单校验：

```powershell
kubectl kustomize k8s/monolith | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Invalid Kubernetes manifests" }
```

Kubernetes 默认入口为 NodePort `http://localhost:30080`。Ingress 使用 `teaching-platform.local`，需要集群已安装 NGINX Ingress Controller。

若当前本地 Kubernetes 运行在未映射 NodePort 的 Docker/WSL 网络中，可执行以下命令并保持终端运行，然后访问 `http://localhost:30080`：

```powershell
kubectl --namespace teaching-platform port-forward service/web 30080:80
```

## 7. GitHub 环境配置

`production` Environment 需要以下 Secrets：

| Secret | 用途 |
| --- | --- |
| `KUBE_CONFIG_B64` | kubeconfig 文件的 Base64 单行文本 |
| `POSTGRES_PASSWORD` | Kubernetes PostgreSQL 密码 |
| `DATABASE_URL` | 集群内 PostgreSQL 连接串；其中密码必须与 `POSTGRES_PASSWORD` 完全一致 |
| `JWT_SECRET` | JWT 签名密钥 |
| `CORS_ORIGIN` | 生产 Web 来源 |
| `GHCR_USERNAME` | GHCR 拉取账号 |
| `GHCR_PAT` | 具有 `read:packages` 的令牌 |

`DATABASE_URL` 应使用以下格式，其中 `<encoded-password>` 是与 `POSTGRES_PASSWORD` 相同的密码；若密码含 `@`、`:`、`/`、`%` 等 URL 特殊字符，需要先进行百分号编码：

```text
postgresql://platform:<encoded-password>@postgres:5432/teaching_platform?schema=public
```

部署 Job 使用 `[self-hosted, Windows, X64, k8s-local]` Runner。Runner 必须持续在线、安装 kubectl，并能够访问目标 Kubernetes 集群。

## 8. 常见故障

- 本地 Compose 迁移失败：查看 `docker compose logs legacy-migrate course-migrate homework-migrate lab-migrate`；
- Kubernetes 迁移出现 Prisma `P1000`：确认 `production` Environment 中 `DATABASE_URL` 内嵌密码与 `POSTGRES_PASSWORD` 完全一致。PostgreSQL 官方镜像只会在空数据目录首次初始化时使用 `POSTGRES_PASSWORD`；部署脚本会在保留 PVC 数据的前提下同步 `platform` 角色密码，再执行迁移；
- API readiness 失败：检查 PostgreSQL、Redis 和 `JWT_SECRET`；
- Worker 无结果：检查 Redis、Worker 日志以及 `/app/uploads` 共享卷；
- 宿主机 `6379` 已被占用：在 `.env` 中设置 `REDIS_PORT=6380`；容器内仍使用 `redis:6379`；
- `ImagePullBackOff`：检查 GHCR 镜像标签和 `ghcr-pull` Secret；
- Deploy Job 一直等待：确认带 `k8s-local` 标签的自托管 Runner 在线；
- Ingress 不可用：先使用 NodePort `30080` 验收，Ingress Controller 需单独安装。
