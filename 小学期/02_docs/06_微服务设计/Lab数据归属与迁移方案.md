# B：Lab 数据所有权与迁移冻结方案

## 1. 审计结论与冻结决定

目标边界正式冻结如下：**Lab 只拥有实验与练习领域数据；用户、课程和选课关系由
Course/User 服务拥有。Lab 仅保存 `userId`、`courseId` 等外部标识，不建立跨服务数据库
外键，业务有效性通过 Course 内部 API 校验。**

截至 2026-09-03，工作区中的独立 Lab Schema 已按该边界建立：没有声明 `User`、`Course`、
`Class`、`Enrollment` 或 `Homework` 模型；`userId`、`courseId`、`classId`、`sourceId` 均作为
普通标量保存；数据库关系只连接 Lab 内部实体。该实现仍处于未提交改造中，必须完成迁移、测试和
代码评审后才可视为实现验收。本文件冻结的是数据所有权和迁移规则，不代表生产迁移已经完成。

## 2. 数据所有权表

| 数据/能力 | 唯一所有者 | Lab 中的保存方式 | 校验或访问方式 |
| --- | --- | --- | --- |
| User、角色和账号状态 | Course/User | 只保存 `userId` | Course 内部用户/访问接口 |
| Course、Class、Enrollment | Course | 只保存 `courseId`，必要时保存 `classId` | Course 内部课程、权限和名单接口 |
| LabSet、Lab、TestCase、LabFile | Lab | Lab 本地实体 | Lab Repository/Prisma Client |
| Submission、评测结果 | Lab | Lab 本地实体，关联本地 `labId`，保存外部 `userId` | Redis + Judge Worker + Lab API |
| PracticeQuestion、Session、Item、Feedback | Lab | Lab 本地实体，保存外部 `userId/courseId` | Lab API |
| WrongBookEntry | Lab | Lab 本地实体，保存来源类型、来源 ID 和外部 ID | Lab 内部幂等 API |
| DiscussionPost、Comment、Attachment | Lab | Lab 本地实体，保存外部 `userId/courseId` | Lab API；通知通过 Course 内部 API |
| Homework、HomeworkSubmission | Homework | Lab 不保存作业实体 | Homework 通过 Lab 内部错题 API 写入来源记录 |
| 综合成绩 | Homework/Grade | Lab 只提供实验成绩 | 实验成绩内部查询/批量查询 API |

允许 Lab 数据表内部建立外键，例如 `Lab -> LabSet`、`Submission -> Lab`、
`DiscussionComment -> DiscussionPost`。禁止建立指向 `User`、`Course`、`Class`、`Enrollment` 或
`Homework` 表的数据库外键。

## 3. 最终方案

1. 在 `lab-practice-service/prisma` 建立独立 Schema、迁移目录和 Prisma Client，只声明 Lab
   所有的模型。
2. `userId`、`courseId`、`classId`、`sourceId` 均为普通标量并建立必要索引，不声明跨服务
   `@relation`。
3. 统一由 `course-client` 完成课程存在性、用户状态、课程访问权、教师身份和选课名单校验；
   请求携带 `x-internal-service-token` 与 `x-request-id`，并设置超时。
4. Course 返回 401/404/429/5xx 或超时时，Lab 映射成稳定错误；依赖 Course 的业务快速返回
   401、403、404 或 503，健康存活接口不得被级联拖垮。
5. 实验成绩不可用或学生没有任何有效实验分数时返回 `null`；只有真实评测结果为零时才返回
   `0`。Homework 不得把 `UNAVAILABLE` 或 `null` 换算为零分。
6. Homework 写错题只能调用 Lab 内部 API；相同来源和幂等键重试不得产生重复记录。

## 4. 迁移步骤

1. 建立独立 Schema 和 Repository，在空测试库执行 `prisma validate`、生成 Client 和迁移。
2. 补齐 Course 内部客户端及契约测试，替换所有 `prisma.user/course/enrollment` 查询。
3. 将 UC06—UC08 路由、成绩计算、错题写入和 Judge Dispatcher 迁入 Lab，消除对
   `backend/src` 与 `backend/prisma` 的运行期导入。
