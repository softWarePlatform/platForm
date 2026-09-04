# D6 Story 与 Tasks（任务 C）

- 日期：2026-08-31（后五天第 1 天 / 官方 D6）
- 身份：Homework + Integration Owner
- 负责人：吴本昭
- 对应用例：UC05（作业发布/提交/批改）、UC09（成绩入口先冒烟，跨库改 API 放到 D7）
- 依据：`docs/吴本昭/任务C-后五天任务清单.md` §D6；`docs/范文歆/2026-8-29/01-D6-微服务划分图.md`；`docs/范文歆/2026-8-29/02-D6-最终服务接口清单.md`

## 当日完成标准

作业成绩服务独立启动并通过核心 API 测试；前端能经统一入口打到后端（路由可先通核心路径）。

## 当日不做（留给 D7+）

| 不做 | 原因 |
| --- | --- |
| 作业域独立 Schema / 迁移、禁止跨库 | D7 |
| 学生名单、课程权限、综合成绩改内部 API | D7（今天仍可直连同一 Postgres） |
| Gateway 三服务全量路由、基础限流、错误转发打磨 | D7 补齐；今天核心路径即可 |
| 成绩汇总超时/降级、错题走 Lab API | D8 |
| Dockerfile / K8s YAML / PPT | D9 |

---

## Epic

**D6-E01 作业服务拆分 + Gateway 起步**  
把作业成绩从 Fastify 单体抽出为可独立构建、启动、健康检查的 `homework-grade-service`，并立一个对外仍走 `/api` 的 API Gateway，先打通作业核心路径和 Request-ID。

| 字段 | 内容 |
| --- | --- |
| 负责人 | 吴本昭（任务 C） |
| 对应 UC | UC05 主；UC09 仅健康/配置读接口冒烟 |
| 计划完成 | 2026-08-31 |
| 证据 | 服务启动日志；`/health/live` `/health/ready`；核心 API 冒烟 JSON；Gateway 转发带 `X-Request-ID` 的请求记录 |
| 依赖 | Postgres 可用；JWT 与单体同一密钥；A/B 的服务未齐时，Gateway 非作业路径可仍指向现有 `backend` 单体 |

---

## Story 1 — 抽出 homework-grade-service

**D6-S01**  
作为作业成绩服务负责人，我需要一份可独立构建的 `homework-grade-service`（代码、路由、Prisma 客户端），以便第二天再切独立库表和跨服务 API，而不是继续改单体里的作业模块。

**验收条件**

- 仓库中存在独立目录 `homework-grade-service/`（或组内已约定的等价路径），含自己的 `package.json`、入口、路由注册。
- 迁入作业域路由与支撑库：`homework.ts`、`homework-student.ts`、`grades.ts` 及 `lib/homework-*.ts`；不迁入 course / lab / practice / judge。
- Prisma Schema 至少包含作业域模型（可先复制整份 schema 共用同一数据库；**不要求**当天拆库）。
- 单体 `backend` 中对应作业路由可暂时保留（双跑）或改为关闭；二选一须在简报写明，避免前端打到两个实现。
- `npm run build` 在该目录下成功。

### Tasks

| ID | Task | 完成定义 | 依据 |
| --- | --- | --- | --- |
| **D6-S01-T1** | 盘点作业域代码与表 | 列出迁入文件、Prisma 模型、仍依赖 Course/Enrollment/Lab 的调用点 | `backend/src/routes/homework.ts`、`homework-student.ts`、`grades.ts`；划分图第 3 节表归属 |
| **D6-S01-T2** | 建独立服务骨架 | 目录可 `npm install` / `npm run build`；端口与单体错开（建议 `:3002`） | 任务清单 D6「抽出代码、路由、Prisma Schema」 |
| **D6-S01-T3** | 迁入路由与作业 lib | 服务入口只注册作业/学生作业/成绩路由 + 鉴权/上传/限流等运行所需插件 | `backend/src/index.ts` 中 `homeworkRoutes` / `homeworkStudentRoutes` / `gradesRoutes` |
| **D6-S01-T4** | 接入 Prisma（可共用库） | 服务能连现有 Postgres 并读写作业表；跨表查询允许暂留，在盘点清单标注「D7 改 API」 | 任务清单：独立 Schema 明确在 D7 |
| **D6-S01-T5** | 约定与单体的关系 | 简报写清：作业流量只打新服务，或单体作业路由已摘除/开关关闭 | 避免双写、双实现 |

---

## Story 2 — 独立启动、健康检查、核心 API 冒烟

**D6-S02**  
作为验收人，我需要作业成绩服务能单独拉起，并证明作业发布、提交、批改主路径仍然可用，以便认定「拆分第一步」完成。

**验收条件**

- 进程独立于 `backend`：本服务 `GET /health/live` 返回 200；`GET /health/ready` 能探活本服务所用数据库。
- 核心冒烟（登录教师/学生后）至少覆盖：
  1. 教师创建或列出课程作业（`POST/GET /courses/:courseId/homework`）
  2. 学生提交（`POST /homework/:id/submit` 或文件提交之一）
  3. 教师批改（`POST /homework/submissions/:sid/grade` 或现网等价路径）
- 冒烟失败非零退出；原始结果写入 `docs/吴本昭/2026-8-31/raw/`。
- UC09 综合成绩**不要求**当天改调用链；`grades` 读接口能 200 即可，跨库聚合缺陷记入 D7。

### Tasks

