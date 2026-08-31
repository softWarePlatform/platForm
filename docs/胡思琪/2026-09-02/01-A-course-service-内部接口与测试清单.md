# A 任务清单：course-service 内部接口、Dashboard 与测试

- 日期：2026-09-02
- 范围：跨服务契约、Dashboard 聚合、课程服务公开/API 测试。

## 今日目标

冻结课程服务对内契约，并让 Dashboard 通过 HTTP 聚合 homework 与 lab 数据；课程服务不得重新直连另外两个服务的数据库。

## 任务清单

- [ ] 实现并文档化 `GET /internal/users/:userId`、`GET /internal/courses/:courseId`。
- [ ] 实现并文档化 `GET /internal/courses/:courseId/access/:userId`、`GET /internal/courses/:courseId/enrollments`、`GET /internal/courses/:courseId/classes`。
- [ ] 实现 `POST /internal/notifications`：强制 `Idempotency-Key`，验证调用方身份，重复请求不得重复创建通知。
- [ ] 实现 `POST /internal/dashboard/course-summaries:batch`，避免调用方逐课程 N+1 查询。
- [ ] 为全部内部接口加入服务身份校验、Request-ID 透传、统一错误响应和参数校验；不得信任浏览器透传的角色。
- [ ] 改造 Dashboard：调用 homework 的课程作业汇总接口与 lab 的实验汇总接口，设置超时；依赖不可用时返回部分数据和明确的 `UNAVAILABLE` 状态，禁止将不可用数据当作 0。
- [ ] 补齐课程服务 Unit Test 和 API Test：课程/选课/公告/资料/通知/管理员、内部接口鉴权、幂等、超时和 Dashboard 降级。
- [ ] 在 C 的 Gateway 路由规则下验证 `/api/**` 公开路径兼容；如网关尚未可用，使用契约测试替代并记录待联调项。

## 完成标准与证据

1. B/C 能仅通过内部 HTTP API 获得用户、角色、课程权限、班级成员/学生名单和通知写入能力。
2. 权限依赖出错时业务写操作 fail-closed；通知幂等且不重复写入。
3. Dashboard 不含对 homework/lab 数据库的直接访问，并能清楚报告上游不可用状态。
4. 公开 API、内部 API、异常与权限测试均可通过单条命令重复运行；保留结果文件和失败复现步骤。

## 需同步给其他成员

- 给 B/C：冻结后的内部接口路径、字段、鉴权方式、超时、错误码与测试样例。
- 给 C：Dashboard 所依赖的 homework/lab 汇总接口及不可用状态处理约定。
- 给 E：跨服务契约测试清单、可复现环境变量和已知联调缺口。
