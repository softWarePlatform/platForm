# D7 Story 与 Tasks（任务 C）

- 日期：2026-09-01（后五天第 2 天 / 官方 D7）
- 身份：Homework + Integration Owner
- 负责人：吴本昭
- 对应用例：UC05（作业主路径已在 D6 冒烟）、UC09（综合成绩改走 API，禁止跨库）
- 依据：`docs/吴本昭/任务C-后五天任务清单.md` §D7；`docs/范文歆/2026-8-29/02-D6-最终服务接口清单.md`；A `docs/胡思琪/2026-09-01/04-A-course-service-同步说明.md`；C `docs/吴本昭/2026-09-01/01-C-跨服务内部API对齐.md`

## 当日完成标准

作业服务不直接查询课程或实验 Schema；名单/权限/通知/实验成绩走 HTTP；Gateway 按三服务转发并带限流与 502。

## 当日不做（留给 D8+）

| 不做 | 原因 |
| --- | --- |
| 权限全面改为 `/internal/.../access`（撤掉公开 catalog） | A 内部契约 9 月 2 日冻结 |
| 错题 `PUT /internal/wrong-book/entries` | B 接口未齐；Homework 保持 501 |
| 配合 B 的 Gateway → Homework → Lab 故障演示 | Lab 进程未起；D8 |
| Dockerfile / 基础 K8s YAML | D9 |
| PPT 目录与模板 | D9 |

---

## Epic

**D7-E01 作业独立库 + 跨服务 API + Gateway 补齐**  
作业域只读写 `homework_grade_service`；课程与实验数据只通过 HTTP 获取；对外仍走 `/api`，由网关分到 course / homework / lab。

| 字段 | 内容 |
| --- | --- |
| 负责人 | 吴本昭（任务 C） |
| 对应 UC | UC05 维持；UC09 改调用链 |
| 计划完成 | 2026-09-01 |
| 证据 | 独立 Schema/迁移；`course-client` / `lab-client`；对齐文档；Gateway 冒烟（含 Request-ID、Lab 挂了 502）；`combineTotal` 等单测 |
| 依赖 | A 公开登录/课程 API 可用；A/B 内部接口未齐时客户端降级，不直连对方库 |

---

## Story 1 — 作业域独立 Schema 与库

**D7-S01**  
作为作业成绩服务负责人，我需要作业表只存在于本服务的 Prisma Schema 和独立数据库中，以便答辩时证明没有跨库查 Course/Lab 表。

**验收条件**

- `homework-grade-service/prisma/schema.prisma` 仅含作业域模型（Homework、提交、版本、附件、重做、GradingConfig 等），不含 User / Course / Enrollment / Lab / WrongBook。
- 独立库名 `homework_grade_service`；有可重复执行的迁移。
- 代码中无 `prisma.course` / `prisma.enrollment` / `prisma.lab*`。
- 单体 `backend` 作业路由仍可双跑；简报写明浏览器走网关。

### Tasks

| ID | Task | 完成定义 | 依据 | 状态 |
| --- | --- | --- | --- | --- |
| **D7-S01-T1** | 裁剪 Prisma Schema | 只保留作业域 model 与枚举 | 任务清单 D7「作业域独立 Schema / 迁移」 | 完成 |
| **D7-S01-T2** | 独立库与迁移 | 库 `homework_grade_service`；`prisma/migrations/20260901000000_init` 可 deploy | 不得与 `course_service` / `teaching_platform` 共库 | 完成 |
| **D7-S01-T3** | 去掉跨库 Prisma 调用 | 作业服务源码无课程/实验表查询 | A 同步说明：不得读写其 User/Course/选课表 | 完成 |

---

## Story 2 — 名单、权限、通知、实验成绩改 HTTP

**D7-S02**  
作为成绩聚合的实现者，我需要通过 Course / Lab 的 HTTP 接口拿到名单、课程信息和实验分，以便 Lab 挂掉时返回部分结果而不是把实验当 0 分。

**验收条件**

- 身份：Bearer 调 A 的 `GET /auth/me`（A 发 JWT）；Course 宕机时本地方 JWT 兜底。
- 课程与学生是否可选：公开 `GET /courses/:id`、`GET /enrollment/catalog`（A 内部 access 冻结前允许）。
- 教师名单：`GET /internal/courses/:id/enrollments` + `x-internal-service-token`；失败 `rosterStatus=UNAVAILABLE`。
- 成绩发布通知：`POST /internal/notifications`（头+body 幂等键）；失败不回滚发布。
- 实验成绩：`GET {LAB}/internal/courses/:id/lab-gradebook`，超时 3s；失败 `labStatus=UNAVAILABLE`，`totalScore=null`，带 `provisionalTotal`。
- 对 A Dashboard：提供 `homework-summary`、单人已发布成绩、批量 gradebook、`final-gradebook`。

### Tasks

| ID | Task | 完成定义 | 依据 | 状态 |
| --- | --- | --- | --- | --- |
| **D7-S02-T1** | Course 客户端 | `course-client.ts`：me / course / catalog / 名单 / 通知 | 任务清单「学生名单、课程权限改为调用 Course」 | 完成 |
| **D7-S02-T2** | 名单双字段兼容 | 解析 `items` 或 `students`，主键 `id` 或 `userId` | 对齐文档 §1.1；A 9/2 才冻结 | 完成 |
| **D7-S02-T3** | 通知幂等 | 同时发 `Idempotency-Key` 头和 JSON `idempotencyKey` | 范文歆清单；A 强制请求头 | 完成 |
| **D7-S02-T4** | Lab 成绩客户端 + 降级 | `lab-client.ts` + `combineTotal`；不可用不当 0 | 任务清单「综合成绩改为调用 Lab 成绩 API」 | 完成 |
| **D7-S02-T5** | C 对内成绩接口 | `homework-grade`、`homework-gradebook/batch`、`final-gradebook` | 范文歆清单 §4；给 A Dashboard | 完成 |
| **D7-S02-T6** | 降级单测 | `combine-total.test.ts`、`gradebook.test.ts` | D8 测试提前做完可复用部分 | 完成 |
| **D7-S02-T7** | 切 `/internal/.../access` | 写操作 fail-closed，撤公开 catalog | A 9/2 冻结后 | **完成** |

