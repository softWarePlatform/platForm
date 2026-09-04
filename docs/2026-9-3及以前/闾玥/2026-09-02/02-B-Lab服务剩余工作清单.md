# B：Lab Service 剩余工作清单

## 1. 当前基线

- 工作分支：`b/lab-service-integration`；
- 安全备份分支：`backup/b-lab-service-8bf78d9`；
- 本地最新提交：`e942dd9 feat: align lab service contracts and deployment`；
- 本地相对当前已知的 `origin/main` 领先 2 个提交，工作区干净；
- Backend Unit 151/151、Lab 11/11、Judge Worker 测试及各模块构建均已通过；
- Kubernetes、Docker Compose 和部署脚本静态检查已通过；
- 尚未推送：本机访问 GitHub 时出现 `SEC_E_UNTRUSTED_ROOT`，属于 TLS 根证书链问题。

## 2. 剩余事项及验收标准

| 优先级 | 任务 | 当前状态 | 依赖/协作 | 完成标准 |
| --- | --- | --- | --- | --- |
| P0 | 推送 B 集成分支并创建 PR | 阻塞 | 本机 GitHub TLS 证书、代码评审人 | `b/lab-service-integration` 推送成功；PR 基线为最新 `main`；CI 全绿；禁止强推或直接覆盖 `main` |
| P1 | 冻结 Lab 数据边界 | 待确认 | A、C、D | 书面确定独立 database、独立 PostgreSQL schema 或同库方案；明确迁移、回滚和数据所有权 |
| P2 | 迁出 UC06—UC08 领域代码 | 未完成 | A 确认公共能力边界 | Lab 不再从 `backend/src` 导入业务路由、服务或 Prisma；独立 build/test 可运行 |
| P3 | 建立 Lab 独立 Prisma Schema 和数据访问层 | 未完成 | P1 | Lab 拥有独立 schema、migration、client 和 seed；`User/Course` 仅保存外部标识，不建立跨服务外键 |
| P4 | 消除跨服务直接查表 | 部分完成 | C 的 Course Service | 课程、学生名单和选课关系全部通过 Course 内部 API 获取；超时、401、404、503 有明确处理 |
| P5 | 完成 K8s 实际部署验证 | 配置完成，实跑待做 | D、可用镜像仓库、Course Service | Lab Deployment/Service 就绪；三类探针通过；资源限制生效；Pod 内可访问 Course、Redis、PostgreSQL |
| P6 | 跑通 CI/CD | 配置完成，实跑待做 | 仓库管理员、D | `production` 增加 `INTERNAL_SERVICE_TOKEN`；Lab 测试失败时阻断构建和部署；镜像进入 GHCR；rollout 成功 |
| P7 | 与 C 联调成绩和错题接口 | 契约完成，联调待做 | C | 正式接口逐项通过；成绩不可用返回 `UNAVAILABLE/null`；错题 PUT 幂等；DELETE 可重复执行 |
| P8 | 补集成与端到端测试 | 部分完成 | C、D、E | 覆盖 UC06—UC08 主流程、备选流程、异常流程；覆盖数据库、Redis、Worker 停止/恢复和接口超时 |
| P9 | 完善答辩材料 | 部分完成 | E | 增补独立服务架构图、Judge 调用链、部署截图、CI 报告和故障恢复证据 |

## 3. 各剩余事项详细内容

### P0：推送分支并安全合入远端

目标是把已经验证的本地工作提交到独立分支，通过 PR 合入，不直接修改或强推共享 `main`。

具体工作：

1. 修复 Windows/Git/Docker 使用的根证书链，确认可以访问 GitHub 和 Docker Hub；
2. 执行 `git fetch origin --prune`，检查远端 `main` 是否在本次失败后产生新提交；
3. 使用 `git log --left-right --graph origin/main...HEAD` 检查双方差异；
4. 如果修改文件没有重叠，优先将最新 `origin/main` 合入当前分支；如有冲突，逐文件确认语义，不能仅选择
   “ours”或“theirs”；
5. 重新执行构建和测试，再推送 `b/lab-service-integration`；
6. 创建 PR，请 A/C/D 检查数据边界、内部 API 和部署配置；
7. 等待必需检查全部通过后再合入，保留 `backup/b-lab-service-8bf78d9` 到 PR 合入完成。

