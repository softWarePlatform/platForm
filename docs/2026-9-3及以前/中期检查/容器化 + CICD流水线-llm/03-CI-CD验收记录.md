# 2026-08-28 CI/CD 验收记录

## 一、已完成检查

| 编号 | 检查项 | 结果 |
| --- | --- | --- |
| CI-01 | `docker compose config --quiet` | 通过 |
| CI-02 | `kubectl kustomize k8s/monolith` | 通过 |
| CI-03 | 后端 TypeScript 构建 | 通过 |
| CI-04 | 前端 TypeScript + Vite 生产构建 | 通过；仅有既有的单包大于 500 kB 警告 |
| CI-05 | Judge Worker TypeScript 构建 | 通过 |
| CI-06 | 后端单元测试 | 通过，`lab-set-status.test.ts: ok` |
| CI-07 | Judge Worker 单元测试 | 通过，`runner.test.ts: ok` |
| CI-08 | 流水线阶段依赖审计 | 通过；`quality → images → deploy` |
| CI-09 | 测试失败阻断镜像/部署 | 通过；`images` 依赖 `quality`，`deploy` 依赖 `images` |
| CI-10 | 迁移镜像版本化并接入部署 | 通过；`migrate:sha-${GITHUB_SHA}` 在应用发布前执行 |
| CI-11 | 缺少生产配置时失败 | 通过；必要 Secret 缺失时退出码 1，不再静默跳过 |
| CI-12 | 部署后健康检查 | 已配置；rollout 后在 API Pod 内验证 live 与 ready，尚待真实集群执行 |
| CI-13 | API `runtime` Docker 镜像构建 | 通过，`teaching-platform-api:verify` |
| CI-14 | Prisma `migrate` Docker 镜像构建 | 通过，`teaching-platform-migrate:verify` |
| CI-15 | Web `runtime` Docker 镜像构建 | 通过，`teaching-platform-web:verify` |
| CI-16 | Judge Worker `runtime` Docker 镜像构建 | 通过，`teaching-platform-judge-worker:verify` |
| CI-17 | GitHub Actions YAML 解析 | 通过，识别 `quality`、`images`、`deploy` 三个 Job |

检查时间：2026-08-28（Asia/Shanghai）。

## 二、尚未形成的外部证据

当前工作区改动尚未 push，且本机没有 Kubernetes context。因此以下项目不能标为通过：

- GitHub Actions 本次版本的真实绿色运行；
- 一次故意失败且阻断镜像/部署的运行记录；
- GHCR 中四个同 SHA 镜像的推送记录；
- 目标 Kubernetes 集群中 migration Job Complete、Pod Ready 与接口健康；
- 成功/失败流水线截图。

四个验证镜像构建完成后 Docker Desktop Engine 被关闭，当前 `3000`、`8080` 和 `80` 均无服务监听。因此本轮没有重复启动 Compose；26 号已有的真实 Compose/浏览器验收记录仍保留在 `docs/李/2026-8-26`，本次仅确认新默认端口 `8080` 的 Compose 配置可解析。

这些项目需要仓库写权限、GitHub `production` Environment Secrets 和可访问的 Kubernetes 集群。本文不伪造截图或把旧版本运行当作当前版本证据。

## 三、真实流水线验收步骤

1. 在 GitHub `production` Environment 配置《01-CI-CD实现说明.md》列出的七项 Secret。
2. 将当前改动提交并 push 到主分支。
3. 在 Actions 页面确认 `Build and test` 全部测试通过。
4. 确认四个 `Build ... image` Matrix 子任务成功，GHCR 出现相同 `sha-<commit>` 标签。
5. 确认部署日志中 `db-migrate` 为 `Complete`，随后三个应用 rollout 成功。
6. 保存全绿截图及镜像标签截图。
7. 在独立测试分支故意制造一个会失败的测试并 push，确认 `images` 和 `deploy` 未执行；保存失败截图后撤销该测试改动。

最后一步只能在专门测试分支执行，不应把故意失败代码合入主分支。
