# 2026-08-25 课程域验证材料

负责人：李璐曼  
验证范围：UC01—UC04、课程域数据表  
执行日期：2026-08-25

## 文件目录

| 文件 | 内容 |
| --- | --- |
| [01-UC01-UC04验证记录.md](./01-UC01-UC04验证记录.md) | 主流程、异常流程、运行结果和验收结论 |
| [02-课程域数据表清单.md](./02-课程域数据表清单.md) | 课程域表、字段、约束、关系和数据归属 |
| [03-缺陷记录.md](./03-缺陷记录.md) | 本次复现的课程创建缺陷及修复建议 |
| [uc01-uc04-verify.mjs](./uc01-uc04-verify.mjs) | 可重复执行的 API 验证脚本，自动清理测试数据 |
| [evidence/uc01-uc04-api-results.json](./evidence/uc01-uc04-api-results.json) | 本次所有请求、断言、结果和清理记录 |
| [evidence/course-domain-table-counts.json](./evidence/course-domain-table-counts.json) | 数据表计数及数据库枚举实测结果 |

## 本次结论

- 共执行 23 项检查：22 项通过，1 项失败。
- UC01：6/6 通过。
- UC02：5/6 通过；“教师创建课程”失败，因此 UC02 整体不能判定通过。
- UC03：5/5 通过。
- UC04：6/6 通过。
- 发现 1 个阻塞 UC02 完整主流程的缺陷：数据库枚举缺少 `COURSE_CREATE`，导致创建接口返回 HTTP 500，但课程已经写入数据库。
- 临时课程、选课、候补、公告、资料文件、收藏和相关通知均已清理。

## 复测命令

在仓库根目录、后端 API 和 PostgreSQL 已启动的前提下执行：

```powershell
node "docs\李璐曼\2026-8-25\uc01-uc04-verify.mjs"
```

脚本会覆盖 `evidence` 目录中的两份 JSON 证据文件。