| ID | Task | 完成定义 | 依据 |
| --- | --- | --- | --- |
| **D6-S02-T1** | 健康检查 | `live` 不碰依赖；`ready` 查库失败返回 503；响应标明 `service: homework-grade` | 现 `backend/src/routes/health.ts`；任务清单「独立启动、健康检查」 |
| **D6-S02-T2** | 独立启动脚本 | README 或 `package.json` 写明 `dev`/`start`、端口、环境变量（`DATABASE_URL`、`JWT` 与单体一致） | 任务清单「独立构建、独立启动」 |
| **D6-S02-T3** | 核心 API 冒烟脚本 | 覆盖作业/提交/批改；失败 exit 1；产出 JSON | UC05；任务清单「作业/提交/批改等核心 API 冒烟通过」 |
| **D6-S02-T4** | 记录已知缺口 | 成绩册仍直查 Lab/Enrollment 等写入 D7 待改清单，不在今天改调用 | `grades.ts` 中 `prisma.course` / `prisma.submission` |

---

## Story 3 — API Gateway 统一入口与 Request-ID

**D6-S03**  
作为前端调用方，我需要一个统一入口转发到作业服务（及其他已存在的后端），并带上 Request-ID，以便外部继续使用 `/api`，而不把浏览器改打三个端口。

**验收条件**

- 存在 `api-gateway`（独立 Node 进程，**不算**第四个业务微服务）。
- 外部路径保持 `/api/...`；网关去掉或保留前缀的规则与现前端一致（当前 Vite 把 `/api` rewrite 掉再打到 3000——网关对外应继续吃 `/api`，对下游按服务约定转发）。
- 至少转发作业核心路径到 `homework-grade-service`：
  - `/api/homework/**`
  - `/api/courses/:courseId/homework/**`
  - `/api/grades/**`、`/api/courses/:courseId/grading-config/**`（若当天 grades 已挂在新服务）
- 其余 `/api/**` 可先回退到现有单体 `backend:3000`（A/B 未拆完时允许）。
- 无 `X-Request-ID` 时网关生成；向下游传递；响应带回同一 ID。
- 浏览器或 curl：经网关打作业列表/健康检查成功；证据含 Request-ID。

### Tasks

| ID | Task | 完成定义 | 依据 |
| --- | --- | --- | --- |
| **D6-S03-T1** | 搭 Gateway 骨架 | 独立启动；默认入口建议 `:8080`；只做反向代理，不含业务表 | 划分图：React → Gateway → 三服务 |
| **D6-S03-T2** | 作业路径精确转发 | 具体路径优先于 `/api/courses/**` 通配，避免作业打到 course/单体错误实例 | 接口清单 §2 网关公开路由归属 |
| **D6-S03-T3** | `/api` 兼容 + 回退 | 前端仍请求 `/api`；未匹配作业的路径转到单体；记录回退名单 | 任务清单「外部 `/api` 尽量兼容」；「路由可先通核心路径」 |
| **D6-S03-T4** | Request-ID 打通 | 生成、透传、回写响应头；作业服务日志能看到同一 ID | 单体已有 `requestIdHeader: x-request-id`；任务清单「可先打通传递」 |
| **D6-S03-T5** | 前端代理改指向网关 | 开发时 Vite `proxy /api` 指向 Gateway 而非直连 3000；验证一次页面或 curl | `frontend/vite.config.ts` |
| **D6-S03-T6** | Gateway 冒烟 | 经网关：作业健康或作业列表 200；响应含 `X-Request-ID` | 当日完成标准「前端能经统一入口打到后端」 |

---

## 看板一览（可直接建卡）

| 任务 ID | 类型 | 标题 | 主关联 | 优先级 | 状态 |
| --- | --- | --- | --- | --- | --- |
| D6-S01-T1 | DES | 盘点作业域代码与表 | UC05 | P0 | 待办 |
| D6-S01-T2 | DEV | 建 homework-grade-service 骨架 | UC05 | P0 | 待办 |
| D6-S01-T3 | DEV | 迁入作业/成绩路由 | UC05、UC09 | P0 | 待办 |
| D6-S01-T4 | DEV | Prisma 接入（共用库） | UC05 | P0 | 待办 |
| D6-S01-T5 | MGT | 约定单体作业路由去留 | UC05 | P0 | 待办 |
| D6-S02-T1 | DEV | 作业服务健康检查 | UC05 | P0 | 待办 |
| D6-S02-T2 | OPS | 独立启动脚本与端口 | UC05 | P0 | 待办 |
| D6-S02-T3 | TEST | 作业/提交/批改冒烟 | UC05 | P0 | 待办 |
| D6-S02-T4 | DOC | 跨库调用缺口（D7） | UC09 | P1 | 待办 |
| D6-S03-T1 | DEV | Gateway 骨架 | — | P0 | 待办 |
| D6-S03-T2 | DEV | 作业路径转发 | UC05 | P0 | 待办 |
| D6-S03-T3 | DEV | `/api` 兼容与单体回退 | — | P0 | 待办 |
| D6-S03-T4 | DEV | Request-ID 传递 | — | P0 | 待办 |
| D6-S03-T5 | DEV | 前端代理改 Gateway | UC05 | P0 | 待办 |
| D6-S03-T6 | TEST | 经网关冒烟 | UC05 | P0 | 待办 |

建议顺序：**S01-T1 → 骨架/迁入/Prisma → 健康与启动 → 冒烟 → Gateway 转发与 Request-ID → 改前端代理 → 经网关再冒烟。**

出问题怎么找人（当天）：Homework 抽不出来或冒烟失败 → 你；Gateway 路由/Request-ID → 你；Course/Lab 尚未独立 → 不阻塞 D6，回退单体即可。
