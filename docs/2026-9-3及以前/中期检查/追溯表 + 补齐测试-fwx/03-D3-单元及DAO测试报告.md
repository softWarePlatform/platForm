# D3 单元测试与 DAO 测试报告

> 执行日期：2026-08-27  
> 最终命令：`npm run test:unit`、`npm run test:dao`

## 单元测试

| 套件 | 用例 | 测试数 | 结果 |
|---|---|---:|---|
| `schedule-slots.test.ts` | UC-01、UC-02 | 5 | 5 通过 |
| `announcements.test.ts` | UC-03 | 4 | 4 通过 |
| `course-materials.test.ts` | UC-04 | 6 | 6 通过 |
| `homework-settings.test.ts` | UC-05 | 6 | 6 通过 |
| `lab-set-status.test.ts` | UC-06 | 6 | 6 通过 |
| `practice-grade.test.ts` | UC-07 | 5 | 5 通过 |
| `notification-events.test.ts` | UC-08 | 3 | 3 通过 |
| `lab-grades.test.ts` | UC-09 | 4 | 4 通过 |
| `enrollment-labels.test.ts` | UC-10 | 4 | 4 通过 |
| **合计** | **UC-01～UC-10** | **43** | **43 通过，0 失败** |

## DAO / Prisma 集成测试

| 编号 | 关键方法与约束 | 结果 |
|---|---|---|
| DAO-01 | `$transaction`、`create`、复合键 `findUnique`、关系 include | 通过 |
| DAO-02 | 公告已读 `upsert`、复合唯一约束、关联读取 | 通过 |
| DAO-03 | 下载计数原子 `increment`、收藏 `upsert` 去重 | 通过 |
| DAO-04 | 讨论帖嵌套创建、关联查询、外键级联删除 | 通过 |
| **合计** | **4 条** | **4 通过，0 失败** |

DAO 测试文件：`backend/tests/integration/prisma-dao.test.ts`。测试连接本地 PostgreSQL，使用随机数据并自动清理。
