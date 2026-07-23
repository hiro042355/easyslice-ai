import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  ReferenceFFmpegProcessAdapter,
  type FFmpegProcessAdapterDependencies,
} from "../../../lib/server/ffmpegProcess/referenceFFmpegProcessAdapter";
import type { FFmpegProcessRequest } from "../../../lib/server/ffmpegProcess/types";

class FakeProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  kills = 0;
  kill(): boolean {
    this.kills += 1;
    queueMicrotask(() => this.emit("close", null, "SIGTERM"));
    return true;
  }
}
const request = (): FFmpegProcessRequest => ({
  requestVersion: "1.0",
  requestIdentity: "request-001",
  operationIdentity: "operation-001",
  command: {
    projectionVersion: "1.0",
    executable: "ffmpeg",
    argumentTokens: ["-i", "input-001", "-t", "10", "output-001"],
  },
  timeoutMilliseconds: 1_000,
});
const harness = () => {
  const children: FakeProcess[] = [];
  const timers: Array<() => void> = [];
  const cancelled: unknown[] = [];
  const calls: Array<Readonly<{ executable: string; arguments: readonly string[]; options: unknown }>> = [];
  const dependencies: FFmpegProcessAdapterDependencies = {
    spawnProcess: (executable, argumentTokens, options) => {
      const child = new FakeProcess();
      children.push(child);
      calls.push({ executable, arguments: [...argumentTokens], options: { ...options } });
      return child;
    },
    timer: {
      schedule: (callback) => { timers.push(callback); return timers.length - 1; },
      cancel: (handle) => { cancelled.push(handle); },
    },
  };
  return { children, timers, cancelled, calls, dependencies };
};
const afterSpawn = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("normalizes zero and non-zero exits without exposing process output", async () => {
  for (const code of [0, 7]) {
    const fixture = harness();
    const pending = new ReferenceFFmpegProcessAdapter(fixture.dependencies).execute(request());
    await afterSpawn();
    fixture.children[0]!.stdout.write("raw-stdout-secret");
    fixture.children[0]!.stderr.write("raw-stderr-secret");
    fixture.children[0]!.emit("close", code, null);
    const actual = await pending;
    assert.equal(actual.classification, code === 0 ? "success" : "failed");
    assert.equal(actual.exitClassification, code === 0 ? "zero" : "non-zero");
    assert.equal(actual.stdoutClassification, "present");
    assert.equal(actual.stderrClassification, "present");
    assert.doesNotMatch(JSON.stringify(actual), /raw-(?:stdout|stderr)-secret/);
    assert.deepEqual(fixture.calls, [{
      executable: "ffmpeg",
      arguments: ["-i", "input-001", "-t", "10", "output-001"],
      options: { shell: false, stdio: ["ignore", "pipe", "pipe"] },
    }]);
  }
});

test("normalizes synchronous and emitted spawn failures", async () => {
  const thrown = await new ReferenceFFmpegProcessAdapter({
    spawnProcess: () => { throw new Error("raw-spawn-secret"); },
  }).execute(request());
  assert.equal(thrown.classification, "spawn-failure");
  assert.doesNotMatch(JSON.stringify(thrown), /raw-spawn-secret/);

  const fixture = harness();
  const pending = new ReferenceFFmpegProcessAdapter(fixture.dependencies).execute(request());
  await afterSpawn();
  fixture.children[0]!.emit("error", new Error("raw-emitted-secret"));
  const emitted = await pending;
  assert.equal(emitted.classification, "spawn-failure");
  assert.doesNotMatch(JSON.stringify(emitted), /raw-emitted-secret/);
});

test("timeout terminates once and projects timeout", async () => {
  const fixture = harness();
  const pending = new ReferenceFFmpegProcessAdapter(fixture.dependencies).execute(request());
  await afterSpawn();
  fixture.timers[0]!();
  const actual = await pending;
  assert.equal(actual.classification, "timeout");
  assert.equal(fixture.children[0]!.kills, 1);
  assert.equal(actual.exitClassification, "not-observed");
});

test("AbortSignal cancels before and during execution", async () => {
  const before = new AbortController();
  before.abort();
  const beforeFixture = harness();
  const beforeActual = await new ReferenceFFmpegProcessAdapter(beforeFixture.dependencies)
    .execute({ ...request(), cancellationSignal: before.signal });
  assert.equal(beforeActual.classification, "cancelled");
  assert.equal(beforeFixture.calls.length, 0);

  const during = new AbortController();
  const duringFixture = harness();
  const pending = new ReferenceFFmpegProcessAdapter(duringFixture.dependencies)
    .execute({ ...request(), cancellationSignal: during.signal });
  await afterSpawn();
  during.abort();
  const duringActual = await pending;
  assert.equal(duringActual.classification, "cancelled");
  assert.equal(duringFixture.children[0]!.kills, 1);
});

test("invalid requests and unsafe or duplicate options never spawn", async () => {
  const unsafe = ["line\nbreak", "\0", "a&&b", "a||b", "a;b", "a>b", "a<b"];
  const cases: FFmpegProcessRequest[] = [
    { ...request(), requestIdentity: "" },
    { ...request(), command: { ...request().command, executable: "ffmpeg-other" as "ffmpeg" } },
    { ...request(), command: { ...request().command, argumentTokens: [] } },
    { ...request(), timeoutMilliseconds: 0 },
    { ...request(), command: { ...request().command, argumentTokens: ["-i", "a", "-i", "b"] } },
    ...unsafe.map((value) => ({
      ...request(),
      command: { ...request().command, argumentTokens: ["-i", value] },
    })),
  ];
  for (const value of cases) {
    const fixture = harness();
    const actual = await new ReferenceFFmpegProcessAdapter(fixture.dependencies).execute(value);
    assert.equal(actual.classification, "invalid");
    assert.equal(fixture.calls.length, 0);
    const lastToken = value.command.argumentTokens.at(-1);
    if (lastToken && unsafe.includes(lastToken))
      assert.ok(!JSON.stringify(actual).includes(lastToken));
  }
});

test("decisions are deeply frozen, isolated, and deterministic", async () => {
  const execute = async () => {
    const fixture = harness();
    const pending = new ReferenceFFmpegProcessAdapter(fixture.dependencies).execute(request());
    await afterSpawn();
    fixture.children[0]!.emit("close", 0, null);
    return await pending;
  };
  const one = await execute();
  const two = await execute();
  assert.deepEqual(one, two);
  assert.notStrictEqual(one, two);
  assert.notStrictEqual(one.audit, two.audit);
  assert.ok(Object.isFrozen(one));
  assert.ok(Object.isFrozen(one.audit));
  assert.ok(Object.isFrozen(one.audit.entries));
  assert.ok(one.audit.entries.every(Object.isFrozen));
});
