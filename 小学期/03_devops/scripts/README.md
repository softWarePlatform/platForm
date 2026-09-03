# 部署、健康检查与回滚脚本

## 文件

| 脚本 | 用途 |
| --- | --- |
| `deploy-k8s.ps1` | 使用 `sha-<40位Git SHA>` 镜像执行基础设施、四库 migration、应用部署和最终健康检查 |
| `health-check.ps1` | 等待七个 Deployment rollout，检查 Gateway/三业务服务/兼容 API/Web，并采集资源与 HPA 指标 |
| `rollback-k8s.ps1` | 将七个应用 Deployment 切换到指定历史 SHA 镜像，验证 rollout 和健康状态；不回退数据库 |

## 部署

先配置 `POSTGRES_PASSWORD`、`DATABASE_URL`、`JWT_SECRET`、`INTERNAL_SERVICE_TOKEN`、`CORS_ORIGIN`、`GHCR_USERNAME` 和 `GHCR_PAT`，再执行：

```powershell
./deploy-k8s.ps1 `
  -ImagePrefix "ghcr.io/<owner>/teaching-platform" `
  -GitSha "<当前40位提交SHA>" `
  -EvidenceDirectory "test-results/deployment"
```

## 回滚

确认目标 SHA 对应的七个运行镜像均已发布到 GHCR。先预演，再正式执行：

```powershell
./rollback-k8s.ps1 `
  -ImagePrefix "ghcr.io/<owner>/teaching-platform" `
  -GitSha "<目标40位提交SHA>" `
  -EvidenceDirectory "test-results/rollback" `
  -WhatIf

./rollback-k8s.ps1 `
  -ImagePrefix "ghcr.io/<owner>/teaching-platform" `
  -GitSha "<目标40位提交SHA>" `
  -EvidenceDirectory "test-results/rollback" `
  -Confirm:$false
```

脚本输出包含变更前 Deployment JSON、目标镜像计划、逐服务 rollout 日志、健康检查和 `rollback-summary.json`。如 Schema 发生破坏性变更，应停止应用回滚并按经评审的数据库恢复方案处理；脚本不会自动执行数据库降级。
