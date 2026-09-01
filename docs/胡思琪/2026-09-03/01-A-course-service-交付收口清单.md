# A 任务清单：course-service 交付收口

- 日期：2026-09-03
- 范围：A 的独立服务交付、容器/基础 K8s 配置、数据一致性与答辩材料。

## 今日目标

将 `course-service` 收口为可构建、可测试、可容器化和可部署的服务，并提供给 D、E、C 的准确交付材料。D 负责统一 K8s/CI/CD 集成；A 负责本服务配置正确、可被集成。

## 任务清单

- [x] 完成 `course-service` Dockerfile：锁文件安装、构建、生产运行、非 root 用户和生产依赖裁剪。
- [x] 容器内验证 `/health/live`、`/health/ready`；数据库、上传目录与上游地址均可由环境变量配置。
- [x] 提供基础 Kubernetes `Deployment`、`Service` 及 ConfigMap 示例：端口、配置/Secret 引用、资源请求/限制、存活/就绪探针。未越界实现 HPA、网关或 CI/CD。
- [x] 验证迁移、seed、公开接口和内部接口的启动顺序；服务启动不会调用 seed 或清库。
- [x] 完成选课容量/冲突、公告已读、资料收藏、通知幂等与管理审计的 API 一致性检查；候补递补逻辑已保留并在源代码中事务化。
- [x] 完成 Unit、API 与契约测试总运行；环境、命令和结果见验收记录。
- [x] 输出 A 的交付说明、依赖决策和答辩素材。
- [x] 提供课程服务架构、数据归属与 UC01 代表用例的可复现结果链接。

## 完成标准与证据

1. `course-service` 能单独 build、run、test，并在容器中通过存活/就绪检查。
2. 数据迁移和演示初始化可在空环境复现；日常重启不清库。
3. Dockerfile、基础 Deployment、基础 Service 与配置清单可交给 D 直接纳入统一部署。
4. E 可按交付说明运行 A 的 API/契约测试；C 可按接口文档接入 Gateway；所有未完成跨服务项均有负责人和复现信息。

## 当日交付清单

- [x] `course-service/` 源码、测试和环境样例
- [x] 课程域 Prisma Schema、迁移、seed 说明
- [x] Dockerfile、基础 K8s Deployment/Service
- [x] API/内部接口文档与契约测试结果
- [x] 数据归属与一致性检查记录
- [x] A 的架构图、代表用例证据和答辩说明
