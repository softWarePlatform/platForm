import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addNotificationClient,
  emitNotificationToUser,
  emitNotificationToUsers,
} from "../../src/lib/notification-events.js";

describe("UC-08 讨论提及与站内通知事件", () => {
  it("UNIT-08-01：客户端连接后立即收到 ready 事件", () => {
    const payloads: string[] = [];
    const dispose = addNotificationClient("unit-user-ready", {
      id: "client-1",
      write: (payload) => payloads.push(payload),
    });

    assert.equal(payloads.length, 1);
    assert.match(payloads[0] ?? "", /event: ready/);
    assert.match(payloads[0] ?? "", /"ok":true/);
    dispose();
  });

  it("UNIT-08-02：通知只发送给目标用户，重复用户 ID 不会重复广播", () => {
    const target: string[] = [];
    const other: string[] = [];
    const disposeTarget = addNotificationClient("unit-user-target", {
      id: "target-client",
      write: (payload) => target.push(payload),
    });
    const disposeOther = addNotificationClient("unit-user-other", {
      id: "other-client",
      write: (payload) => other.push(payload),
    });

    emitNotificationToUsers(["unit-user-target", "unit-user-target"]);
    assert.equal(target.filter((x) => x.includes("event: notify")).length, 1);
    assert.equal(other.filter((x) => x.includes("event: notify")).length, 0);
    disposeTarget();
    disposeOther();
  });

  it("UNIT-08-03：断开连接后不再接收通知", () => {
    const payloads: string[] = [];
    const dispose = addNotificationClient("unit-user-disposed", {
      id: "client-disposed",
      write: (payload) => payloads.push(payload),
    });
    dispose();
    emitNotificationToUser("unit-user-disposed");

    assert.equal(payloads.length, 1);
  });
});