4. 编写只读盘点脚本，按表记录旧库数量、主键范围、空外部 ID 和孤儿记录。
5. 在隔离测试库创建 Lab Schema，按依赖顺序迁移 LabSet/Lab/TestCase、Submission、Practice、
   WrongBook、Discussion；迁移后核对数量、关键字段及抽样哈希。
6. 保持旧实现可用，在测试环境先进行只读对比，再短暂停写完成增量迁移；切换 Gateway 到新
   Lab Service 后执行 UC06—UC08、内部成绩、错题幂等和 Worker 恢复测试。
7. CI、API、E2E 和 Kubernetes 验证全部通过并经 A/B/C/D 确认后，才允许安排生产迁移。
8. 旧表至少保留一个约定观察期；未经书面批准不得删除、改名或清空。

## 5. 回滚步骤

1. 切换失败时立即停止新 Lab 写入，将 Gateway 路由恢复到旧 Backend 兼容入口。
2. 若已进入增量阶段，记录切换点和新库新增主键，按幂等迁移脚本反向同步必要结果。
3. 恢复旧 Worker/队列消费者，确认 `PENDING` 任务继续处理且没有双消费者。
4. 使用迁移前备份和数量/哈希报告验证旧库，保留新库现场用于诊断，不直接删除。
5. 重新验证登录、实验提交、查询结果、成绩册和错题链路；确认稳定后结束回滚。

## 6. 冻结后的验收条件

- Lab Schema 中不存在 `User/Course/Enrollment/Homework` 模型及指向它们的外键；
- `lab-practice-service` 不再运行期导入 `backend/src` 或 `backend/prisma`；
- 搜索 Lab 源码不存在 `prisma.user/course/enrollment`；
- Course 正常、401、404、超时和 503 契约测试通过；
- 缺失实验成绩为 `null`，真实零分保留 `0`；
- 空库迁移、历史数据迁移、回滚演练、API/E2E 和数据核对均有报告。

本次只冻结方案并形成迁移依据，**未删除旧表、未修改生产数据库、未执行生产迁移**。

## 7. 方案确认记录

确认内容统一为：认可第 2 节数据所有权表、第 3 节外部 ID 与禁止跨服务外键规则，以及第 4、5 节
迁移与回滚原则。确认方案不等于批准立即执行生产迁移。

| 角色 | 需确认内容 | 状态 | 日期/备注 |
| --- | --- | --- | --- |
| B（Lab） | Lab 领域实体、外部 ID、内部关系及迁移顺序 | 已确认 | 2026-09-03，本文件提交即为 B 的确认 |
| A（Course/User） | User/Course/Class/Enrollment/Notification 所有权及内部 API | 待确认 | 在 PR 或组内记录回复“同意” |
| C（Homework/Grade） | Homework、HomeworkSubmission、作业成绩所有权及 Lab 接口 | 待确认 | 在 PR 或组内记录回复“同意” |
| D（部署） | 独立数据库、Secret、migration 和回滚的部署顺序 | 待确认 | 在 PR 或组内记录回复“同意” |

### A/C/D 统一确认文本

```text
确认《B：Lab 数据所有权与迁移冻结方案》：同意数据所有权表；Lab 仅保存外部 ID，
不建立指向 User/Course/Class/Enrollment/Homework 的数据库外键；生产迁移须按文档步骤执行并可回滚。
角色：A/C/D；确认人：________；日期：________。
```

### P1 完成判定

- B 已完成方案编写、Schema 只读核对和文档提交后，P1 状态为“B 已冻结，等待跨角色确认”；
- A、C、D 均留下可追溯确认后，P1 才标记“全部完成”；
- 在全部确认前，可以继续空库验证和单元测试，但不得删除旧表或执行生产数据迁移。
