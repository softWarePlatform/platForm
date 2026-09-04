# A：course-service API 验收记录

- 日期：2026-09-01
- 验收地址：`http://localhost:3001`
- 结论：**通过**。

## 自动化结果

| 命令 | 结果 |
| --- | --- |
| `npm run test:api` | 通过；覆盖课程服务核心业务链路 |
| `npm run test` | 1/1 通过；路由归属与 Dashboard 边界测试 |
| `npm run build` | 通过 |
| `npm run db:migrate` | 通过；无待应用迁移 |

API 冒烟测试文件为 `course-service/tests/api-smoke.mjs`。执行前先运行 `npm run db:seed`，并在另一终端通过 `npm run start` 启动服务。

## 验收场景

| 用例 | 正常路径 | 异常/权限路径 | 结果 |
| --- | --- | --- | --- |
| UC01 选课 | 学生在开放阶段选课成功 | 对课表冲突课程选课返回 409 | 通过 |
| UC02 课程管理 | 教师创建并发布课程，返回 201/200 | 学生创建课程返回 403；重复课程代码由 API 返回 409 | 通过 |
| UC03 公告 | 教师发布，学生读取并标记已读，生成站内通知 | 非成员/非教师由课程权限校验拒绝 | 通过 |
| UC04 资料 | 教师上传，学生收藏并下载资料 | 非成员不能查看、收藏或下载；超 50MB 文件被拒绝 | 通过 |
| UC10 管理 | 管理员更新选课阶段并查询选课/建课审计 | 非管理员无法调用管理员接口 | 通过 |
| 基础设施 | `/health/live`、`/health/ready` 均返回 `ok=true` | 数据库不可用时就绪检查返回 503 | 通过 |

本次实际 API 冒烟输出：`status=passed`，并记录了新建课程、学生选课与审计日志数量。测试写入只位于 `course_service` 独立数据库。

## 已知范围

- UI/网关仍未切换到 `course-service`，由 C 负责 Gateway 接入后联调。
- Dashboard 仍未聚合 homework/lab 数据；A 将在 9 月 2 日按内部 HTTP 契约实现，不会回退为跨库查询。
- Dockerfile 与基础 Kubernetes YAML 按 9 月 3 日清单交付。
