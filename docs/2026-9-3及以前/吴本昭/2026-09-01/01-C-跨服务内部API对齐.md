# C：跨服务内部 API 对齐（提交给 A / B 冻结）

- 日期：2026-09-01（D7，按代码补全）
- 身份：Homework + Integration Owner
- 依据：`docs/范文歆/2026-8-29/02-D6-最终服务接口清单.md`；A `docs/胡思琪/2026-09-01/04-A-course-service-同步说明.md`（内部契约 9 月 2 日冻结）
- 请 A/B **9 月 2 日开始前**确认或打回本文字段。C 侧客户端与对内接口已按下列形状实现。

| 服务 | 端口 | 库 |
| --- | --- | --- |
| course-service | 3001 | `course_service` |
| homework-grade-service | 3002 | `homework_grade_service` |
| lab-practice-service | 3003（建议） | 由 B 定 |
| api-gateway | 3081 | 无库 |

本地公共请求头：

| 头 | 值 |
| --- | --- |
| `x-internal-service-token` | 三服务必须同一值。代码默认 `course-service-internal-local-token`；若 `.env` 里是 `replace-with-service-token`，A/B/C 都用这一份 |
| `x-request-id` | 网关透传；无则服务生成 |
| `Idempotency-Key` | 写接口必填（通知、错题） |

错误体（内部接口）：

```json
{ "code": "STRING", "message": "人类可读", "requestId": "uuid" }
```

超时：权限 1s；名单/通知/错题 2s；批量成绩 3s。权限失败 **fail-closed**；成绩聚合失败返回部分结果并带 `UNAVAILABLE`，**禁止当 0 分**。

`/internal/**` 不对浏览器开放；只给服务间调用。

---

## 1. 请 A 冻结（course-service `:3001`）

### 1.1 P0 — 9 月 2 日必须可调用

C 已按下列路径发出请求。A 未实现时：名单 `rosterStatus=UNAVAILABLE`（学生列表降级为已有提交的 `userId`）；通知跳过且 **不回滚** 成绩发布。

#### `GET /internal/courses/:courseId/enrollments`

用途：教师成绩册、提交列表、内部 `final-gradebook` 的学生名单。作业有 `targetClassId` 时需要按班过滤。

Query：`page=1` `pageSize=200` `classId?`

```http
GET /internal/courses/{courseId}/enrollments?page=1&pageSize=200
x-internal-service-token: …
x-request-id: …
```

**请冻结为：**

```json
{
  "courseId": "uuid",
  "items": [
    {
      "id": "user-uuid",
      "email": "student@course.local",
      "name": "示例学生",
      "role": "STUDENT",
      "classId": "uuid-or-null"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 200
}
```

C **已兼容**：`items` 或 `students`；成员主键 `id` 或 `userId`。分页字段目前不强制。  
失败：401 令牌错；404 课程不存在。超时/5xx → `rosterStatus=UNAVAILABLE`。

#### `POST /internal/notifications`

用途：教师 `PATCH /homework/:id/release-grades` 后通知已批改学生。

```http
POST /internal/notifications
content-type: application/json
x-internal-service-token: …
x-request-id: …
Idempotency-Key: {requestId 或 homeworkId:title:userIds}
```

```json
{
  "userIds": ["uuid"],
  "type": "HOMEWORK",
  "title": "作业成绩已发布",
  "body": "《作业标题》成绩已发布",
  "homeworkId": "uuid",
  "idempotencyKey": "与 Idempotency-Key 头相同"
}
```

成功：`200/201`，C 不依赖响应业务字段。同一幂等键不得再插通知。  
C **已同时发送** `Idempotency-Key` 头和 JSON `idempotencyKey`。A 冻结后只需认一种，建议只认请求头。

### 1.2 P1 — 用来替换公开 API 做权限

C 现在仍用 Bearer 打：`GET /auth/me`、`GET /courses/:id`、`GET /enrollment/catalog`。下列齐了立刻切：

| 方法 | 路径 | C 需要的最小字段 |
| --- | --- | --- |
| GET | `/internal/users/:userId` | `{ id, name, email, role, status }` |
| GET | `/internal/courses/:courseId` | `{ id, title, teacherId, published }` |
| GET | `/internal/courses/:courseId/access/:userId` | `{ canView, isTeacher, isEnrolled, classIds }` |
| GET | `/internal/courses/:courseId/classes` | 班级 `{ id, name }[]`（按班级发布作业） |

权限接口失败必须 **拒绝写操作**（创建作业、提交、批改）。

---

## 2. A / Dashboard 可调用 C（homework-grade-service `:3002`）

鉴权：`x-internal-service-token`（与 A 相同）。无令牌：

```json
{ "code": "INTERNAL_UNAUTHORIZED", "message": "内部调用身份无效", "requestId": "…" }
```

HTTP 401。

### 2.1 已实现一览

