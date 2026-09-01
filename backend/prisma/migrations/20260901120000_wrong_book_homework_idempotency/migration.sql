-- 可空字段不会影响历史记录；新内部接口使用该键保证重复投递幂等。
ALTER TABLE "WrongBookEntry" ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "WrongBookEntry_sourceKey_key"
ON "WrongBookEntry"("sourceKey");
