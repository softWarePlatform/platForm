# C 侧故障演示：Gateway → Homework → Lab

- 日期：2026-09-02（D8）
- 对应：W1-3（步骤与今日证据）；W1-8 要等 B 的 `:3003` 起来后再录「真链再掐断」
- 身份：Homework + Integration Owner
- 自动化：`api-gateway` 目录 `npm run test:api`

## 1. 要证明什么

Lab 挂了时：

1. **网关**把打到实验的请求变成 **502** `{ code: "BAD_GATEWAY", message, requestId }`，浏览器拿得到 `X-Request-ID`。
2. **作业服务不崩**：成绩册仍 **200**，`labStatus=UNAVAILABLE`，`totalScore=null`，实验分不当 0，只给 `provisionalTotal`。

调用链：

```text
浏览器 / 冒烟
  → API Gateway :3081
      → Course :3001     登录、选课
      → Homework :3002   作业、gradebook（内部再调 Lab，失败则降级）
      → Lab :3003        今日未起 → 网关 502
```

## 2. 今日环境（Lab 本来就没起，等价于「停 Lab」）

| 进程 | 端口 | 今日 |
| --- | --- | --- |
| api-gateway | 3081 | 在跑 |
| course-service | 3001 | 在跑 |
| homework-grade-service | 3002 | 在跑 |
| lab-practice-service | 3003 | **未起** |

B 把 Lab 拉起来之后，演示改成：先跑一遍 200，再停 `:3003`，再跑本节第 3 步。不要把空成绩当 0。

## 3. 手工步骤（答辩可照读）

本机若开了 HTTP 代理（Clash 等），curl 请加 `--noproxy '*'`，否则 `localhost` 可能被代理成 502/超时。

```bash
# 0) 确认网关活着
curl.exe --noproxy "*" http://127.0.0.1:3081/health/live

# 1) Lab 不可用：网关必须 502，且带 requestId
curl.exe --noproxy "*" -s -D - http://127.0.0.1:3081/api/labs ^
  -H "x-request-id: demo-lab-down"

# 期望：
# HTTP/1.1 502
# x-request-id: demo-lab-down
# { "code": "BAD_GATEWAY", "message": "lab 服务暂时不可用", "requestId": "demo-lab-down" }

# 2) 登录教师（走 Course）
# POST /api/auth/login
# { "email": "teacher@course.local", "password": "Course123456" }

# 3) 作业成绩册仍 200，且降级（走 Homework，Homework 再调 Lab 失败）
# GET /api/courses/{courseId}/gradebook
# Authorization: Bearer <teacher-token>
# 期望：200，labStatus=UNAVAILABLE，students[].summary.totalScore=null
```

读错题本走网关 `/api/wrong-book/**` → Lab，Lab 挂了同样是 **502**，不是作业的 404。作业写入错题是 `POST /api/homework/:id/wrong-book` → Homework → Lab PUT，失败只记日志，不回滚提交。

## 4. 今日自动证据

2026-09-02 在 Lab 未起时执行 `api-gateway` 的 `npm run test:api`：

- `GET /api/labs` → **502** `BAD_GATEWAY`，`requestId=gw-lab-down`（`X-Request-ID` 与 body 一致）
- `GET /api/wrong-book/mine` → **502** `BAD_GATEWAY`（读错题归 Lab）
- UC05 经网关：登录 → 创建/发布/提交/批改/发布成绩 → `GET /api/courses/:id/gradebook` **200** 且 `labStatus=UNAVAILABLE`

原始输出：`docs/吴本昭/2026-09-02/raw/gateway-smoke.log`

## 5. 不要讲错的点

- 网关 502 是 **连不上 Lab**，不是作业崩了。
- 成绩册 200 + `UNAVAILABLE` 是 **Homework 的降级设计**，不是「实验 0 分」。
- `/internal/**` 不对浏览器开放；总评内部接口继续服务间直连，不经网关。
