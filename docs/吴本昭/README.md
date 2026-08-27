# 吴本昭 · 实验练习域交付目录

负责人：吴本昭  
范围：UC06 实验评测、UC07 练习、UC08 讨论通知

按日查阅，不要复制粘贴跨日文档。D1 的缺口与验证命令已并入 D3。

| 日期 | 阶段 | 目录 | 当日交付 |
| --- | --- | --- | --- |
| 2026-08-25 | D1 基线验证 | [2026-8-25](./2026-8-25/) | Redis/Worker 启动；UC06—UC08 首次跑通；域表接口清单 |
| 2026-08-26 | D2 需求说明 | [2026-8-26](./2026-8-26/) | 三份用例说明 + 每用例系统级/组件级/对象级图 |
| 2026-08-27 | D3 自动回归 | [2026-8-27](./2026-8-27/) | `npm run test:lab` / `test:lab:unit`；缺口关闭记录 |

## 现在怎么跑（以 D3 为准）

```powershell
npm run test:lab:unit
npm run test:lab
```

依赖：PostgreSQL、Redis、`backend` API `:3000`、`judge-worker`。只测 JavaScript。不要跑 `scripts/step5-api-test.mjs`（会关选课窗）。

最新回归证据：`2026-8-27/raw/lab-regression.json`（34/34，连续两次通过）。


## 全部产出目录


总目录：`docs/吴本昭/README.md`

---

### D1（8.25）`docs/吴本昭/2026-8-25/`

| 文件 | 内容 |
| --- | --- |
| `00-D1-工作区阅读与任务拆解.md` | 任务拆解 |
| `01-D1-Redis与Worker启动记录.md` | Redis / Worker 启动 |
| `02-D1-UC06-UC08验证记录.md` | 当日验证快照（现已指向 D3 回归） |
| `03-D1-现有测试脚本检查与缺口清单.md` | D1 盘点；缺口表已并入 D3 |
| `04-D1-当日工作简报.md` | 站会简报 |
| `05-D1-实验练习域表与外部接口清单.md` | 15 张表、接口边界 |
| `raw/uc06-uc08-verify.json` | D1 原始结果 |

### D2（8.26）`docs/吴本昭/2026-8-26/`

| 文件 | 内容 |
| --- | --- |
| `README.md` | 当日目录 |
| `01-UC06-用例说明.md` | 评测 / 失败 / 补交 |
| `02-UC07-用例说明.md` | 组卷 / 错题 / 辅导 |
| `03-UC08-用例说明.md` | 讨论 / 通知 |
| `figures/UC06/` `UC07/` `UC08/` | 各 3 张图（系统级、组件级、对象级），共 9 张 |

### D3（8.27）文档 + 脚本

| 位置 | 内容 |
| --- | --- |
| `docs/吴本昭/2026-8-27/README.md` | 回归记录、覆盖对照、缺口关闭 |
| `docs/吴本昭/2026-8-27/raw/lab-regression.json` | 最近一次 34/34 原始证据 |
| `scripts/lab-regression.mjs` | 主回归 |
| `scripts/d1-uc06-uc08-verify.mjs` | 转发到主脚本 |
| `scripts/retest-lab-submit.mjs` | 仅 JS Hello，失败非零 |
| `backend/src/lib/lab-set-status.test.ts` | 实验状态单测 |
| `judge-worker/src/runner.test.ts` | Worker 单测 |
| 根目录 `package.json` | `test:lab`、`test:lab:unit` |

复跑：先起 API、Redis、Worker，再执行 `npm run test:lab:unit` 和 `npm run test:lab`。