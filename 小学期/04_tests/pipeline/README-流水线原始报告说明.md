# 流水线原始报告说明

## 归档结论

本目录已归档当前工作区能够核验的流水线配置、失败阻断结果、API/E2E 机器可读报告、Kubernetes 回归说明和最终测试报告副本。归档基线为提交 `cffa82693f757021b9fd3b074cb231328e686f38`（2026-09-03 21:24:17 +08:00）。

仓库中没有可验证的 GitHub Actions 运行 URL、run ID 或下载后的完整远程 Artifact，因此这些本地/集群证据没有冒充远程 Actions 成功记录。仓库管理员在最终推送后应将对应 Actions Artifact 原样放入新的 `github-actions-<run-id>/` 子目录，并在下表补充 URL、run ID、SHA 与完成时间。

## 文件清单与来源

| 文件 | 类型/来源 | 结论 |
| --- | --- | --- |
| `运行结果/ci-failure-blocking.json` | 本地失败注入原始 JSON | 注入退出码 17，下游未执行，阻断有效 |
| `运行结果/api-use-cases.json` | 本地 API 自动化原始 JSON | 15/15 通过，UC01～UC10 主流程 10、异常流程 5 |
| `运行结果/e2e-local.json` | 本地 E2E 原始 JSON | UC01～UC10 10/10 通过 |
| `运行结果/e2e-k8s.json`、`e2e-kubernetes-restored.json` | Kubernetes E2E 原始 JSON | 保存集群环境用例步骤与清理结果 |
| `运行结果/ci-integration.json` | 集成冒烟原始 JSON | 12/12 通过 |
| `运行结果/00-D6-测试完成记录.md` | 流水线测试阶段汇总 | 记录 Unit/DAO/API/E2E 与构建结果 |
| `运行结果/02-D4-CI-CD测试阶段验证记录.md` | CI 门禁说明 | 说明 `quality → images → deploy` 依赖链 |
| `运行结果/03-D5-K8s-E2E回归报告.md` | K8s 回归说明 | 记录集群环境与 10 条 E2E 结论 |
| `运行结果/K8s-Web页面.png` | 页面证据 | K8s Web 页面截图 |
| `最终测试报告.md`、`最终测试报告.pdf` | `02_docs/04_测试文档` 的副本 | 面向提交/答辩的最终汇总报告 |

当前流水线定义为仓库根目录 `.github/workflows/ci-cd.yml`，使用 Node.js 24、PostgreSQL 16、Redis 7，依次执行基础设施校验、依赖安装、四库 migration/seed、构建、Unit/服务测试、应用启动、集成/DAO/API/E2E 测试、Artifact 上传；只有 `quality` 成功后才构建镜像，全部镜像成功后才部署。

## 远程运行待登记项

| 字段 | 值 |
| --- | --- |
| 工作流 | `.github/workflows/ci-cd.yml` |
| GitHub Actions URL | 工作区未提供；最终推送后由仓库管理员填写 |
| Run ID | 工作区未提供 |
| Commit SHA | 最终运行时填写；本次归档基线见上文 |
| 完成时间 | 最终运行时填写 |
| Artifact 名称 | `test-results-<github.run_id>`，保留 90 天 |
