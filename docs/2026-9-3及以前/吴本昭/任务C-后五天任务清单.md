# 任务 C · 后五天任务清单

- 身份：Homework + Integration Owner（作业微服务 / 集成负责人）
- 第一责任：`homework-grade-service` + API Gateway + PPT/答辩统筹
- 对应用例：UC05、UC09
- 日期：2026-08-31（D6）— 2026-09-04（D10）
- 原则：对自己的服务「从代码到测试到容器」负责；不替 A/B 修他们服务的 Bug；不替 D 写整套 K8s/CI；不替 E 写全量 E2E。PPT 是统筹，不是一个人写完全部内容。

一句话目标：**保证 Homework、Gateway 和三服务调用关系跑通，并统筹答辩。**

---

## 一、最终必须交付（答辩前全部打勾）

### 1. Homework 微服务

独立：Build / Run / Test / Docker / 基础 K8s。

业务完整：

- [ ] 作业
- [ ] 作业附件
- [ ] 作业提交
- [ ] 提交版本
- [ ] 批改
- [ ] 重做
- [ ] 成绩发布
- [ ] GradingConfig
- [ ] 综合成绩

作业域表只由本服务直接访问。

### 2. 跨服务调用（接口别人提供，调用代码你写）

综合成绩必须走 API，禁止跨库查 Lab：

```text
Homework 成绩 + 调用 Lab API 拿实验成绩 → GradingConfig → 综合成绩
```

- [ ] 调用 B 的实验成绩查询 / 批量查询
- [ ] 调用 A 的：查询学生名单、查询课程权限、发送成绩通知
- [ ] 作业产生错题时调用 B 的错题内部 API（WrongBook 归 Lab）

### 3. API Gateway（不算第四个业务微服务）

```text
React → API Gateway → course / homework-grade / lab-practice
```

至少完成：

- [ ] 路由转发
- [ ] 外部 `/api` 尽量保持兼容
- [ ] Request-ID
- [ ] 基础限流
- [ ] 统一入口
- [ ] 服务错误转发

### 4. 本服务测试与容器

- [ ] Unit Test
- [ ] API Test
- [ ] Dockerfile
- [ ] 健康检查接口
- [ ] 基础 `deployment.yaml` / `service.yaml`（规范由 D 统，最终集成找 D）

### 5. 跨服务联调统筹

- [ ] 三服务调用关系跑通：Homework↔Course、Homework↔Lab
- [ ] 谁的服务有 Bug 谁修；你只统筹接口与联调节奏，不替所有人修联调 Bug

### 6. 故障处理实验（配合，第一责任是 B）

B 做故障降级逻辑；你负责 Gateway / 调用链：

- [ ] Gateway 能正确转发 Lab/Judge 不可用时的错误或部分结果
- [ ] 成绩汇总调用 Lab：超时、错误处理、部分结果降级；实验服务不可用时作业服务不崩溃

### 7. PPT 与答辩统筹（收集四人材料 + 你整合 + 主讲）

你负责：PPT 目录、内容逻辑、页面统一、答辩讲稿、主讲。

向其他人收：

| 来源 | 必须收到 |
| --- | --- |
| A | Course 服务架构图、数据归属、业务截图、一个代表用例 |
| B | Lab 架构、Judge Worker、故障实验、相关截图 |
| D | CI/CD、Kubernetes、HPA、Pod 变化 |
| E | 测试结果、性能图、单体/微服务对比 |

- [ ] 目录与统一模板发出
- [ ] 四人材料收齐
- [ ] PPT 整合、页面统一
- [ ] 答辩讲稿
- [ ] 主讲准备

---

## 二、按天拆解（可直接当日报）

### D6 · 8月31日 — 作业服务拆分 + Gateway 起步

当日完成标准：作业成绩服务独立启动并通过核心 API 测试；前端能经统一入口打到后端（路由可先通核心路径）。

- [ ] 抽出 `homework-grade-service` 代码、路由、Prisma Schema
- [ ] 独立构建、独立启动、健康检查
- [ ] 作业/提交/批改等核心 API 冒烟通过
- [ ] 搭 API Gateway：统一入口、按服务转发、外部 `/api` 尽量兼容
- [ ] 约定并落地 Request-ID（可先打通传递）

### D7 · 9月1日 — 独立库表 + 改跨库为 API

当日完成标准：作业服务不直接查询课程或实验 Schema。

- [ ] 作业域独立 Schema / 迁移
- [ ] 学生名单、课程权限改为调用 Course 内部 API
- [ ] 综合成绩改为调用 Lab 成绩 API（B 若接口未齐，先定契约并 mock，接口到了立刻切真调用）
- [ ] Gateway 补齐三服务路由；基础限流、错误转发可先最小可用
- [ ] 与 A/B 对齐内部 API 路径、鉴权、错误码

### D8 · 9月2日 — 降级 + Gateway 错误转发 + 测试

当日完成标准：实验服务不可用时返回设计好的提示或部分结果，作业服务不崩溃。

- [ ] 成绩汇总：超时、错误处理、部分结果降级
- [ ] Gateway：下游失败时把状态/错误转给前端，不把网关自身拖死
- [ ] 配合 B 的故障实验：调用链从 Gateway → Homework → Lab 可演示
- [ ] 本服务 Unit / API 测试补齐
- [ ] 作业产生错题走 Lab 错题 API（若 B 已提供）

### D9 · 9月3日 — 联调收口 + PPT 开工

HPA 是 D，全量压测是 E。你配合：作业/成绩接口可被压；不替 E 出性能报告。

- [ ] 三服务经 Gateway 的主路径联调通过（作业发布/提交/批改/成绩）
- [ ] Dockerfile、健康检查、基础 K8s YAML 交给 D 集成
- [ ] 发出 PPT 目录、页模板、各人截稿时间
- [ ] 开始收 A/B/D/E 材料

### D10 · 9月4日 — 终验 + PPT/讲稿

当日完成标准：作业成绩服务代码、测试、跨服务调用和故障降级证据完整；答辩材料可讲。

- [ ] 最终检查 Homework：业务、测试、Docker、调用 Lab/Course 无跨库
- [ ] 最终检查 Gateway：路由、兼容、Request-ID、限流、错误转发
- [ ] 故障降级证据齐（与 B/E 对一下各人截图/日志）
- [ ] PPT 整合、页面统一、讲稿、主讲顺序
- [ ] 本模块追溯编号交给 E

---

## 三、不要做 / 不要漏的边界

| 不做 | 必须做 |
| --- | --- |
| 替 A 写 Course、替 B 写 Lab/Judge | 写清调用，接口没有找 A/B 要 |
| 替所有人修联调 Bug | 统筹接口与联调；Homework/Gateway 的 Bug 自己修 |
| 整套 CI/CD、HPA、集群编排 | 本服务 + Gateway 的 Dockerfile 和基础 YAML |
| 替 E 写 UC01—UC10 全量 E2E | 本服务 Unit / API；E2E 失败由 E 定位后交你修作业/网关侧 |
| 一个人做完全部 PPT 内容 | 目录、逻辑、统一、收集、整合、主讲 |

出问题怎么找人：

- Homework 没正确调用 Course/Lab → 你
- Gateway 路由/限流/错误转发 → 你
- Lab 成绩接口没提供 → B
- Course 内部 API 没提供 → A
- Pod 起不来 → D
- UC05/UC09 E2E 失败 → E 定位后交你修
