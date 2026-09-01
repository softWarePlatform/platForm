# A 任务清单：course-service 内部接口、Dashboard 与测试

- 日期：2026-09-02
- 范围：跨服务契约、Dashboard 聚合、课程服务公开/API 测试。

## 今日目标

冻结课程服务对内契约，并让 Dashboard 通过 HTTP 聚合 homework 与 lab 数据；课程服务不得重新直连另外两个服务的数据库。

## 任务清单

- [x] 实现并文档化 `GET /internal/users/:userId`、`GET /internal/courses/:courseId`。
- [x] 实现并文档化 `GET /internal/courses/:courseId/access/:userId`、`GET /internal/courses/:courseId/enrollments`、`GET /internal/courses/:courseId/classes`。
- [x] 实现 `POST /internal/notifications`：强制 `Idempotency-Key`，验证调用方身份，重复请求不得重复创建通知。
- [x] 实现 `POST /internal/dashboard/course-summaries:batch`，避免调用方逐课程 N+1 查询。
- [x] 为全部内部接口加入服务身份校验、Request-ID 透传、统一错误响应和参数校验；不信任浏览器透传的角色。
- [x] 改造 Dashboard：按 HTTP 调用 homework 与 lab 摘要接口，设置超时；未配置、超时或非 2xx 时返回本地课程和 `UNAVAILABLE`，不把远端数据当作 0。
- [x] 补齐课程服务 Unit Test 和 API Test：覆盖课程、选课、公告、资料、通知、管理员、内部鉴权、通知幂等及 Dashboard 降级。
- [x] Gateway 尚未落地，已以内部/公开路径契约测试替代，并记录 C 的待联调项。

## 完成标准与证据

1. B/C 能仅通过内部 HTTP API 获得用户、角色、课程权限、班级成员/学生名单和通知写入能力。
2. 权限依赖出错时业务写操作 fail-closed；通知幂等且不重复写入。
3. Dashboard 不含对 homework/lab 数据库的直接访问，并能清楚报告上游不可用状态。
4. 公开 API、内部 API、异常与权限测试均可通过单条命令重复运行；保留结果文件和失败复现步骤。

## 需同步给其他成员

- 给 B/C：冻结后的内部接口路径、字段、鉴权方式、超时、错误码与测试样例。
- 给 C：Dashboard 所依赖的 homework/lab 汇总接口及不可用状态处理约定。
- 给 E：跨服务契约测试清单、可复现环境变量和已知联调缺口。

证据见 [内部接口契约与验收](02-A-course-service-内部接口与验收.md) 与 [依赖清单](../跨成员依赖与智能决策清单.md)。
