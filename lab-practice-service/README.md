# lab-practice-service

UC06—UC08 的独立运行入口，负责实验、判题提交、练习与实验讨论接口。

当前为分阶段迁移状态：服务已经拥有独立进程、端口、健康检查、容器定义和
`prisma/schema.prisma`。独立 Schema 只声明 Lab 所有的实验、练习、错题和讨论模型；
`userId`、`courseId` 等跨服务标识为普通标量，不对 User/Course/Enrollment 建数据库外键。
健康检查、实验成绩和错题内部接口已经使用 Lab 自己的 Prisma Client。

UC06 实验域和 UC07 练习域已迁入本服务，并用 Course 内部 API 替换课程、用户、选课和通知查询。
UC08 讨论域仍处于兼容阶段，是最后一个待迁移公开入口。在全部路由迁出和历史数据迁移验证完成前，
不删除旧表或执行生产迁移。

## 本地运行

复制 `.env.example` 为 `.env`，确认 PostgreSQL 和 Redis 已启动，然后执行：

```powershell
npm install
npm run build
npm start
```

默认监听 `3003`：

- `GET /health/live`：进程存活，不检查外部依赖。
- `GET /health/ready`：同时检查 PostgreSQL 和 Redis。

开发模式可在仓库根目录执行 `npm run dev:lab-practice`。Vite 和 Nginx 会把 UC06—UC08
的原有 `/api/...` 路径转发到本服务，前端不需要修改请求地址。

## 实验成绩内部 API（B-02）

调用方必须携带 `x-internal-service-token` 请求头，其值与服务的
`INTERNAL_SERVICE_TOKEN` 一致。
这些地址仅供其他后端服务使用，不通过前端 Nginx 的 `/api` 入口暴露：

- `GET /internal/courses/:courseId/lab-grades/:userId`：查询一个学生。
- `POST /internal/courses/:courseId/lab-grades/batch`：批量查询，请求体为
  `{ "userIds": ["用户 UUID"] }`，单次最多 500 人。
- `GET /internal/courses/:courseId/lab-gradebook`：按 Course 名单返回全班实验成绩，供
  Homework 成绩册一次拉取，避免 N+1 请求。
- `POST /internal/courses/:courseId/lab-grades:batch`：冻结后的批量接口；斜杠版本暂时兼容。

每个实验取学生历次提交的最高分；实验集均分只统计已有成绩的实验；实验总均分为各个
有成绩实验集均分的算术平均。没有任何实验成绩时返回 `null`，不误写为零分。

## 错题内部 API（B-03）

`POST /internal/wrong-book/homework` 供 Homework 服务写入作业产生的错题，同样必须携带
内部服务 Token。请求体包含 `userId`、`courseId`、`homeworkId` 和 `entries`；每项包含
`title`、`content`，单次最多 100 项。

接口按“用户 + 作业 + 标题”幂等写入：首次调用创建，重复调用更新内容，不生成重复记录，
也不会重置用户已经设置的 `mastered` 状态。响应提供 `createdCount` 和 `updatedCount`。

冻结后的正式写接口为 `PUT /internal/wrong-book/entries`，并要求 `Idempotency-Key`；
`DELETE /internal/wrong-book/entries/HOMEWORK/:homeworkId` 用于删除某次作业来源的错题。

## 验证

```powershell
npm test
npm run build
```
