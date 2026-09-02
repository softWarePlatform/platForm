# Homework / Gateway 终验勾选（W3-1）

- 日期：2026-09-02
- 范围：只勾 C 负责的 Homework + Gateway；A/B/D/E 的项标责任人，不代勾

对照后五天任务清单与规划 Wave 3。不能勾的必须写原因。

## 业务

| 项 | 勾选 | 说明 |
| --- | --- | --- |
| 作业主路径：创建 / 发布 / 提交 / 批改 / 发布成绩 | **能勾** | 直打 `:3002` 与经网关 `:3081`、经 Vite `:5173/api` 均已冒烟 |
| 学生看见已发布分数 | **能勾（API）** | 冒烟含提交、88/网关批改、release；前端点选因自动化不能填登录口令未做 UI 点击 |
| 综合成绩真实验分 | **不能勾** | B `:3003` 未起；只能勾降级口径 |
| 综合成绩降级口径 | **能勾** | `labStatus=UNAVAILABLE`，`totalScore=null`，`provisionalTotal` 非 0 冒充 |
| 错题真写入 Lab | **不能勾** | 客户端已接 PUT/DELETE；真服务等 B |

## 调用

| 项 | 勾选 | 说明 |
| --- | --- | --- |
| Course access / 名单 / 通知 | **能勾** | 内部 access fail-closed；名单兼容 `items`；通知带幂等键（A 的 notify 实现若 500 不回滚发布） |
| Lab 成绩 GET `lab-gradebook`（404 回退 batch） | **半勾** | 代码与单测齐；真 200 等 B |
| 无跨库 | **能勾** | 作业 Schema 无 User/Course/Lab；源码无对应 Prisma |

## 测试

| 项 | 勾选 | 证据 |
| --- | --- | --- |
| 作业单测 | **能勾** | `homework-grade-service` `npm test` 25 通过（含 access fail-closed、Lab 降级、加权） |
| 作业 API 冒烟 | **能勾** | `npm run test:api`（`:3002`） |
| 网关路由 / 502 | **能勾** | `api-gateway` `npm test` 4 通过；`npm run test:api` Lab 502 |
| 经网关 UC05 | **能勾** | `:3081` 与 Vite `/api` 各跑通 |

## 容器与网关能力

| 项 | 勾选 | 说明 |
| --- | --- | --- |
| Dockerfile 本地 `docker build` | **能勾** | `teaching-platform-homework-grade-service:dev`、`teaching-platform-api-gateway:dev` |
| `/health/live` `/health/ready` + Probe | **能勾** | 代码有；YAML 含 startup/readiness/liveness |
| 基础 Deployment/Service YAML | **能勾（交 D）** | `k8s/homework-grade-service/`、`k8s/api-gateway/`；集群未部署，Pod 起不来找 D |
| 生产 sha 标签推进 Registry | **不能勾** | 规范是 D 的；本地标签 `:dev` 与 A 的 course 一致，不是 `latest` |
| Gateway 路由、`/api` 兼容、Request-ID、限流、502 | **能勾** | 见网关代码与冒烟 |
| HPA / Ingress / 全量 CI | **不适用** | 明确不做，归 D |

## 诚实结论（答辩可用）

作业主路径和网关可验收。综合成绩在 Lab 不可用时按设计降级。真实验分、错题联调、完整先起再掐断，等 B。镜像构建失败找 C；Pod 起不来找 D。
