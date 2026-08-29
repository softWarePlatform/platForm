# Kubernetes 本地部署手工验收步骤

本文涉及 Docker Desktop 图形界面和本机 Kubernetes 集群，应由操作者手动完成。执行前不要运行 `docker compose down -v`，不要删除现有 PostgreSQL 数据卷。

## 一、在 Docker Desktop 中启用 Kubernetes

1. 打开 Docker Desktop。
2. 点击右上角齿轮进入 **Settings**。
3. 打开 **Kubernetes** 页面。
4. 勾选 **Enable Kubernetes**。
5. 点击 **Apply & restart**。
6. 等待 Docker Desktop 左下角或 Kubernetes 页面显示 Kubernetes 正常运行。

如果页面要求选择集群提供方式，选择 Docker Desktop 自带的单节点本地 Kubernetes 即可。本步骤可能下载 Kubernetes 镜像，应保持网络可用。

## 二、确认 kubectl 上下文

打开 PowerShell，进入项目目录：

```powershell
Set-Location "E:\2026暑假\软工小学期\code\platForm"
kubectl config get-contexts
kubectl config use-context docker-desktop
kubectl cluster-info
kubectl get nodes
```

验收标准：至少一个节点，状态为 `Ready`。

## 三、构建本地 Kubernetes 镜像

```powershell
docker build --target runtime -t teaching-platform-api:dev .\backend
docker build --target migrate -t teaching-platform-migrate:dev .\backend
docker build -f .\nginx\Dockerfile -t teaching-platform-web:dev .
docker build -f .\judge-worker\Dockerfile --target runtime -t teaching-platform-judge-worker:dev .
docker image ls "teaching-platform*"
```

验收标准：能够看到 API、迁移、Web 和 Judge Worker 四个本地镜像。

## 四、创建命名空间和运行密钥

以下值只适用于本地演示。若自行修改密码，`POSTGRES_PASSWORD` 与 `DATABASE_URL` 中的密码必须一致。

```powershell
kubectl apply -f .\k8s\monolith\namespace.yaml

kubectl -n teaching-platform create secret generic platform-secrets `
  --from-literal=POSTGRES_USER=platform `
  --from-literal=POSTGRES_PASSWORD=platform `
  --from-literal=POSTGRES_DB=teaching_platform `
  --from-literal=DATABASE_URL="postgresql://platform:platform@postgres:5432/teaching_platform?schema=public" `
  --from-literal=JWT_SECRET="local-k8s-only-change-before-production" `
  --from-literal=CORS_ORIGIN="http://localhost:30080" `
  --dry-run=client -o yaml | kubectl apply -f -
```

本地清单也声明了 `ghcr-pull`。为避免本地镜像验收出现缺失 Secret 警告，可创建一个同名占位拉取密钥；镜像已在本机且 `imagePullPolicy=IfNotPresent` 时不会使用其中凭据：

```powershell
kubectl -n teaching-platform create secret docker-registry ghcr-pull `
  --docker-server=ghcr.io `
  --docker-username=local `
  --docker-password=local `
  --dry-run=client -o yaml | kubectl apply -f -
```

不要把生产密码、真实 JWT 密钥或 kubeconfig 写入仓库和验收截图。

## 五、先启动数据库和 Redis

```powershell
kubectl apply -f .\k8s\monolith\postgres.yaml
kubectl apply -f .\k8s\monolith\redis.yaml
kubectl -n teaching-platform rollout status statefulset/postgres --timeout=180s
kubectl -n teaching-platform rollout status deployment/redis --timeout=180s
kubectl -n teaching-platform get pods,services,pvc
```

验收标准：PostgreSQL 和 Redis 均为 `Running`、`Ready 1/1`，两个 PVC 为 `Bound`。

## 六、执行数据库迁移

Job 名称固定，重复验证前只删除已经结束的迁移 Job，不删除数据库或 PVC：

```powershell
kubectl -n teaching-platform delete job db-migrate --ignore-not-found
kubectl apply -f .\k8s\monolith\migrate-job.yaml
kubectl -n teaching-platform wait --for=condition=complete job/db-migrate --timeout=300s
kubectl -n teaching-platform logs job/db-migrate
```

验收标准：Job 为 `Complete`，日志显示 migration 成功或 `No pending migrations to apply`。

## 七、部署完整应用

```powershell
kubectl apply -k .\k8s\monolith
kubectl -n teaching-platform rollout status deployment/api --timeout=300s
kubectl -n teaching-platform rollout status deployment/judge-worker --timeout=300s
kubectl -n teaching-platform rollout status deployment/web --timeout=180s
kubectl -n teaching-platform get pods,services,ingress,pvc
```

验收标准：

- API、Web、Judge Worker、Redis 均为 `Running`。
- PostgreSQL StatefulSet 为 `Ready 1/1`。
- API、Web、PostgreSQL、Redis 探针无持续失败。
- Judge Worker 启动和存活探针通过。

如果 Pod 显示 `ImagePullBackOff`，先确认第三步的本地镜像名称完全一致。清单使用 `IfNotPresent`，Docker Desktop 本地集群应优先使用本地镜像。

## 八、检查接口

NodePort 默认入口：

```powershell
Invoke-RestMethod http://localhost:30080/health/live
Invoke-RestMethod http://localhost:30080/health/ready
Invoke-RestMethod http://localhost:30080/api/courses
```

预期：前两个接口 `ok=true`；课程接口返回 JSON。全新数据库只执行 migration 而没有 seed 时，课程数组为空属于正常情况；生产流水线不会自动 seed，以避免覆盖真实数据。

## 九、可选 Ingress 验收

Ingress 清单要求集群安装 NGINX Ingress Controller。Docker Desktop 默认不一定自带该控制器，因此 NodePort 验收不受 Ingress 状态影响。

安装好控制器后，以管理员身份打开：

`C:\Windows\System32\drivers\etc\hosts`

添加：

```text
127.0.0.1 teaching-platform.local
```

然后检查：

```powershell
kubectl -n teaching-platform get ingress teaching-platform
Invoke-RestMethod http://teaching-platform.local/health/live
```

## 十、故障检查

```powershell
kubectl -n teaching-platform describe pod -l app.kubernetes.io/name=api
kubectl -n teaching-platform logs deployment/api --tail=200
kubectl -n teaching-platform logs deployment/judge-worker --tail=200
kubectl -n teaching-platform logs statefulset/postgres --tail=200
kubectl -n teaching-platform get events --sort-by=.lastTimestamp
```

需要保存的验收证据：节点 Ready、Pod/Service/PVC 状态、迁移 Job Complete、API 健康接口结果、关键日志，以及失败时的事件记录。
