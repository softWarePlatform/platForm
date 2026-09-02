# B：C 分支合并与 Lab 联调记录

## 1. 合并结论

- 来源分支：`origin/feat/c-d8-homework-gateway`；
- 目标分支：`b/lab-service-integration`；
- 合并方式：保留 merge commit，不直接修改 `main`；
- 合并预演：无文本冲突；
- 合并提交：`8707260 merge: integrate C homework and gateway branch`；
- C 的 Homework、API Gateway、Kubernetes 基础清单、测试和 D8 文档均已保留。

## 2. B 与 C 的契约核对

以下约定一致：

- Course `:3001`、Homework `:3002`、Lab `:3003`、Gateway `:3081`；
- 内部鉴权头为 `x-internal-service-token`；
- `GET /internal/courses/:courseId/lab-gradebook`；
- 兼容回退 `POST /internal/courses/:courseId/lab-grades:batch`；
- 错题写入使用 PUT 和 `Idempotency-Key`，删除使用 HOMEWORK 来源路径；
- Lab 缺失或不可用时返回 `null/UNAVAILABLE`，不得当作 0 分。

## 3. 联调发现和修复

首次真实调用中，Course 和 Lab 的 readiness 均为 200，但合法 token 请求 `lab-gradebook` 返回 503。
日志表明 Course 名单接口返回 400。根因是 B 请求 `pageSize=500`，而 A 冻结的名单接口最大只允许
`pageSize=200`。

修复内容：

1. Lab Course Client 改为每页 200；
2. 根据 Course 返回的 `total` 自动翻页；
3. 最多收集 500 个唯一学生 ID；
4. 新增分页回归测试，验证会请求第 1、2 页且始终使用 `pageSize=200`。

## 4. 真实运行结果

运行环境：Windows、Node.js 24.16.0、Docker Desktop PostgreSQL 16、Redis 7。

- Course `/health/ready`：200；
- Lab `/health/ready`：200；
- 合法内部 token 请求 Lab gradebook：200；
- 错误或缺失 token：401 `INTERNAL_UNAUTHORIZED`；
- Course 真实名单含一名学生时，Lab 返回该学生且 `labAverage=null`，没有误算成 0；
- Lab 单元/契约测试：12/12 通过；
- API Gateway 单元测试：4/4 通过；
- Homework 首轮测试：22 项通过，1 项在 Prisma Client 生成前失败；Client 生成后仍受本机偶发
  `uv_os_get_passwd ENOMEM` 影响，需在 CI 或释放内存后重跑。

成绩册响应摘要：

```json
{
  "courseId": "46332075-f376-42b4-ac13-16c91d102c68",
  "labStatus": "OK",
  "labAverage": null,
  "students": [
    {
      "userId": "a299a4cd-d002-4b80-83e3-68560a087b41",
      "labAverage": null
    }
  ]
}
```

## 5. 本轮本地数据准备

在现有 PostgreSQL 实例中创建了两个独立的本地联调数据库：`course_service` 和
`homework_grade_service`，未修改或删除原 `teaching_platform` 数据库。两个库的 migration 均已成功；
Course seed 成功，Homework seed 因 Windows `ENOMEM` 尚未完成。

## 6. 尚未完成

1. 启动 Homework 与 Gateway，完成经 `:3081` 的 Lab 正常链路；
2. 先验证 Lab 正常，再停止 Lab，保存 Gateway 502 和成绩册降级证据，随后恢复 Lab；
3. 在资源充足环境重跑 Homework 全部测试和 seed；
4. D 将 Course、Homework、Lab、Gateway 镜像与 YAML 纳入同一集群并验证 Service DNS；
5. B 提交 PPT 第 07—08 页：Lab/Judge 架构、正常结果与故障恢复截图；
6. PR 必须等待 CI 全绿后才可合入 `main`。
