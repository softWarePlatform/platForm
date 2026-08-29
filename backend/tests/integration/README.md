# Backend integration tests

本目录用于放置需要真实 PostgreSQL、Redis、Prisma 或多个后端模块协作的集成测试。

当前 `prisma-dao.test.ts` 覆盖事务写入与复合键查询、公告已读 upsert、资料下载计数与收藏唯一约束、讨论关联查询与级联删除。

执行命令：

```bash
npm run test:dao --prefix backend
```

测试从 `backend/.env` 读取数据库地址。只允许连接本地/测试数据库，不得连接生产数据库。用例使用随机 UUID 和邮箱前缀创建数据，并在 `after` 钩子中按精确前缀清理。
