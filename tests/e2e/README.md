# End-to-end tests

本目录存放从用户入口完成整个业务目标并验证最终状态的端到端测试。

执行 `npm run test:e2e` 可运行 UC01—UC10 共 10 条场景，按 `E2E-<用例号>-<序号>` 编号。默认访问 `http://127.0.0.1:3000`，可通过 `E2E_BASE_URL`、`E2E_ENVIRONMENT` 和 `E2E_REPORT_PATH` 覆盖环境与报告路径。