交付物：远端功能分支、PR、冲突处理记录和 CI 链接。验收要求是 PR 可合并、无未解决冲突、没有覆盖
组员提交，并且 `main` 仅通过 PR 更新。

### P1：冻结 Lab 数据边界

该事项决定后续 Prisma Schema 和迁移方式，编码前必须由 A/B/C/D 共同确认。

需要确认：

- Lab 拥有独立 PostgreSQL database、独立 schema，还是暂时同库但由独立 Prisma Schema 管理；
- `Lab`、`Practice`、`Discussion`、实验提交、测试用例及相关成绩分别归哪个服务所有；
- `User`、`Course`、`Enrollment` 只保存外部 ID，还是保留本地只读快照；
- 原 `backend` 中历史数据的迁移时间、双写期、切换点和失败回滚方式；
- 数据库凭据、migration 执行者、备份保留时间和生产发布顺序。

推荐边界：Lab 只拥有实验与练习领域数据；用户、课程和选课关系由 Course/User 服务拥有。Lab 仅保存
`userId`、`courseId` 等外部标识，不建立跨服务数据库外键，业务有效性通过内部 API 校验。

交付物：一页数据所有权表、最终方案、迁移步骤和回滚步骤。未冻结前不得删除旧表或执行生产迁移。

### P2：迁出 UC06—UC08 路由和领域代码

当前 Lab 虽可独立启动，但仍复用 `backend/src` 中的路由、服务和 Prisma，因此尚未形成真正独立服务。

具体工作：

1. 列出 `lab-practice-service/src` 对 `../../backend/src` 和 `../../backend/prisma` 的全部导入；
2. 按 UC06 实验、UC07 练习、UC08 讨论三个领域迁移 controller/router、service、validation、错误处理；
3. 将 Lab 需要的共享类型改为本服务内部类型，或放入双方认可的纯类型共享包；
4. 不复制 JWT 密钥、数据库连接等运行期单例，全部通过 Lab 自己的配置模块创建；
5. 将旧 backend 路由改成 Gateway 转发或兼容层，确认调用方迁移后再删除旧实现；
6. 删除 Lab 对 backend 源码的 TypeScript 编译依赖，验证只复制 Lab 目录及必要共享包也能安装、构建和测试。

交付物：独立源码目录、依赖清单、旧路由迁移说明。验收时搜索 Lab 源码，不得再出现对
`backend/src` 或 `backend/prisma` 的运行期导入。

### P3：建立独立 Prisma Schema 和数据访问层

在 P1 确认数据边界后，为 Lab 创建自己的 Prisma Client，避免通过 backend Client 直接操作共享表。

具体工作：

1. 在 Lab 内建立 `prisma/schema.prisma` 和迁移目录；
2. 只保留 Lab 所有的模型，通过标量 `userId`、`courseId` 关联外部对象；
3. 建立 Lab 自己的 Prisma Client 生命周期管理、repository/data-access 层和测试替身；
4. 制作历史数据迁移脚本，迁移前统计记录数，迁移后按表核对数量和关键字段；
5. 准备回滚脚本或恢复步骤，切换失败时允许旧 backend 继续提供服务；
6. 在 CI 中增加 `prisma validate`、Client 生成和 migration 检查；
7. 在集成测试中使用隔离的测试数据库，测试结束后清理本用例产生的数据。

交付物：Schema、migration、Client、数据访问层、迁移核对报告和回滚说明。验收要求 Lab 不再使用
backend Prisma Client，迁移可在空库和带历史数据的测试库各成功执行一次。

### P4：以 Course 内部 API 替代跨服务查表

实验成绩册已经开始调用 Course 名单接口，但其他课程、成员和权限判断仍需全面排查。

具体工作：

1. 搜索所有直接读取 `Course`、`Enrollment`、`User` 的代码路径；
2. 将课程存在性、学生名单、选课状态等查询统一封装在 `course-client`；
3. 每次内部调用携带 `x-internal-service-token` 和 `x-request-id`；
4. 配置连接和响应超时，限制重试次数，避免 Course 故障拖垮 Lab；
5. 区分 401、404、429、超时和 5xx，并转成稳定的 Lab 错误体；
6. 成绩数据不可用时返回 `UNAVAILABLE/null`，禁止把缺失成绩当作 0 分；
7. 对只读且变化较慢的数据可增加短期缓存，但必须定义 TTL、失效方式和故障时行为。

