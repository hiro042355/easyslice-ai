import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { restoreServerSession } from "../../lib/client/restoredServerSession.ts";
const requireDependency = createRequire(import.meta.url);
const { JSDOM } = requireDependency("jsdom");

async function mount(statuses, { strict = false, deferred = null, deferredAt = 1 } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://local.example/workspace" });
  const saved = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const requests = [];
  let restoreCalls = 0;
  let tokenCalls = 0;
  let signOutCalls = 0;
  let interval;
  let cleared = false;
  dom.window.setInterval = callback => { interval = callback; return 1; };
  dom.window.clearInterval = () => { cleared = true; };
  saved.set("fetch", Object.getOwnPropertyDescriptor(globalThis, "fetch"));
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url, options) => {
    requests.push({ url, options });
    if (deferred && requests.length === deferredAt) await deferred;
    const status = statuses.shift() ?? 200;
    return { ok: status === 200, status };
  } });
  const clientAuth = { async authStateReady() { restoreCalls++; }, currentUser: { async getIdToken(force) { assert.equal(force, true); tokenCalls++; return "fake-id"; } } };
  const compiled = transformSync(readFileSync("components/AuthenticatedAccountControl.tsx", "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
  const target = { exports: {} };
  const resolveModule = name => {
    if (name === "firebase/auth") return { async signOut() { signOutCalls++; } };
    if (name === "@/lib/client/firebaseClient") return { firebaseClientAuth: () => clientAuth };
    if (name === "@/lib/client/restoredServerSession") return { restoreServerSession };
    return requireDependency(name);
  };
  new Function("require", "module", "exports", compiled)(resolveModule, target, target.exports);
  const container = dom.window.document.getElementById("root");
  const root = createRoot(container);
  await act(async () => {
    const element = React.createElement(target.exports.AuthenticatedAccountControl);
    root.render(strict ? React.createElement(StrictMode, null, element) : element);
  });
  return { container, requests, restoreCalls: () => restoreCalls, tokenCalls: () => tokenCalls, signOutCalls: () => signOutCalls,
    async logoutDuringFocus() { await act(async () => { dom.window.dispatchEvent(new dom.window.Event("focus")); container.querySelector("button").click(); }); },
    async settle() { await act(async () => { await new Promise(resolve => setImmediate(resolve)); }); },
    async focus() { await act(async () => { dom.window.dispatchEvent(new dom.window.Event("focus")); }); },
    async tick() { await act(async () => { interval(); }); },
    async close() {
      await act(async () => root.unmount());
      assert.equal(cleared, true);
      const count = requests.length;
      dom.window.dispatchEvent(new dom.window.Event("focus"));
      assert.equal(requests.length, count);
      dom.window.close();
      for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    },
  };
}
test("actual React control restores once and Signed in requires the final GET", async () => {
  const h = await mount([401, 200, 200]);
  try {
    await h.settle();
    assert.match(h.container.textContent, /Signed in/);
    assert.equal(h.restoreCalls(), 1);
    assert.equal(h.tokenCalls(), 1);
    assert.deepEqual(h.requests.map(request => request.options.method ?? "GET"), ["GET", "POST", "GET"]);
    assert.equal(h.requests[1].options.headers.Authorization, "Bearer fake-id");
    assert.ok(h.requests.every(request => request.url === "/api/auth/session" && request.options.credentials === "same-origin"));
    await h.focus();
    await h.tick();
    assert.equal(h.tokenCalls(), 1);
  } finally { await h.close(); }
});
test("StrictMode effect replay drains old work and runs a live session check", async () => {
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const h = await mount([401, 401, 200, 200], { strict: true, deferred });
  try {
    assert.doesNotMatch(h.container.textContent, /Signed in/);
    await h.focus();
    assert.equal(h.requests.length, 1);
    release();
    await h.settle();
    assert.match(h.container.textContent, /Signed in/);
    assert.equal(h.tokenCalls(), 1);
  } finally { await h.close(); }
});
test("server failure hides Signed in and periodic verification can recover", async () => {
  const h = await mount([200, 500, 200]);
  try {
    await h.settle();
    assert.match(h.container.textContent, /Signed in/);
    await h.focus();
    assert.doesNotMatch(h.container.textContent, /Signed in/);
    assert.ok(h.container.querySelector('[role="alert"]'));
    assert.equal(h.container.querySelector("button").disabled, true);
    await h.tick();
    assert.match(h.container.textContent, /Signed in/);
    assert.equal(h.tokenCalls(), 0);
  } finally { await h.close(); }
});
test("logout suppresses and drains a pending recovery before deleting the server cookie", async () => {
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const h = await mount([200, 401, 200], { deferred, deferredAt: 2 });
  try {
    await h.settle();
    await h.logoutDuringFocus();
    assert.doesNotMatch(h.container.textContent, /Signed in/);
    assert.deepEqual(h.requests.map(request => request.options.method ?? "GET"), ["GET", "GET"]);
    release();
    await h.settle();
    assert.deepEqual(h.requests.map(request => request.options.method ?? "GET"), ["GET", "GET", "DELETE"]);
    assert.equal(h.tokenCalls(), 0);
    assert.equal(h.signOutCalls(), 1);
    await h.focus();
    assert.equal(h.requests.length, 3);
  } finally { await h.close(); }
});
