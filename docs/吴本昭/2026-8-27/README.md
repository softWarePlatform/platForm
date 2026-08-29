# D3 实验练习域回归（2026-08-27）

- 负责人：吴本昭
- 对应任务：补实验状态、代码提交、评测 Worker、练习和讨论测试；整理现有脚本
- 验收：UC06—UC08 可自动回归，脚本可重复执行

## 昨天 / 今天

| 日 | 完成 |
| --- | --- |
| D2 8月26日 | UC06—UC08 用例说明；九张三层图已按类别归档到 `docs/吴本昭/2026-8-28/figures/` |
| D3 8月27日 | 单测入口、`npm run test:lab` 回归 34/34，连续跑两次均通过；缺口状态并入本文，不再另写一份清单 |

无代码功能阻塞。Python 评测仍不作为必过（Windows 无 `python3`）。

## 命令

```powershell
npm run test:lab:unit    # 实验状态机 + Worker normalizeOutput / JS runCode
npm run test:lab         # UC06—UC08 API 回归（需 API + Redis + Worker）
```

- 主脚本：`scripts/lab-regression.mjs`
- D1 旧命令 `node scripts/d1-uc06-uc08-verify.mjs` 已转发到主脚本
- `scripts/retest-lab-submit.mjs` 仅保留 JS Hello，失败非零退出
- **不要**把 `step5` / `step6` 接到回归

证据：`raw/lab-regression.json`

## 覆盖与任务块对照

| 任务块 | 断言 | 结果 |
| --- | --- | --- |
| 实验状态 | 单测时间窗；未开始 403；过截止且在 `makeupDueAt` 内可提交并评测 | 通过 |
| 代码提交 | 建集/建题/公开+隐藏用例；正确入队；错误 WA；打回后重交 AC | 通过 |
| 评测 Worker | JS `ACCEPTED/100`；`normalizeOutput` 与 `runCode` 单测 | 通过 |
| 练习 | SMART 请求 count=5 实得 10 题；GRADED；错题本；hint 200；BY_TAG | 通过 |
| 讨论 | 发帖 @教师有 `DISCUSSION` 通知；@自己无通知；列表可见 | 通过 |

第二次回归：`stamp=D3-1787801621048`，Worker 提交 `8bc7e3fd-d20c-47c5-8afc-fddab12fd2d7` → ACCEPTED/100。

## 缺口状态（由 D1 清单并入，不再维护两份）

| 编号 | D3 结论 |
| --- | --- |
| GAP-UC06-01 | **关闭**：`judge-worker/src/runner.test.ts` |
| GAP-UC06-07 | **关闭**：补交窗 API |
| GAP-UC06-08 | **关闭**：隐藏用例对学生不可见 |
| GAP-UC06-09 | **部分关闭**：lab 回归不再依赖 `.http` |
| GAP-UC06-10 | **规避**：回归轮询真实 Worker，不用 step6 |
| GAP-UC07-01 | **部分关闭**：已测 SMART + BY_TAG；WRONG_BOOK / CUSTOM 未测 |
| GAP-UC07-02 | **关闭**：断言 items===10 |
| GAP-UC07-08 | **按备选关闭**：hint 200 |
| GAP-UC08-01 | **关闭**：POST 讨论 + 通知 |
| GAP-UC08-04 | **关闭**：@自己不通知 |
| GAP-ENG-01 | **部分关闭**：`test:lab` / `test:lab:unit` 失败非零；全库 `npm test` 仍由范文歆统一 |
| GAP-UC06-02/03/04/05/06 | 未做（队列故障、Python、文件提交、手动批改、打回上限） |
| GAP-UC07-03～07 | 未做（错题组卷 fixture、教师题库、反馈闭环、标准答案 ID、CODE 练习） |
| GAP-UC08-02/03/05/06 | 未做（匿名置顶删除、附件、未选课 403、已读） |
| GAP-ENG-02/04/05/06 | 非本任务：CI、step5 选课窗、E2E、`.http` |

## 整理说明

自建实验集标题带时间戳，结束后 `DELETE ...?force=1`，不修改选课期。练习会话留在库中但不阻塞下次运行。
