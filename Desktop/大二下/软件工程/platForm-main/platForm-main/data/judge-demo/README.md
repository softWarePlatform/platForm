# 评测功能自测包

与 `backend/prisma/seed.ts` 中**演示实验集**一一对应，用于验证 Redis + judge-worker 是否正常。

## 前置条件

1. 已执行 `npm run db:seed`（演示数据在库中）
2. Redis 已启动：`docker compose up -d redis`（或本机 Redis）
3. 评测 Worker 已启动：`npm run dev:worker`（另开终端；**修改 worker 后需重启**）
4. 前后端已启动：`npm run dev`

## 登录与入口

| 项目 | 值 |
|------|-----|
| 学生账号 | `student@demo.local` |
| 密码 | `Demo123456` |
| 课程 | **程序设计基础** |
| 实验集 | **程序设计综合实验（演示）**（进行中，AUTO 评测） |

路径：登录 → 课程 → 实验 → 进入上述实验集 → 选择题目 → **提交测评** Tab → 选语言 → 上传 `solutions/ac/` 下对应文件。

---

## 题目一览

| 目录 | 平台题目 | 语言 | 提交文件 | 预期 |
|------|----------|------|----------|------|
| [01-hello-output.md](problems/01-hello-output.md) | 实验一：标准输出 | javascript | `solutions/ac/hello.js` | AC，100 分 |
| [02-apb-python.md](problems/02-apb-python.md) | 实验二：A+B（Python） | python | `solutions/ac/apb.py` | AC（含隐藏用例） |
| [03-print-42.md](problems/03-print-42.md) | 实验：整数输出（课二） | python | `solutions/ac/forty_two.py` | AC |

课二实验集：**入门实验（演示）**（课程「数据结构」），题目「实验：整数输出」。

---

## 测试用例（与数据库一致）

详见 `testcases/*.json`。摘要：

### 实验一：标准输出

- 公开：输入空，期望输出 `Hello`（无多余空格/换行问题，Judge 会 trim 行尾）

### 实验二：A+B

- 公开：`3 5` → `8`
- **隐藏**：`10 20` → `30`（前端只显示「隐藏用例未通过」，不展示 I/O）

### 实验三：整数输出

- 公开：期望 `42`

---

## 错误样例（用于测 WA / 反馈）

| 文件 | 用途 |
|------|------|
| `solutions/wrong/hello_wrong.js` | 输出 Hi → 公开用例 WA |
| `solutions/wrong/apb_wrong.py` | 固定输出 0 → WA |
| `solutions/wrong/hello_debug.js` | 多打印调试行 → WA |

提交后应看到：得分 0、公开用例对比、可用 **AI 分析**。

---

## Windows 注意

Worker 调用 `python3` 运行 Python。若本机只有 `python` 命令，请安装 Python 3 并确保 `python3` 在 PATH 中，或创建别名：

```powershell
# 可选：若 where python3 找不到，可用 py 启动器
# 将 Python 安装目录加入 PATH，或安装时勾选 "Add to PATH"
python --version
python3 --version
```

JavaScript 题需本机已安装 **Node.js**（`node -v`）。

---

## 快速自测清单

- [ ] 上传 `hello.js` → 60 秒内 AC
- [ ] 上传 `apb.py` → AC，隐藏用例通过（总分 100）
- [ ] 上传 `hello_wrong.js` → WA，公开用例显示期望/实际
- [ ] 停止 worker 再提交 → 60 秒计时条超时提示
