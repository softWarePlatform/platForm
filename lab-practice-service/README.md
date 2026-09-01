# lab-practice-service

UC06—UC08 的独立运行入口，负责实验、判题提交、练习与实验讨论接口。

当前为迁移第一阶段：服务拥有独立进程、端口、健康检查和容器定义，业务路由暂时复用
`backend/src` 中的实现，以保持公共 API 和现有业务规则不变。后续任务将把课程访问、用户信息
和通知写入替换为内部 API，再逐步移动共享源码。

## 本地运行

复制 `.env.example` 为 `.env`，确认 PostgreSQL 和 Redis 已启动，然后执行：

```powershell
npm install
npm run build
npm start
```

默认监听 `3001`：

- `GET /health/live`：进程存活，不检查外部依赖。
- `GET /health/ready`：同时检查 PostgreSQL 和 Redis。

开发模式可在仓库根目录执行 `npm run dev:lab-practice`。Vite 和 Nginx 会把 UC06—UC08
的原有 `/api/...` 路径转发到本服务，前端不需要修改请求地址。

## 实验成绩内部 API（B-02）

调用方必须携带 `X-Internal-Token` 请求头，其值与服务的 `INTERNAL_API_TOKEN` 一致。
这些地址仅供其他后端服务使用，不通过前端 Nginx 的 `/api` 入口暴露：

- `GET /internal/courses/:courseId/lab-grades/:userId`：查询一个学生。
- `POST /internal/courses/:courseId/lab-grades/batch`：批量查询，请求体为
  `{ "userIds": ["用户 UUID"] }`，单次最多 500 人。

每个实验取学生历次提交的最高分；实验集均分只统计已有成绩的实验；实验总均分为各个
有成绩实验集均分的算术平均。没有任何实验成绩时返回 `null`，不误写为零分。

## 错题内部 API（B-03）

`POST /internal/wrong-book/homework` 供 Homework 服务写入作业产生的错题，同样必须携带
`X-Internal-Token`。请求体包含 `userId`、`courseId`、`homeworkId` 和 `entries`；每项包含
`title`、`content`，单次最多 100 项。

接口按“用户 + 作业 + 标题”幂等写入：首次调用创建，重复调用更新内容，不生成重复记录，
也不会重置用户已经设置的 `mastered` 状态。响应提供 `createdCount` 和 `updatedCount`。

## 验证

```powershell
npm test
npm run build
```
