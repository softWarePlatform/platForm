# DevOps 部署与验收手册

本文档是当前微服务拓扑的权威运维入口。`k8s/monolith` 是历史目录名，但其中清单已经是完整平台部署，不再代表单体架构。

## 1. 当前拓扑

```text
Browser → Nginx/Web → API Gateway
                       ├─ course-service → course_service DB
                       ├─ homework-grade-service → homework_grade_service DB
                       ├─ lab-practice-service → lab_practice_service DB → Redis
                       └─ legacy api → teaching_platform DB

lab-practice-service → Redis judge-submissions → Judge Worker → lab_practice_service DB
```

PostgreSQL 是一个实例、四个数据库。三个业务服务只拿到自己的 `DATABASE_URL`；Judge Worker 与 Lab 共用 Lab 数据库。兼容 API 只用于尚未迁移路由。

## 2. Docker Compose

准备配置：

```powershell
Copy-Item .env.example .env
docker compose config --quiet
docker compose up -d --build
docker compose ps -a
```

验收条件：

- `db`、`redis`、`api`、三个业务服务、`api-gateway` 和 `nginx` 为 `healthy`；
- `db-init` 与四个 `*-migrate` 容器退出码为 0；
- `judge-worker` 为 Running；
- `http://localhost:8080/health/live` 和 `/health/ready` 返回 200；
- `http://localhost:8080/api/courses` 由 Gateway 转发到 Course Service。

常用命令：

```powershell
docker compose logs --tail 200 api-gateway course-service homework-grade-service lab-practice-service judge-worker
docker compose restart api-gateway
docker compose down
```

不要在有价值数据的环境运行 `docker compose down -v`。`seed` 位于 `tools` profile，只能用于允许重置数据的演示环境。

## 3. Kubernetes

静态校验：

```powershell
kubectl kustomize k8s/monolith | Out-Null
kubectl kustomize k8s/local | Out-Null
```

Docker Desktop 本地部署：

```powershell
./scripts/install-metrics-server.ps1
./scripts/deploy-k8s-local.ps1
```

本地脚本每次生成唯一的 `local-<时间戳>` 镜像标签并渲染清单，确保重复部署不会因 `IfNotPresent` 复用旧 `:dev` 镜像。

生产或 CI Runner 部署：

```powershell
./scripts/deploy-k8s.ps1 `
  -ImagePrefix "ghcr.io/<owner>/teaching-platform" `
  -GitSha "<40位提交SHA>" `
  -EvidenceDirectory "test-results/deployment"
```

部署顺序固定为：Namespace/Secret → PostgreSQL/Redis → 数据库初始化 → 四组迁移 → 应用清单 → rollout → 集群内健康检查。任一 Job 或探针失败都会阻断后续步骤。

四组数据库都使用提交到仓库的 Prisma migration，并在容器中执行 `prisma migrate deploy`；部署流程不使用 `prisma db push`。如果 Lab 数据库曾由旧版 `db push` 建表，首次切换前应先核对实际结构与 `20260903000000_init` 一致，再由管理员执行 `prisma migrate resolve --applied 20260903000000_init` 建立基线。新数据库不需要这一步。

主要资源：

| 类型 | 资源 |
| --- | --- |
| Deployment | `api-gateway`、`course-service`、`homework-grade-service`、`lab-practice-service`、`judge-worker`、`api`、`web`、`redis` |
| StatefulSet | `postgres` |
| Service | 三业务服务、Gateway、兼容 API、Web、PostgreSQL、Redis |
| HPA | 无状态 API Gateway，CPU 60%，1–5 副本 |
| PVC | PostgreSQL 数据、共享上传目录 |

入口默认为 NodePort `http://localhost:30080`。无法直接访问时：

```powershell
kubectl -n teaching-platform port-forward service/web 30080:80
```

## 4. 配置和 Secret

生产环境必须提供：

```text
KUBE_CONFIG_B64
POSTGRES_PASSWORD
DATABASE_URL
JWT_SECRET
INTERNAL_SERVICE_TOKEN
CORS_ORIGIN
GHCR_USERNAME
GHCR_PAT
```

`DATABASE_URL` 指向 `postgres:5432/teaching_platform`。部署脚本从它派生 Course、Homework 和 Lab 的独立连接串，并作为 `COURSE_DATABASE_URL`、`HOMEWORK_DATABASE_URL`、`LAB_DATABASE_URL` 写入 Secret。真实 Secret 不得提交仓库。

非敏感服务地址来自 `platform-config`，使用 Kubernetes Service DNS，不写 Pod IP 或 `127.0.0.1`。

## 5. CI/CD

`.github/workflows/ci-cd.yml` 的依赖链为：

```text
quality → images(matrix) → deploy
```

`quality` 校验 Compose/Kustomize、安装全部组件、创建并迁移四个数据库、生成 Prisma Client、构建和运行全部独立服务，并通过 Gateway 做微服务冒烟测试；之后继续运行旧 API 的 Unit、DAO、API 与 E2E 测试。`images` 只有在质量门通过后才构建并推送 11 个运行/迁移镜像，使用 `sha-<40位提交SHA>` 不可变标签。`deploy` 只有在全部镜像成功后才执行。

流水线中的当前官方 Action 使用 Node.js 24 运行时；部署用 Windows 自托管 Runner 应保持在 `v2.327.1` 或更高版本，并预装 `kubectl`、Docker 与 PowerShell。

Course、Homework 和 Lab 当前使用 `ReadWriteOnce` 上传卷，因此不配置 HPA；需要先迁移到对象存储或集群提供的 `ReadWriteMany` 存储，再考虑跨节点扩容。

Pull Request 不推送镜像、不部署；主分支推送会发布并部署；手动运行可用 `simulate_failure=true` 验证失败阻断。远程运行结果和 GHCR 页面必须由仓库管理员在 GitHub 上留存，不能用本地测试代替。

## 6. 回滚与排障

```powershell
kubectl -n teaching-platform get pods,services,jobs,hpa -o wide
kubectl -n teaching-platform get events --sort-by=.lastTimestamp
kubectl -n teaching-platform logs deployment/api-gateway --tail=200
kubectl -n teaching-platform rollout history deployment/api-gateway
kubectl -n teaching-platform rollout undo deployment/api-gateway
```

数据库迁移是发布前置条件。应用回滚不会自动回滚数据库；破坏性 Schema 变更必须使用“先兼容、再发布、后清理”的迁移方式。

## 7. 验收证据

本地 Kubernetes 部署证据写到 `test-results/deployment-local/`，HPA 实验写到 `test-results/hpa/`。生产流水线通过 Actions Artifact 保存 `test-results/deployment/`。

当前实测记录见 [`验收记录-2026-09-03.md`](验收记录-2026-09-03.md)。
