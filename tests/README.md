# 测试目录说明

| 层级 | 目录 | 当前入口 | 依赖环境 |
| --- | --- | --- | --- |
| Unit | `backend/tests/unit/` | `npm run test:unit` | Node.js，无数据库；45 条 |
| Integration / DAO | `backend/tests/integration/` | `npm run test:dao` | 已迁移的 PostgreSQL；4 条，随机数据并自动清理 |
| API | `tests/api/api-use-cases.test.mjs` | `npm run test:api` | 已启动的 API 与演示 fixture；15 条并生成 JSON 报告 |
| E2E | `tests/e2e/` | `npm run test:e2e` | 已启动的 API、数据库与演示 fixture；10 条，覆盖 UC01—UC10 |

根目录 `npm test` 依次执行 Unit、DAO、API 和 E2E 测试，共 74 条；任一层失败都会返回非零退出码。API 报告输出到 `test-results/api-use-cases.json`，E2E 报告输出到 `test-results/e2e-local.json`。

命名规则见 `docs/范文歆/2026-8-26/00-D2-编号规范与测试框架.md`，2026-08-27 执行证据见 `docs/范文歆/2026-8-27/`。