交付物：统一 Course Client、错误映射表、调用链测试。验收要求停止 Course Service 后，Lab 健康接口
仍可响应，依赖 Course 的接口快速返回明确的 503，而不是挂起或读取对方数据库。

### P5：完成 Kubernetes 实际部署验证

资源清单已存在，但当前只完成静态渲染，尚未证明镜像能在真实集群启动并完成服务间调用。

具体工作：

1. 确认 Course Service 已被同一套 Kustomize 部署，并冻结集群内 Service DNS 和端口；
2. 构建并推送 Lab 镜像，更新 Deployment 使用的不可变 commit SHA 标签；
3. 检查 ConfigMap、Secret、PVC、PostgreSQL、Redis 和 imagePullSecret 是否齐全；
4. 执行部署，观察 startup、readiness、liveness probe 和 rollout；
5. 检查 requests/limits、重启次数、事件、日志和 Service Endpoint；
6. 从集群内部调用 Course、Redis、PostgreSQL，再通过 Gateway 调用 Lab 公共接口；
7. 主动使用错误 token、停止 Worker/Redis/Course，确认 Pod 状态和错误返回符合预期。

交付物：`kubectl get pods/services/endpoints`、rollout、探针、资源和调用结果截图或文本记录。验收要求
Deployment 可滚动更新，Pod Ready，Gateway 可访问 Lab，依赖恢复后无需人工修改数据即可继续工作。

### P6：把 Lab 完整接入 CI/CD

流水线文件已经加入 Lab 安装、测试、镜像和部署入口，仍需在 GitHub 上真实运行并校验阻断行为。

具体工作：

1. 在 `production` Environment 新增 `INTERNAL_SERVICE_TOKEN`，相关服务使用相同值；
2. 确认 Actions 的 `GITHUB_TOKEN` 具有 Packages 写权限，自托管 Runner 在线且标签匹配；
3. 验证 Lab 使用自己的 lockfile 执行 `npm ci`、build、test；
4. 确认测试 job 是镜像发布和部署 job 的前置依赖；
5. 验证 GHCR 镜像名称、可见性、拉取凭据和 commit SHA 标签；
6. 验证部署脚本正确替换 Lab 镜像，占位符没有进入集群；
7. 临时在测试分支制造一个必然失败的断言，确认流水线停止在测试阶段，再撤销该验证提交；
8. 保存一次成功和一次被测试阻断的 Actions 报告。

交付物：Actions 运行链接、镜像链接、部署记录和阻断证据。验收要求任何 Lab 测试失败时均不执行
镜像发布或 Kubernetes 部署。

### P7：与 C 联调实验成绩和错题接口

接口名称和基础语义已冻结，仍需双方针对真实请求、错误和幂等行为完成联调。

需要逐项验证：

- `GET /internal/courses/:courseId/lab-gradebook` 返回全班名单、实验状态和可空成绩；
- `POST /internal/courses/:courseId/lab-grades:batch` 正确处理空数组、重复 ID、未知学生和部分缺失成绩；
- `PUT /internal/wrong-book/entries` 强制要求 `Idempotency-Key`，相同 key 重试不产生重复记录；
- `DELETE /internal/wrong-book/entries/HOMEWORK/:homeworkId` 首次和重复删除都返回双方约定结果；
- token 缺失/错误、requestId 传递、请求体错误、服务不可用和超时的响应一致；
- C 在 Lab 不可用时不得把实验成绩记为 0，不得阻塞其他成绩域展示。

交付物：请求/响应样例、双方版本号、联调记录和失败用例。验收要求 C 的调用方测试与 B 的提供方
契约测试使用同一组样例并全部通过。

### P8：补齐 UC06—UC08 集成和端到端测试

现有测试覆盖基础规则和内部接口，但不能替代数据库、Redis、Worker、Gateway 及页面组成的完整流程。

最低业务场景：

