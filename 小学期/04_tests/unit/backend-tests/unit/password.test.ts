import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, verifyPassword } from "../../src/lib/password.js";

describe("UC-01 密码散列与校验", () => {
  it("UNIT-12-01：散列结果以 bcrypt 前缀开头且不含明文", async () => {
    const hash = await hashPassword("Demo123456");
    assert.match(hash, /^\$2[aby]\$/);
    assert.ok(!hash.includes("Demo123456"));
  });

  it("UNIT-12-02：正确密码校验通过", async () => {
    const hash = await hashPassword("secret-pass-1");
    assert.equal(await verifyPassword("secret-pass-1", hash), true);
  });

  it("UNIT-12-03：错误密码校验失败", async () => {
    const hash = await hashPassword("correct-pass");
    assert.equal(await verifyPassword("wrong-pass", hash), false);
  });

  it("UNIT-12-04：同一密码两次散列结果不同（随机盐）", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    assert.notEqual(a, b);
    assert.equal(await verifyPassword("same-password", a), true);
    assert.equal(await verifyPassword("same-password", b), true);
  });
});
