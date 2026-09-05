const test = require("node:test");
const assert = require("node:assert/strict");
const { BrowserControlServer } = require("../electron/control-server.cjs");

test("browser control server authenticates and owns turn visibility", async () => {
  const calls = [];
  const turnEvents = [];
  const logs = [];
  const host = {
    beginTurn: (...args) => {
      calls.push(["start", ...args]);
      return {
        surfaceId: "launcher_surface_id_0123456789AB",
        tabId: "tab-1",
        reused: false,
        connectorBound: false,
      };
    },
    heartbeatTurn: (...args) => calls.push(["heartbeat", ...args]),
    endTurn: (...args) => {
      calls.push(["end", ...args]);
      return { cancelledByUser: false };
    },
  };
  const server = await new BrowserControlServer({
    logger: {
      info: (event, detail) => logs.push(["info", event, detail]),
      warn: (event, detail) => logs.push(["warn", event, detail]),
    },
    getBrowserHost: () => host,
    getPreferences: () => ({ showBrowserDuringTurns: true }),
    onTurnEnded: (event) => turnEvents.push(event),
  }).start();
  const descriptor = server.descriptor();
  try {
    const unauthenticated = await fetch(`${descriptor.endpoint}/v1/turn/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phase: "start", traceId: "abcdef123456" }),
    });
    assert.equal(unauthenticated.status, 401);

    const invalidOwner = await fetch(`${descriptor.endpoint}/v1/turn/start`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ phase: "start", traceId: "abcdef123456", helperPid: 0 }),
    });
    assert.equal(invalidOwner.status, 400);

    const start = await fetch(`${descriptor.endpoint}/v1/turn/start`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        phase: "start",
        traceId: "abcdef123456",
        helperPid: process.pid,
        conversationKey: "a".repeat(64),
        connectorIdentity: "Codex Native2",
        requireRetainedConversation: true,
      }),
    });
    assert.equal(start.status, 200);

    const heartbeat = await fetch(`${descriptor.endpoint}/v1/turn/heartbeat`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        phase: "heartbeat",
        traceId: "abcdef123456",
        helperPid: process.pid,
        refreshViewport: true,
      }),
    });
    assert.equal(heartbeat.status, 200);

    const invalidRefresh = await fetch(`${descriptor.endpoint}/v1/turn/heartbeat`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        phase: "heartbeat",
        traceId: "abcdef123456",
        helperPid: process.pid,
        refreshViewport: "yes",
      }),
    });
    assert.equal(invalidRefresh.status, 400);

    const invalidCompactionHeartbeat = await fetch(`${descriptor.endpoint}/v1/turn/heartbeat`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        phase: "heartbeat",
        traceId: "abcdef123456",
        helperPid: process.pid,
        compaction: true,
      }),
    });
    assert.equal(invalidCompactionHeartbeat.status, 400);

    const ownerlessEnd = await fetch(`${descriptor.endpoint}/v1/turn/end`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ phase: "end", traceId: "abcdef123456", status: "failed" }),
    });
    assert.equal(ownerlessEnd.status, 400);

    const end = await fetch(`${descriptor.endpoint}/v1/turn/end`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        phase: "end",
        traceId: "abcdef123456",
        helperPid: process.pid,
        status: "completed",
        retain: true,
        connectorBound: true,
        compaction: false,
      }),
    });
    assert.equal(end.status, 200);
    assert.deepEqual(calls, [
      [
        "start",
        "abcdef123456",
        true,
        process.pid,
        "a".repeat(64),
        "Codex Native2",
        true,
      ],
      ["heartbeat", "abcdef123456", process.pid, true],
      ["end", "abcdef123456", process.pid, "completed", true, undefined, true, true],
    ]);
    assert.equal(logs.some(([, event]) => event === "browser.turn_started"), true);
    assert.equal(logs.some(([, event]) => event === "browser.turn_ended"), true);
    assert.deepEqual(turnEvents, [{ status: "completed", compaction: false }]);
  } finally {
    await server.close();
  }
});

test("browser control server marks compaction completion for notification filtering", async () => {
  const turnEvents = [];
  const host = {
    beginTurn: () => ({ surfaceId: "launcher_surface_id_0123456789AB", tabId: "tab-1" }),
    endTurn: () => ({ cancelledByUser: false }),
  };
  const server = await new BrowserControlServer({
    logger: { info() {}, warn() {} },
    getBrowserHost: () => host,
    getPreferences: () => ({ showBrowserDuringTurns: false }),
    onTurnEnded: (event) => turnEvents.push(event),
  }).start();
  const descriptor = server.descriptor();
  try {
    const start = await fetch(`${descriptor.endpoint}/v1/turn/start`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ phase: "start", traceId: "compact123456", helperPid: process.pid }),
    });
    assert.equal(start.status, 200);

    const end = await fetch(`${descriptor.endpoint}/v1/turn/end`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        phase: "end",
        traceId: "compact123456",
        helperPid: process.pid,
        status: "completed",
        compaction: true,
      }),
    });
    assert.equal(end.status, 200);
    assert.deepEqual(turnEvents, [{ status: "completed", compaction: true }]);
  } finally {
    await server.close();
  }
});

test("browser control server reports a missing retained conversation as a typed conflict", async () => {
  const host = {
    beginTurn: () => {
      const error = new Error("The retained ChatGPT conversation is no longer available");
      error.code = "retained_conversation_unavailable";
      throw error;
    },
  };
  const server = await new BrowserControlServer({
    logger: { info() {}, warn() {} },
    getBrowserHost: () => host,
    getPreferences: () => ({ showBrowserDuringTurns: false }),
  }).start();
  const descriptor = server.descriptor();
  try {
    const response = await fetch(`${descriptor.endpoint}/v1/turn/start`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        phase: "start",
        traceId: "missing123456",
        helperPid: process.pid,
        conversationKey: "a".repeat(64),
        requireRetainedConversation: true,
      }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "The retained ChatGPT conversation is no longer available",
      code: "retained_conversation_unavailable",
    });
  } finally {
    await server.close();
  }
});

test("browser control server releases only ready tabs for an authenticated conversation key", async () => {
  const removed = [];
  const releaseEvents = [];
  const ready = {
    id: "ready-tab",
    traceId: "ready-trace",
    status: "ready",
    conversationKey: "b".repeat(64),
  };
  const running = {
    id: "running-tab",
    traceId: "running-trace",
    status: "running",
    conversationKey: "b".repeat(64),
  };
  const host = {
    turnTabs: new Map([[ready.id, ready], [running.id, running]]),
    logger: { info: (event, detail) => releaseEvents.push([event, detail]) },
    removeTurnTab(tab, abortRunning) {
      assert.equal(abortRunning, false);
      removed.push(tab.id);
      this.turnTabs.delete(tab.id);
    },
  };
  const server = await new BrowserControlServer({
    logger: { info() {}, warn() {} },
    getBrowserHost: () => host,
    getPreferences: () => ({}),
  }).start();
  const descriptor = server.descriptor();
  try {
    const unauthenticated = await fetch(`${descriptor.endpoint}/v1/turn/release`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationKey: "b".repeat(64) }),
    });
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${descriptor.endpoint}/v1/turn/release`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ conversationKey: "b".repeat(64) }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, released: 1 });
    assert.deepEqual(removed, ["ready-tab"]);
    assert.deepEqual([...host.turnTabs.keys()], ["running-tab"]);
    assert.deepEqual(releaseEvents, [["browser.tab_released", {
      tabId: "ready-tab",
      traceId: "ready-trace",
      status: "ready",
      reason: "retained_conversation_superseded",
    }]]);
  } finally {
    await server.close();
  }
});

test("browser control server rejects malformed retained-conversation contracts", async () => {
  const server = await new BrowserControlServer({
    logger: { info() {}, warn() {} },
    getBrowserHost: () => ({ beginTurn: () => assert.fail("invalid request reached browser host") }),
    getPreferences: () => ({}),
  }).start();
  const descriptor = server.descriptor();
  const post = (body) => fetch(`${descriptor.endpoint}/v1/turn/start`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${descriptor.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ traceId: "abcdef123456", helperPid: process.pid, ...body }),
  });
  try {
    assert.equal((await post({ conversationKey: "ABC" })).status, 400);
    assert.equal((await post({ requireRetainedConversation: true })).status, 400);
    assert.equal((await post({ connectorIdentity: "Codex Native2" })).status, 400);
  } finally {
    await server.close();
  }
});
