import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signToken, verifyToken } from "../../src/lib/jwt.js";

describe("UC-01 JWT 签发与校验", () => {
  it("UNIT-20-01：签发结果为三段式 JWT", () => {
    const token = signToken({ sub: "u1", email: "a@b.c", role: "STUDENT" });
    assert.equal(token.split(".").length, 3);
  });

  it("UNIT-20-02：校验回读负载字段", () => {
    const token = signToken({ sub: "u9", email: "teacher@demo.local", role: "TEACHER" });
    const payload = verifyToken(token);
    assert.equal(payload.sub, "u9");
    assert.equal(payload.email, "teacher@demo.local");
    assert.equal(payload.role, "TEACHER");
  });

  it("UNIT-20-03：被篡改的令牌校验失败", () => {
    const token = signToken({ sub: "u1", email: "a@b.c", role: "STUDENT" });
    const tampered = `${token.slice(0, -2)}xx`;
    assert.throws(() => verifyToken(tampered));
  });

  it("UNIT-20-04：非 JWT 字符串校验失败", () => {
    assert.throws(() => verifyToken("not-a-token"));
  });
});
