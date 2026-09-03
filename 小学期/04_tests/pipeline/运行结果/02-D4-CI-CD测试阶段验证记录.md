# D4 CI/CD测试阶段验证记录

## 流水线接入结果

`.github/workflows/ci-cd.yml` 的 `quality` 任务现按以下顺序执行：

1. 安装依赖、迁移并写入测试数据；
2. 完整构建；
3. 单元测试；
4. DAO集成测试；
5. 启动API、Worker、Web并等待就绪；
6. 只读冒烟测试；
7. 10条主流程+5条异常流程API测试；
8. 10个用例的E2E测试；
9. 无论成功或失败均上传 `test-results/` 证据。

`images` 任务声明 `needs: quality`，`deploy` 又声明 `needs: images`。因此质量任务非零退出时，镜像与部署不会开始。

## 失败阻断实测

执行：

```text
npm run test:ci:failure-block
```

结果：

| 字段 | 值 |
|---|---|
| 注入退出码 | 17 |
| 阻断阶段 | injected-failure |
| 下游镜像阶段是否执行 | false |
| pipelineBlocked | true |

该验证脚本真实启动两个顺序子进程：首阶段成功，第二阶段故意以17退出；编排器检测到非零码后立即终止循环，写标记的下游阶段没有执行。

## 说明

本次没有擅自提交或推送未提交工作区，因此没有用远程GitHub运行冒充本地验证。CI配置、命令路径和失败阻断逻辑已在本机验证；提交到远端后由相同的非零退出语义执行。