| 方法 | 路径 | 用途 | 超时 |
| --- | --- | --- | --- |
| GET | `/internal/homework/:homeworkId` | 作业最小信息 | 1s |
| GET | `/internal/courses/:courseId/homework-summary` | Dashboard 汇总 | 2s |
| GET | `/internal/courses/:courseId/users/:userId/homework-grade` | 单人**已发布**作业成绩 | 2s |
| POST | `/internal/courses/:courseId/homework-gradebook/batch` | 批量已发布成绩，避免 N+1 | 3s |
| POST | `/internal/courses/:courseId/homework-gradebook:batch` | 同上（范文歆 AIP 写法，Fastify 另注册 `/batch`） | 3s |
| GET | `/internal/courses/:courseId/final-gradebook` | 作业+实验总评；Lab/名单不可用时部分结果 | 3s |

调用方请优先用 `/homework-gradebook/batch`。C 两种路径同一 handler。

### 2.2 `GET /internal/homework/:homeworkId`

```json
{
  "homework": {
    "id": "uuid",
    "courseId": "uuid",
    "title": "作业标题",
    "dueAt": "2026-09-01T00:00:00.000Z",
    "published": true
  }
}
```

无此作业：404 `{ "code": "HOMEWORK_NOT_FOUND", … }`。

### 2.3 `GET /internal/courses/:courseId/homework-summary`

```json
{
  "courseId": "uuid",
  "homeworkCount": 3,
  "publishedCount": 2,
  "submittedCount": 10,
  "gradedCount": 8,
  "averageScore": 86.5,
  "calculatedAt": "2026-09-01T00:00:00.000Z"
}
```

`averageScore` 按已批改提交计算；无批改则为 `null`。此接口**不**区分是否已发布（给教师 Dashboard）。

### 2.4 `GET /internal/courses/:courseId/users/:userId/homework-grade`

只返回 `released=true` 的成绩，不泄露未发布分数。

```json
{
  "courseId": "uuid",
  "userId": "uuid",
  "homeworkStatus": "OK",
  "homeworkAverage": 90,
  "homeworks": [
    {
      "homeworkId": "uuid",
      "title": "作业 1",
      "score": 90,
      "graded": true,
      "released": true
    }
  ],
  "calculatedAt": "2026-09-01T00:00:00.000Z"
}
```

该用户没有任何已发布成绩时：`homeworks: []`，`homeworkAverage: null`，仍 200。ID 非法：400 `INVALID_ID`。

### 2.5 `POST /internal/courses/:courseId/homework-gradebook/batch`

```http
POST /internal/courses/{courseId}/homework-gradebook/batch
content-type: application/json
x-internal-service-token: …
```

```json
{ "userIds": ["uuid", "uuid"] }
```

`userIds` 可省略：则对「本课程已有提交的用户」批量。最多 500 个。非法 uuid 进入 `errors`，不导致整单 500。每人规则与 2.4 相同（只含已发布）。

```json
{
  "courseId": "uuid",
  "homeworkStatus": "OK",
  "items": [
    {
      "userId": "uuid",
      "homeworkAverage": 90,
      "homeworks": [{ "homeworkId": "uuid", "title": "作业 1", "score": 90, "graded": true, "released": true }]
    }
  ],
  "errors": [{ "userId": "not-a-uuid", "code": "INVALID_USER_ID", "message": "用户 ID 无效" }],
  "calculatedAt": "2026-09-01T00:00:00.000Z"
}
```

### 2.6 `GET /internal/courses/:courseId/final-gradebook`

教师总评口径：作业均分用**已批改**分数（含未发布，条目上带 `released`）；实验来自 Lab `lab-gradebook`。

```json
{
  "courseId": "uuid",
  "courseTitle": "课程名或 courseId",
  "weights": { "labWeight": 0.4, "homeworkWeight": 0.6, "version": 2 },
  "labStatus": "UNAVAILABLE",
  "rosterStatus": "UNAVAILABLE",
  "homeworkStatus": "OK",
  "students": [
    {
      "user": { "id": "uuid", "name": "学生", "email": "s@x" },
      "homework": [
        { "homeworkId": "uuid", "title": "作业 1", "score": 90, "graded": true, "released": true }
      ],
      "summary": {
        "homeworkAverage": 90,
        "labAverage": null,
        "labStatus": "UNAVAILABLE",
        "totalScore": null,
        "provisionalTotal": 54
      },
      "rank": 1
    }
  ],
  "calculatedAt": "2026-09-01T00:00:00.000Z"
}
```

降级约定（禁止把 unavailable 当成 0）：

| 依赖 | 字段 | 行为 |
| --- | --- | --- |
| Lab 挂了 / 超时 / 非 2xx / 正文 `labStatus=UNAVAILABLE` | `labStatus=UNAVAILABLE` | `totalScore=null`，`labAverage=null`，`provisionalTotal = homeworkAverage * homeworkWeight` |
| 名单接口失败 | `rosterStatus=UNAVAILABLE` | 学生列表改为「已有提交的 userId」 |
| 作业库超时 | 503 `HOMEWORK_UNAVAILABLE` | 整单失败，不返回假 0 分 |

无 `GradingConfig` 行时权重默认实验 0.5 / 作业 0.5，`version` 为 0。