- UC06：教师创建/发布实验，学生查看实验、提交代码，Worker 判题并回写状态与结果；
- UC06 异常：未登录、无课程权限、实验未发布、过期提交、非法语言、重复提交、Worker 停止与恢复；
- UC07：学生获取练习、提交答案、查看反馈和错题；
- UC07 异常：练习不存在、答案格式错误、重复请求、Redis 不可用；
- UC08：创建讨论、查看列表和详情、回复讨论；
- UC08 异常：无权限、内容为空、目标不存在、重复提交；
- 跨服务：Course 超时/503、内部 token 错误、成绩部分缺失、错题幂等写入和删除；
- 端到端：从 Gateway 或页面入口完成登录、进入课程、提交实验、等待判题、查看成绩/错题的完整链路。

每个用例必须包含输入、前置数据、操作、明确断言和清理步骤。测试报告应写明总数、通过数、失败数、
失败原因、提交 SHA、操作系统、Node、数据库、Redis、浏览器和 Kubernetes 版本。覆盖率可附加，但不能
替代业务场景清单。

### P9：完善架构和答辩材料

具体工作：

1. 绘制 Gateway、Lab、Course、PostgreSQL、Redis、Judge Worker、GHCR 和 Kubernetes 的部署关系图；
2. 绘制从学生提交代码到 Redis 入队、Worker 判题、数据库回写、前端查询的时序图；
3. 标注服务数据所有权、内部 API、鉴权头、超时、重试和不可用降级策略；
4. 整理 Worker 停止、任务保持 PENDING、Worker 恢复、积压任务完成的故障实验；
5. 补充 CI 失败阻断、镜像发布、Kubernetes rollout、探针和资源限制证据；
6. 准备答辩问题：为什么要拆服务、如何避免跨库耦合、如何保证幂等、如何避免成绩误算为 0、Worker
   故障为什么不会丢任务、部署失败如何回滚。

交付物：架构图、时序图、故障实验报告、测试报告、部署证据和 3—5 分钟讲解提纲。

## 4. 建议执行顺序

1. 修复本机/校园代理的 GitHub 与 Docker TLS 根证书链，推送当前分支并创建 PR。
2. 与 A/C/D 冻结 Lab 数据边界和 Course Service 的 Kubernetes 服务名、端口及部署归属。
3. 从 `backend/src` 迁出 UC06—UC08，建立独立 Prisma Schema、migration 和数据访问层。
4. 用 Course 内部 API 替换剩余跨服务查表，并完成与 C 的契约联调。
5. 在 `production` Environment 新增 `INTERNAL_SERVICE_TOKEN`，其值由相关内部服务共享，禁止写入仓库。
6. 由 D 触发 CI/CD，验证 Lab 镜像发布、Kubernetes rollout、探针和服务间网络。
7. 由 B/C/E 共同完成集成、E2E、故障注入及报告归档。

## 5. 下午对齐会议必须确认

1. Lab 数据库采用哪种隔离方式，历史数据由谁迁移、失败时如何回滚；
2. Course Service 是否纳入当前 Kustomize 部署，以及集群内稳定 DNS 名称；
3. C 是否按已冻结的四个正式接口联调，旧接口何时删除；
4. `INTERNAL_SERVICE_TOKEN` 由谁生成和维护，哪些服务使用同一值；
5. D 何时运行部署流水线，B/C/E 分别提供哪些验收证据；
6. PR 合入顺序：基础部署/接口契约先合入，C 的调用方随后合入，最后执行端到端验证。

## 6. 当前阻塞与处理原则

### GitHub/Docker TLS

当前 Git 推送报错为 `schannel: SEC_E_UNTRUSTED_ROOT`，Docker 拉取基础镜像也出现证书不受信任。
应由系统或网络管理员安装正确的代理根证书，或切换至可信网络验证。不得通过关闭 Git SSL 校验或跳过
Docker TLS 校验绕过。

证书恢复后执行：

```powershell
git fetch origin --prune
git status --short --branch
git push --set-upstream origin b/lab-service-integration
```

若 `origin/main` 已前进，先检查提交差异和冲突，再决定 rebase 或 merge；不得对共享分支强推。

## 7. 最终完成定义

B 的任务只有在以下条件全部满足时才能标记完成：Lab 是不依赖 `backend/src` 的独立服务；拥有独立
数据访问层；跨服务数据只走内部 API；CI 测试失败会阻断镜像和部署；Kubernetes 实际部署通过；
UC06—UC08 业务与异常场景通过；与 C 的接口完成联调；测试报告和答辩证据已归档。
