# B：Lab Service 集成与接口冻结记录

## 1. 本轮结论

Lab Service 第一阶段已完成独立进程、端口、健康检查、Dockerfile、Kubernetes
Deployment/Service 和 CI 镜像入口。服务端口冻结为 `3003`，浏览器统一通过 API Gateway
访问，不再由 Vite 直接绕过 Gateway。

当前仍属于迁移第一阶段：UC06—UC08 业务路由和 Prisma Client 暂时复用 `backend/src` 与
`backend/prisma`。这保证现有业务规则不回退，但不等同于最终数据独立。独立 Schema、迁移
顺序及跨库外键处理须由 A/B/C 书面冻结后实施。

## 2. 与 C 冻结的内部接口

公共约定：

- Lab Service：`http://lab-practice-service:3003`；
- 鉴权头：`x-internal-service-token`；
- 环境变量：`INTERNAL_SERVICE_TOKEN`；
- 请求追踪：`x-request-id`；
- 错误体：`{ code, message, requestId }`；
- 实验成绩不可用时返回 `UNAVAILABLE/null`，禁止按 0 分计算。

正式接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/internal/courses/:courseId/lab-gradebook` | C 一次获取全班实验成绩 |
| POST | `/internal/courses/:courseId/lab-grades:batch` | 按 `userIds[]` 批量获取成绩 |
| PUT | `/internal/wrong-book/entries` | Homework 幂等写入单条错题 |
| DELETE | `/internal/wrong-book/entries/HOMEWORK/:homeworkId` | 删除作业来源错题 |

写错题必须提供 `Idempotency-Key`。旧的斜杠批量路径和 Homework 批量写路径暂时保留，供
迁移期兼容，调用方不得新增依赖。

## 3. 部署和流水线

已增加：

- `lab-practice-service/package-lock.json`；
- Lab Service Kubernetes Service、Deployment；
- startup/readiness/liveness probes；
- CPU/内存 requests 与 limits；
- CI 依赖缓存、`npm ci`、Lab 单测；
- `lab-practice-service` GHCR 镜像矩阵；
- 部署脚本镜像占位符替换；
- Kubernetes rollout 健康检查。

`production` Environment 需新增 `INTERNAL_SERVICE_TOKEN`，Course、Homework、Lab 使用同一
值。真实值不得写入仓库或报告。

## 4. 验证结果

| 验证 | 结果 |
| --- | --- |
| 全仓 TypeScript/Vite 构建 | 通过 |
| Backend Unit | 151/151 通过 |
| Judge Worker Unit | 通过 |
| Lab Service Unit/Contract | 11/11 通过 |
| `kubectl kustomize k8s/monolith` | 通过 |
| `kubectl kustomize k8s/local` | 通过 |
| `docker compose config` | 通过 |
| Lab Docker build | 环境阻塞：Docker Hub TLS 证书不受信任 |

Docker 失败发生在拉取 `node:24-alpine` 元数据阶段，尚未执行项目 Dockerfile 构建步骤。

## 5. 下午需冻结的事项

1. Lab 独立数据库使用独立 database、独立 PostgreSQL schema，还是同库独立 Prisma Schema；
2. `User`、`Course` 不在 Lab 建外键，仅保存标识并通过 Course API 校验是否接受；
3. 历史 Lab/Practice/Discussion 数据迁移和回滚顺序；
4. B 提供基础 K8s 资源，D 负责最终镜像、Secret 和部署编排；
5. C 按本文件正式路径联调，E 验证超时、401、503、空成绩及幂等重试。

## 6. 既有故障实验

Judge Worker 停止时提交保持 `PENDING`，API/Web/数据库/Redis 继续可用；Worker 恢复后积压
任务继续消费并得到 `ACCEPTED`。完整证据见 2026-09-01 的 B-08 故障实验报告。
