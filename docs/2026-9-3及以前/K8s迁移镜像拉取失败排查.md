# K8s 迁移镜像拉取失败排查

## 本次确认的情况

2026-08-31 的 `Deploy to Kubernetes` 在等待 `db-migrate` 完成时超时。只读查询 `docker-desktop` 集群后，原 Pod `db-migrate-gs2gx` 的事件与后续 Pod 均显示：

```text
ImagePullBackOff / ErrImagePull
image: ghcr.io/softwareplatform/teaching-platform-migrate:sha-22790d871c0bdc327db5031ad3c5446a35ac91e6
HEAD http://registry-mirror:1273/v2/softwareplatform/teaching-platform-migrate/manifests/sha-22790d871c0bdc327db5031ad3c5446a35ac91e6?ns=ghcr.io
403 Forbidden
```

PostgreSQL 和 Redis 已就绪，但迁移镜像没有拉下来，容器未启动，Prisma migration 还没执行。不是 PowerShell 语法错误，也不能靠把 300 秒改为更长等待解决访问拒绝。

Pod 已引用 `ghcr-pull`，该 Secret 存在且类型为 `kubernetes.io/dockerconfigjson`。本次没有读取其凭据内容，不能仅凭 Secret 存在就认定令牌有效。403 出现在镜像代理路径上，还需区分上游 GHCR 权限问题与 Docker Desktop 代理/网络配置问题。

## 已修改的仓库文件

- [Kustomize 入口](../k8s/monolith/kustomization.yaml)：删除匹配不存在的 `Deployment/not-important`、`Job/not-important` 的补丁。该补丁会使 `kubectl kustomize` 直接失败，且不会作用于单独创建的迁移 Job。API、Web、Worker 和迁移 Job 原本已经各自声明 `ghcr-pull`，这些引用予以保留。
- [工作流](../.github/workflows/ci-cd.yml)：输出完整迁移镜像名称；等待失败时输出 Pod 状态、等待原因和对应 UID 的事件，再尝试读取日志。以后可直接在 Actions 中看到 403、标签不存在、证书或连接超时等具体错误。

这些修改不会自动修复外部仓库权限，也不会改变集群代理设置。现有部署顺序、失败阻断与 PowerShell 5.1 保持不变。

## 按顺序处理镜像访问

1. 打开**实际触发本次运行的 GitHub 仓库**，确认同一次运行的 `Build migrate image` 已成功，构建日志确实发布了上述 `softwareplatform/teaching-platform-migrate` 及完整 SHA 标签。不要拿本地另一提交或另一仓库的镜像代替；后续新提交使用自己的 SHA。
2. 在镜像包的访问设置中，确认 `GHCR_USERNAME` 对应账号拥有读取权限。账号可以不同于镜像命名空间 `softwareplatform`，但必须有授权。
3. 在实际运行仓库的 `Settings → Environments → production` 中更新 `GHCR_USERNAME` 和 `GHCR_PAT`：用户名与 PAT 所属账号一致；使用有效的 **Personal access token (classic)**，至少具备 `read:packages`；组织要求 SSO 时完成相应授权。不要把 PAT 写入 YAML、Issue、聊天或日志。参见 [GitHub GHCR 认证说明](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-with-a-personal-access-token-classic)。
4. 确认 Docker Desktop 的代理或注册表访问策略允许访问 GHCR。事件中的 `registry-mirror:1273` 是当前拉取链路经过的本地代理，不能仅看到该名字就直接删除配置。Docker Desktop 的 kind 模式本身会使用 registry mirror 组件，参见 [Docker Desktop Kubernetes 文档](https://docs.docker.com/desktop/use-desktop/kubernetes/)。不要关闭 TLS 校验或清空集群来规避 403。
5. 将本次代码修正发布到实际运行的仓库，再运行对应新版本工作流。工作流的 `Create namespace and runtime secrets` 会用最新生产 Secrets 更新 `ghcr-pull`。如果只更新了 Secrets 并重跑旧版本，凭据可更新，但不会包含本次代码修正。

如果没有权限修改组织镜像包或代理策略，请把上述镜像地址和 403 事件交给对应管理员处理，不要绕过访问限制。也不要为了拉取方便将私有包直接改为公开。

## 只读复核命令

在能够访问目标集群的 Runner 机器或已配置相同集群的终端执行：

```powershell
kubectl config current-context
kubectl --request-timeout=10s -n teaching-platform get pods -l job-name=db-migrate -o wide
kubectl --request-timeout=10s -n teaching-platform get secret ghcr-pull -o 'custom-columns=NAME:.metadata.name,TYPE:.type'
```

查询当前迁移 Pod 的镜像、等待原因及事件（不会输出 Secret 内容）：

```powershell
$migrationPodsJson = kubectl --request-timeout=10s -n teaching-platform get pods -l job-name=db-migrate -o json
if ($LASTEXITCODE -ne 0) { throw '无法读取迁移 Pod' }
$migrationPods = ($migrationPodsJson -join "`n") | ConvertFrom-Json
foreach ($pod in $migrationPods.items) {
    $pod.metadata.name
    $pod.spec.containers.image
    $pod.status.containerStatuses.state.waiting
    kubectl --request-timeout=10s -n teaching-platform get events --field-selector "involvedObject.uid=$($pod.metadata.uid)" --sort-by=.lastTimestamp
}
```

| 事件中的具体错误 | 对应检查 |
| --- | --- |
| 401、403、unauthorized、denied | 令牌类型、有效期、镜像包读取权限、SSO，以及代理的访问策略；仅凭状态码不能区分所有情况 |
| manifest unknown、not found | 镜像命名空间、组件名、完整 SHA 标签是否确实发布 |
| x509、certificate | Docker Desktop/节点对代理或镜像仓库证书的信任链 |
| timeout、DNS、connection refused | Docker Desktop/节点到注册表的网络、DNS 与代理连接 |
| FailedToRetrieveImagePullSecret | 同一命名空间中 Secret 是否存在，名称与 Pod 引用是否一致 |

私有镜像需要 Pod 引用同命名空间的有效拉取凭据，参见 [Kubernetes 私有镜像拉取说明](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/)。在 Windows 上执行 `docker login` 成功，仅能证明该 Docker 客户端的认证路径可用，并不能代替 Kubernetes 的 `imagePullSecrets`。

最终成功标准：镜像不再报 `ImagePullBackOff`，`db-migrate` 为 `Complete`，然后 API、Worker、Web rollout 和健康检查通过。迁移失败时不要绕过 Job 继续发布应用。
