# End-to-end tests

本目录存放从用户入口完成整个业务目标并验证最终状态的端到端测试。

执行 `npm run test:e2e` 可运行 UC01—UC10 共 10 条场景，按 `E2E-<用例号>-<序号>` 编号。默认访问 `http://127.0.0.1:3000`，可通过 `E2E_BASE_URL`、`E2E_ENVIRONMENT` 和 `E2E_REPORT_PATH` 覆盖环境与报告路径。

微服务版本使用 `npm run test:e2e:microservices`，覆盖真实的 Gateway → Course/Homework/Lab 调用链，并按 `E2E-MS-01` 至 `E2E-MS-10` 编号。默认使用仓库 `course-service/prisma/seed.ts` 提供的隔离验收账号；可通过 `E2E_*_EMAIL`、`E2E_PASSWORD` 和 `E2E_COURSE_ID` 覆盖。运行前必须先在目标 `course_service` 数据库执行迁移与测试种子，禁止对生产库执行测试种子。
