# CI/CD 实现说明

## 一、触发方式

工作流文件：`.github/workflows/ci-cd.yml`。

- push 到 `main` 或 `master`：执行质量检查、镜像推送和生产部署。
- pull request 到 `main` 或 `master`：执行质量检查和镜像构建，但不推送、不部署。
- `v*` 标签：执行质量检查并推送带标签版本的镜像，不自动生产部署。
- 手工 `workflow_dispatch`：始终执行质量检查与镜像阶段；只有 `deploy=true` 才部署。

同一 ref 的新运行会取消旧运行，避免旧提交晚于新提交部署。

## 二、质量检查阶段

`quality` Job 使用 PostgreSQL 16 和 Redis 7 服务，顺序执行：

1. 检出代码并安装 Node.js 24。
2. 对根目录、后端、前端和 Judge Worker 执行锁文件安装。
3. 对 CI 专用数据库执行 Prisma migration 和 seed，并生成 Worker Prisma Client。
4. 编译 API、Web 和 Judge Worker。
5. 执行后端单元测试。
6. 启动三个应用并等待 API readiness 与 Web 可访问。
7. 执行只读集成测试。
8. 执行 UC01—UC04 课程域写流程自动化测试。
9. 无论测试成功或失败，上传 `test-results/` 日志和 JSON 证据。

Shell 命令返回非零时当前步骤失败，后续普通步骤不会执行；`images` Job 又声明 `needs: quality`，所以测试失败不会构建或推送发布镜像。

## 三、镜像阶段

`images` Job 在质量检查成功后并行构建四个镜像：

| 组件 | Dockerfile/阶段 | 用途 |
| --- | --- | --- |
| `api` | `backend/Dockerfile` / `runtime` | Fastify API |
| `migrate` | `backend/Dockerfile` / `migrate` | 仅执行 `prisma migrate deploy` |
| `web` | `nginx/Dockerfile` | Vite 静态资源与 Nginx |
| `judge-worker` | `judge-worker/Dockerfile` / `runtime` | 异步实验评测 |

pull request 只构建；其他触发会登录 GHCR 并推送。生产部署只引用 `sha-<40位提交哈希>`，不引用 `latest` 或分支浮动标签。

## 四、部署阶段

`deploy` Job 只在主分支 push 或手工 `deploy=true` 时执行，并依赖全部镜像成功。

部署顺序：

1. 校验所有必要生产 Secrets；缺失任意一项立即失败，不静默跳过。
2. 载入 kubeconfig，创建命名空间、应用运行 Secret 与 GHCR 拉取 Secret。
3. 部署 PostgreSQL 和 Redis，并等待 Ready。
4. 将迁移 Job 镜像替换为当前提交的 `migrate:sha-<GITHUB_SHA>`。
5. 删除上次已结束的同名 Job，创建本次 Job，等待 `Complete` 并输出迁移日志。
6. Kustomize 渲染应用清单，将 API、Web、Worker 镜像替换为同一提交 SHA 后应用。
7. 等待 API、Worker、Web rollout 完成，在 API Pod 内请求 `/health/live` 与 `/health/ready`，最后输出 Pod 与 Service 状态。

迁移失败时 Job 等待命令返回非零，应用清单不会发布。

## 五、生产环境配置

GitHub `production` Environment 必须配置：

| Secret | 用途 |
| --- | --- |
| `KUBE_CONFIG_B64` | 可访问目标集群的 kubeconfig Base64 文本 |
| `POSTGRES_PASSWORD` | 集群内 PostgreSQL 密码 |
| `DATABASE_URL` | API、Worker、迁移 Job 使用的数据库连接串 |
| `JWT_SECRET` | 生产 JWT 签名密钥 |
| `CORS_ORIGIN` | 生产 Web 的允许来源 |
| `GHCR_USERNAME` | 集群拉取 GHCR 私有镜像的账号 |
| `GHCR_PAT` | 至少具备 `read:packages` 的拉取令牌 |

工作流自带的 `GITHUB_TOKEN` 仅用于本次 Actions 运行推送 GHCR；集群侧拉取凭据单独放在 `ghcr-pull` Secret 中。