### 2.7 C 内部错误码

| HTTP | code | 何时 |
| --- | --- | --- |
| 401 | `INTERNAL_UNAUTHORIZED` | 缺/错内部令牌 |
| 400 | `INVALID_COURSE_ID` / `INVALID_HOMEWORK_ID` / `INVALID_ID` / `INVALID_BODY` | 参数 |
| 404 | `HOMEWORK_NOT_FOUND` | 作业不存在 |
| 503 | `HOMEWORK_UNAVAILABLE` | 总评查询超时或内部错误 |

---

## 3. 请 B 冻结（lab-practice-service，建议 `:3003`）

仓库里目前还没有独立 lab 目录。C 已按契约写客户端；B 未就绪时 `labStatus=UNAVAILABLE`，`totalScore=null`，带 `provisionalTotal`，**不会把实验当 0**。

### 3.1 P0 — 综合成绩（UC09）

范文歆清单：

- `GET /internal/courses/:courseId/users/:userId/lab-grade`
- `POST /internal/courses/:courseId/lab-grades:batch`

C **当前已发出**（全班一次，避免成绩册 N+1），超时 **3s**：

```http
GET /internal/courses/{courseId}/lab-gradebook
x-internal-service-token: …
x-request-id: …
```

```json
{
  "courseId": "uuid",
  "labStatus": "OK",
  "labAverage": 82.5,
  "students": [
    { "userId": "uuid", "labAverage": 80 }
  ]
}
```

C 处理规则：HTTP 非 2xx、超时、网络失败、或 JSON 里 `labStatus` 为 `UNAVAILABLE` → 全部按不可用降级。

请 B 二选一：

1. **推荐**：实现上面的 `GET …/lab-gradebook`，与 C 现网一致。  
2. 只做范文歆的 `POST …/lab-grades:batch`：请给出 `{ userIds }` 请求体和响应；C 改客户端。

单人失败请在响应里列错误项，不要整单 500。

### 3.2 P1 — 作业错题写入（WrongBook 归 Lab）

浏览器读错题：网关已把 `/api/wrong-book/**` 转到 Lab。  
Homework 的 `POST /homework/:id/wrong-book` 目前 **501**，等本接口后改为内部写入。

```http
PUT /internal/wrong-book/entries
Idempotency-Key: homework:{homeworkId}:{userId}:{pointName}
x-internal-service-token: …
```

```json
{
  "userId": "uuid",
  "courseId": "uuid",
  "sourceType": "HOMEWORK",
  "sourceId": "homework-uuid",
  "title": "作业标题 · 知识点名",
  "content": "证据或摘要"
}
```

```http
DELETE /internal/wrong-book/entries/HOMEWORK/{homeworkId}
```

同一 Key 更新不重复插入。失败时 C 入队重试，不回滚作业提交。B 未齐之前 C 保持 501。

---

## 4. 网关公开路由（给 A / B / E）

进程：`api-gateway` `:3081`。外部 `/api`，转下游时去掉 `/api`。`/internal/**` 不对浏览器开放。

| 外部路径 | 下游 |
| --- | --- |
| `/api/homework/**`、`/api/grades/**` | homework `:3002` |
| `/api/courses/:id/homework/**`、`/grading-config/**`、`/gradebook` | homework `:3002`（优先于 `/api/courses/**`） |
| `/api/auth/**`、`/api/enrollment/**`、`/api/announcements/**`、`/api/notifications/**`、`/api/materials/**`、`/api/admin/**`、`/api/dashboard/**`、其余 `/api/courses/**` | course `:3001` |
| `/api/lab-sets/**`、`/api/labs/**`、`/api/submissions/**`、`/api/testcases/**`、`/api/practice/**`、`/api/wrong-book/**`、`/api/discussion-attachments/**`、`/api/courses/:id/practice\|discussions/**` | lab `:3003` |
| 未匹配的 `/api/**` | 单体 `backend:3000`（回退） |

下游挂了：网关 **502** `{ code: "BAD_GATEWAY", message, requestId }`。  
开发：Vite `proxy /api` → `http://127.0.0.1:3081`。

---

## 5. 请 A / B 回复的问题

1. **A**：名单冻结为 `items` 分页即可（C 已兼容 `students`）。通知幂等是否只认 `Idempotency-Key` 头？  
2. **A**：本地 `INTERNAL_SERVICE_TOKEN` 最终用代码默认值，还是 `.env.example` 的 `replace-with-service-token`？三服务必须同一字符串。  
3. **B**：成绩用 `GET …/lab-gradebook`，还是只提供 `lab-grades:batch`？端口是否 `3003`？  
4. **B**：错题 `PUT` 哪天可调？未到之前 C 保持 501。  
5. **A**：Dashboard 是否从 9/2 起改调本文 §2 的 `homework-summary` / `final-gradebook`？C 已可联调。

回复位置：群里直接答上述问题，或在本目录追加评论。C 按书面结果只改 `course-client.ts` / `lab-client.ts` 的「切真接口」部分。
