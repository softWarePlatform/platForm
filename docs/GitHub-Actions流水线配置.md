# GitHub Actions 自动化流水线配置

仓库中的 `.github/workflows/ci-cd.yml` 提供以下自动化能力：

1. Pull Request 与 `main` / `master` 推送：安装依赖、迁移并填充测试数据库、构建前端/API/Worker、执行单元测试和只读接口冒烟测试。
2. `main` / `master` 推送和 `v*` 标签：构建三个容器镜像并发布到 GitHub Container Registry（GHCR）。
3. `main` / `master` 推送：如果已经配置 Kubernetes 密钥，则部署当前提交；未配置时安全跳过部署，不影响构建和测试。
4. 手动运行：可选择 `deploy=true`，重新发布并部署指定分支的当前提交。

## 第一次使用时需要在 GitHub 完成的设置

### 1. 启用 Actions 写入包权限

进入仓库 **Settings → Actions → General → Workflow permissions**，选择 **Read and write permissions**，保存。流水线使用仓库自带的 `GITHUB_TOKEN` 向 GHCR 发布镜像，不需要额外为“发布镜像”创建令牌。

### 2. 配置 production Environment（仅部署时需要）

进入 **Settings → Environments → New environment**，创建 `production`。建议添加 Required reviewers，这样每次真实部署前需要组长确认。

在 `production` 的 Environment secrets 中添加：

| Secret | 是否必需 | 内容 |
| --- | --- | --- |
| `KUBE_CONFIG_B64` | 部署必需 | kubeconfig 文件整体做 Base64 后的单行文本 |
| `POSTGRES_PASSWORD` | 部署必需 | 集群内 PostgreSQL 的强密码 |
| `DATABASE_URL` | 部署必需 | 如 `postgresql://platform:URL编码后的密码@postgres:5432/teaching_platform?schema=public` |
| `JWT_SECRET` | 部署必需 | 至少 32 字节的随机字符串 |
| `CORS_ORIGIN` | 建议配置 | 前端真实来源，如 `https://course.example.com`；不配置时暂时允许所有来源 |
| `GHCR_USERNAME` | 私有镜像必需 | 有权读取该仓库 Packages 的 GitHub 用户名 |
| `GHCR_PAT` | 私有镜像必需 | 具有 `read:packages` 权限的 GitHub Personal Access Token |

Windows PowerShell 生成 kubeconfig Base64 单行文本：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\kubeconfig"))
```

生成 JWT 随机值的一种方式：

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

不要把上述真实值写入仓库、Issue、日志或任务卡。

### 3. 处理 GHCR 镜像可见性

三个镜像首次发布后会出现在 GitHub 个人/组织的 **Packages** 中：

- `teaching-platform-api`
- `teaching-platform-web`
- `teaching-platform-judge-worker`

二选一：

- 课程演示仓库允许公开镜像：在每个 Package 的设置中改为 Public，此时无需 `GHCR_USERNAME` / `GHCR_PAT`。
- 保持镜像 Private：配置上表中的两个 GHCR secret，流水线会在集群创建或更新 `ghcr-pull`。

## 触发与查看结果

- 提交 Pull Request：仅执行 Build and test，不发布镜像、不部署。
- 推送到 `main` / `master`：测试成功后发布镜像；部署密钥齐全时进入 `production` 部署。
- 发布 `v1.0.0` 这类标签：测试并发布带同名标签的镜像，不自动部署。
- 在 **Actions → CI/CD → Run workflow** 手动执行：勾选 deploy 可部署当前提交。

每次测试结束会上传名为 `test-results-运行编号` 的 Artifact，包含 API、前端、Worker 日志和 `ci-integration.json`，可作为任务完成证据。

## Kubernetes 访问入口

默认清单位于 `k8s/monolith`，命名空间为 `teaching-platform`。Web Service 使用 NodePort `30080`。如果云集群使用 Ingress 或 LoadBalancer，应按实际域名和证书另行配置入口，并把 `CORS_ORIGIN` 设置为真实前端域名。

常用检查命令：

```bash
kubectl -n teaching-platform get pods,services
kubectl -n teaching-platform rollout status deployment/api
kubectl -n teaching-platform logs deployment/api --tail=200
```
