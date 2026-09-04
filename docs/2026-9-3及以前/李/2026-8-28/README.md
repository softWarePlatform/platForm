# 2026-08-28 CI/CD 交付材料

## 交付结论

28 号代码侧流水线已经补齐为以下强依赖顺序：

```text
取代码 → 安装依赖 → 数据库迁移/Seed（CI 测试库） → 编译
→ 单元测试 → 集成测试 → UC01—UC04 API 测试
→ 构建并推送版本化镜像 → 生产数据库迁移 Job
→ 部署 Kubernetes → rollout 健康检查
```

后续阶段均通过 GitHub Actions 的 `needs` 和步骤退出码依赖前序结果；测试、镜像构建、迁移或 rollout 任一失败，流水线返回失败且不会把失败步骤后的部署标为成功。

本目录只记录已经验证的事实。当前改动尚未推送，因此“GitHub Actions 全绿运行、GHCR 推送记录、Kubernetes 实机部署和成功/失败截图”仍需在配置好生产环境 Secrets 后通过一次真实 push 取得，不能用本地静态检查冒充。

## 文档目录

| 文件 | 内容 |
| --- | --- |
| [01-CI-CD实现说明.md](./01-CI-CD实现说明.md) | 流水线阶段、触发条件、部署顺序和配置要求 |
| [02-镜像版本号规范.md](./02-镜像版本号规范.md) | GHCR 镜像名称、不可变 SHA 标签及部署对应关系 |
| [03-验收记录.md](./03-验收记录.md) | 已完成验证、环境限制和最终实机验收命令 |

## 相关实现

| 文件 | 用途 |
| --- | --- |
| `/.github/workflows/ci-cd.yml` | GitHub Actions 编译、测试、镜像、迁移、部署和验收 |
| `/backend/Dockerfile` | `runtime` 与专用 `migrate` 镜像阶段 |
| `/k8s/monolith/migrate-job.yaml` | 部署前 Prisma migration Job |
| `/k8s/monolith/*.yaml` | PostgreSQL、Redis、API、Worker、Web、Ingress 与探针 |