---

## Story 3 — Gateway 三服务路由、限流、502

**D7-S03**  
作为前端调用方，我需要网关把 `/api` 分到三个服务，下游挂了返回 502 且网关自己不挂，以便 D6 只通作业路径之后补齐最小可用网关。

**验收条件**

- `api-gateway` 独立进程，端口 **3081**（避开 nginx 8080、本机占用的 3080）。
- 作业路径优先于 `/api/courses/**`；course / lab 前缀按接口清单；其余 `/api` 回退单体 3000；`/internal` 不对浏览器开放。
- Request-ID 生成、透传、回写；基础限流；CORS 预检。
- Lab 未启动时 `GET /api/labs` → 502 `{ code: "BAD_GATEWAY", requestId }`。
- Vite `proxy /api` → `http://127.0.0.1:3081`，不 rewrite。

### Tasks

| ID | Task | 完成定义 | 依据 | 状态 |
| --- | --- | --- | --- | --- |
| **D7-S03-T1** | 三服务路由表 | `routing.ts` + 单测 4 条 | 任务清单「Gateway 补齐三服务路由」 | 完成 |
| **D7-S03-T2** | 限流 + 502 | `@fastify/rate-limit`；下游不可用 JSON 502 | 「基础限流、错误转发可先最小可用」 | 完成 |
| **D7-S03-T3** | 经网关冒烟 | 登录、作业列表 200/403、选课、课程、Lab 502、CORS、Request-ID | `api-gateway/tests/api-smoke.mjs` | 完成 |
| **D7-S03-T4** | 前端代理 | `frontend/vite.config.ts` 指向 3081 | D6-S03-T5 收口 | 完成 |

---

## Story 4 — 与 A/B 对齐内部契约

**D7-S04**  
作为集成负责人，我需要一份可发给 A/B 的字段清单，以便 9 月 2 日冻结内部接口时 C 只改客户端、不再直连对方库。

**验收条件**

- 文档写清：C 调用 A/B 的路径与当前兼容策略；C 已提供给 A 的对内接口 JSON；请 A/B 回复的问题。
- `course-service` 冲突以 A 的 `package.json` 为准，C 不改课程服务启动脚本。

### Tasks

| ID | Task | 完成定义 | 依据 | 状态 |
| --- | --- | --- | --- | --- |
| **D7-S04-T1** | 写对齐文档 | `docs/吴本昭/2026-09-01/01-C-跨服务内部API对齐.md` | 任务清单「与 A/B 对齐内部 API 路径、鉴权、错误码」 | 完成 |
| **D7-S04-T2** | 按代码补全响应体 | 三条成绩内部接口的请求/响应/错误码/降级表 | A 同步说明「9/2 开始前提交必要字段」 | 完成 |
| **D7-S04-T3** | 合入 main 时尊重 A | `course-service/package.json` 用 A 的 start/test/seed | 边界：不替 A 改 Course | 完成 |

---

## 看板一览

| 任务 ID | 类型 | 标题 | 主关联 | 优先级 | 状态 |
| --- | --- | --- | --- | --- | --- |
| D7-S01-T1 | DEV | 裁剪作业 Prisma Schema | UC05 | P0 | 完成 |
| D7-S01-T2 | OPS | 独立库与迁移 | UC05 | P0 | 完成 |
| D7-S01-T3 | DEV | 去掉跨库 Prisma | UC05、UC09 | P0 | 完成 |
| D7-S02-T1 | DEV | Course HTTP 客户端 | UC05 | P0 | 完成 |
| D7-S02-T2 | DEV | 名单 items/students 兼容 | UC09 | P0 | 完成 |
| D7-S02-T3 | DEV | 通知 Idempotency-Key | UC05 | P0 | 完成 |
| D7-S02-T4 | DEV | Lab 成绩客户端与降级 | UC09 | P0 | 完成 |
| D7-S02-T5 | DEV | C 对内成绩三条接口 | UC09 | P0 | 完成 |
| D7-S02-T6 | TEST | combineTotal / 成绩单测 | UC09 | P1 | 完成 |
| D7-S02-T7 | DEV | 切内部 access 接口 | UC05 | P0 | 完成 |
| D7-S03-T1 | DEV | Gateway 三服务路由 | — | P0 | 完成 |
| D7-S03-T2 | DEV | 限流与 502 | — | P0 | 完成 |
| D7-S03-T3 | TEST | 经网关冒烟 | UC05 | P0 | 完成 |
| D7-S03-T4 | DEV | Vite 指向 3081 | UC05 | P0 | 完成 |
| D7-S04-T1 | DOC | 对齐文档 | — | P0 | 完成 |
| D7-S04-T2 | DOC | 补全内部接口响应 | UC09 | P0 | 完成 |
| D7-S04-T3 | MGT | 合 main 不改 A 的 package.json | — | P0 | 完成 |

建议顺序（已执行）：**独立库 → Course/Lab 客户端 → 对内成绩接口与单测 → Gateway 路由/限流/502 → 对齐文档 → 合 main 时保留 A 的 course-service。**

出问题怎么找人（当天）：作业库/成绩降级/Gateway → C；名单和通知内部接口未实现 → A（9/2 冻结）；`lab-gradebook` 与错题 API → B。
