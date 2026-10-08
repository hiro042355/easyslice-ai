import { isGuardedLocalDriver, type GuardedLocalDriver } from "./localDockerRehearsal";
import { randomUUID } from "node:crypto";
import { consumeLocalAuthorization, type LocalMigrateAuthorization } from "./authorization";
import { ARTIFACTS, OperatorFailure, safeFailure, binding, fail, pendingSet, preflight, type FailureCode, type Operation, type PassedPreflight, type PreflightInput, type Review } from "./contracts";

export type State = "CREATED" | "PREFLIGHT_PASSED" | "TRANSPORT_READY" | "HISTORY_PRIVILEGE_VERIFIED" | "VALIDATED" | "AWAITING_MIGRATE_AUTHORIZATION" | "MIGRATION_AUTHORIZED" | "MIGRATING" | "POST_VALIDATING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
type Stage = "START" | "INFO" | "VALIDATE" | "MIGRATE" | "POST_VALIDATE" | "STOP";
export class SharedRehearsalLease {
  #owner: string | null = null;
  constructor() { Object.seal(this); }
  claim(owner: string): boolean { if (this.#owner !== null) return false; this.#owner = owner; return true; }
  release(owner: string): void { if (this.#owner === owner) this.#owner = null; }
}
export type FixtureOptions = Readonly<{ pending?: readonly string[]; failAt?: Stage; pauseAt?: Stage; rawFailure?: string; failureOutcome?: "ROLLED_BACK" | "COMMIT_UNKNOWN" | "UNKNOWN"; lease?: SharedRehearsalLease }>;
export class LocalFixture {
  readonly #leaseOwner = randomUUID();
  readonly counts = {starts:0,stops:0,info:0,validate:0,migrate:0,postValidate:0};
  pending: readonly string[];
  #released = false;
  #closed = false;
  #releaseWaiter: (() => void) | undefined;
  readonly #options: FixtureOptions;
  #clockNow = 1_000_000;
  get now(): number { return this.#clockNow; }
  constructor(options: FixtureOptions = {}) {
    if (options.lease && Object.getPrototypeOf(options.lease) !== SharedRehearsalLease.prototype) fail("TRANSPORT_CONTRACT_REJECTED");
    this.#options = Object.freeze({...options});
    this.pending = Object.freeze([...(options.pending ?? ["000001"])]);
    Object.seal(this);
  }
  failureOutcome(): "ROLLED_BACK" | "COMMIT_UNKNOWN" | "UNKNOWN" { const v = this.#options.failureOutcome; return v === "ROLLED_BACK" || v === "COMMIT_UNKNOWN" ? v : "UNKNOWN"; }
  release(): void { this.#released = true; this.#releaseWaiter?.(); }
  advance(ms: number): void { if (!Number.isSafeInteger(ms) || ms < 0) throw new Error("invalid-fixture-clock"); if (!Number.isSafeInteger(this.#clockNow + ms)) throw new Error("invalid-fixture-clock"); this.#clockNow += ms; }
  async perform(stage: Stage): Promise<void> {
    const key = ({START:"starts",STOP:"stops",INFO:"info",VALIDATE:"validate",MIGRATE:"migrate",POST_VALIDATE:"postValidate"} as const)[stage];
    this.counts[key]++;
    if (stage === "MIGRATE" && this.#options.lease && !this.#options.lease.claim(this.#leaseOwner)) throw new Error("fixture-lease-held");
    if (stage === "STOP") { this.#closed = true; this.#options.lease?.release(this.#leaseOwner); this.release(); }
    if (this.#options.pauseAt === stage && !this.#released) await new Promise<void>(resolve => { this.#releaseWaiter = resolve; });
    if (this.#options.failAt === stage) throw new Error(this.#options.rawFailure ?? "fixture-failure");
    if (stage !== "STOP" && this.#closed) throw new Error("fixture-closed");
  }
}
export type Receipt = Readonly<{ receiptVersion: "1"; sessionId: string; target: "NONE" | "LOCAL_REHEARSAL"; source: string | null; state: State; preflight: "PASS" | "NOT_RUN"; validation: "PASS" | "NOT_RUN"; artifact: "MATCH" | "NOT_RUN"; history: "VERIFIED" | "NOT_RUN"; privileges: "VERIFIED" | "NOT_RUN"; pendingVersions: readonly string[]; migrationCount: number; transactionOutcome: "NOT_RUN" | "COMMITTED" | "SIMULATED_COMMITTED" | "ROLLED_BACK" | "COMMIT_UNKNOWN" | "UNKNOWN"; cleanup: "NOT_NEEDED" | "PENDING" | "PASS" | "FAIL"; failureCode: FailureCode | null }>;
const terminal = (s: State) => ["COMPLETED","FAILED","CANCELLED","TIMED_OUT"].includes(s);

/** Closed adapters only: bounded in-memory fixture or internally branded local Docker rehearsal. */
export class LocalMigrationSession {
  readonly #sessionId = randomUUID();
  #currentState: State = "CREATED";
  readonly #states: State[] = ["CREATED"];
  #proof: PassedPreflight | undefined;
  #acquired = false;
  #cleaned = false;
  #cleanupResult: Receipt["cleanup"] = "NOT_NEEDED";
  #cleanupPromise: Promise<void> | undefined;
  #validated = false;
  #pending: readonly string[] = [];
  #migrated = 0;
  #transactionOutcome: Receipt["transactionOutcome"] = "NOT_RUN";
  #failure: FailureCode | null = null;
  #authorizationExpiry = 0;
  #busy = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #stopped: Promise<void>;
  #stopWaiter!: () => void;
  #operations = 0;
  readonly #fixture: LocalFixture | GuardedLocalDriver;
  constructor(fixture: LocalFixture | GuardedLocalDriver = new LocalFixture()) {
    this.#fixture = fixture;
    // Runtime identity check rejects arbitrary real adapters passed by untyped callers.
    if (!isGuardedLocalDriver(fixture) && (Object.getPrototypeOf(fixture) !== LocalFixture.prototype || fixture.perform !== LocalFixture.prototype.perform)) fail("TRANSPORT_CONTRACT_REJECTED");
    if (isGuardedLocalDriver(fixture)) { this.#acquired = true; this.#cleanupResult = "PENDING"; }
    this.#stopped = new Promise(resolve => { this.#stopWaiter = resolve; });
    Object.seal(this);
  }
  state(): State { return this.#currentState; }
  trace(): readonly State[] { return Object.freeze([...this.#states]); }
  #transition(s: State): void { this.#currentState = s; this.#states.push(s); }
  #alive(): void { if (terminal(this.#currentState)) fail("STATE_REJECTED"); }
  async #wait(stage: Stage): Promise<void> {
    await Promise.race([this.#fixture.perform(stage), this.#stopped.then(() => { throw new OperatorFailure(this.#failure ?? "STATE_REJECTED"); })]);
    this.#alive();
  }
  async #cleanup(): Promise<void> {
    if (this.#cleanupPromise) return this.#cleanupPromise;
    this.#cleanupPromise = (async () => {
      if (this.#timer !== undefined) clearTimeout(this.#timer);
      if (!this.#acquired) { this.#cleanupResult = "NOT_NEEDED"; return; }
      this.#cleanupResult = "PENDING";
      if (this.#cleaned) return;
      this.#cleaned = true;
      try { await this.#fixture.perform("STOP"); this.#cleanupResult = "PASS"; }
      catch { this.#cleanupResult = "FAIL"; }
    })();
    return this.#cleanupPromise;
  }
  async #terminate(state: "FAILED" | "CANCELLED" | "TIMED_OUT", code: FailureCode): Promise<void> {
    if (!terminal(this.#currentState)) { this.#failure = code; this.#transition(state); this.#stopWaiter(); }
    await this.#cleanup();
  }
  async #guarded(action: () => Promise<void>, code: FailureCode | (() => FailureCode)): Promise<Receipt> {
    if (terminal(this.#currentState)) return this.receipt();
    if (this.#busy) { await this.#terminate("FAILED","CONCURRENT_OPERATION"); return this.receipt(); }
    this.#busy = true;
    try { await action(); }
    catch(error) {
      const classified = safeFailure(error, typeof code === "function" ? code() : code);
      if (this.#currentState === "MIGRATING" && classified === "MIGRATION_FAILED") { this.#transactionOutcome = this.#fixture.failureOutcome(); if (isGuardedLocalDriver(this.#fixture)) this.#migrated = this.#fixture.committedCount(); }
      await this.#terminate("FAILED", classified);
    } finally { this.#busy = false; }
    return this.receipt();
  }
  async start(input: PreflightInput): Promise<Receipt> {
    return this.#guarded(async () => {
      if (this.#currentState !== "CREATED") fail("STATE_REJECTED");
      if (isGuardedLocalDriver(this.#fixture)) this.#fixture.checkInput(input);
      else if (input.transport.adapter !== "IN_MEMORY") fail("TRANSPORT_CONTRACT_REJECTED");
      this.#proof = preflight(input);
      this.#transition("PREFLIGHT_PASSED");
      this.#timer = setTimeout(() => { void this.#terminate("TIMED_OUT","TIMEOUT"); },this.#proof.transport.sessionMs);
      this.#acquired = true;
      this.#cleanupResult = "PENDING";
      await this.#wait("START");
      this.#transition("TRANSPORT_READY");
      this.#transition("HISTORY_PRIVILEGE_VERIFIED");
    },"TRANSPORT_FAILED");
  }
  review(): Review {
    if (this.#currentState !== "AWAITING_MIGRATE_AUTHORIZATION" || !this.#proof) fail("STATE_REJECTED");
    return Object.freeze({sessionId:this.#sessionId,source:this.#proof.source,targetKind:"LOCAL_REHEARSAL",targetBinding:binding(this.#proof.target),historyBinding:binding(this.#proof.history),flywayDigest:ARTIFACTS.flyway.digest,proxyDigest:ARTIFACTS.proxy.digest,pending:Object.freeze([...this.#pending])});
  }
  async authorize(grant: LocalMigrateAuthorization): Promise<Receipt> {
    return this.#guarded(async () => {
      const expected = this.review();
      this.#authorizationExpiry = consumeLocalAuthorization(grant,expected,this.#fixture.now);
      this.#transition("MIGRATION_AUTHORIZED");
    },"AUTHORIZATION_REJECTED");
  }
  async execute(operation: Operation): Promise<Receipt> {
    let stageCode: FailureCode = "WRAPPER_EXCEPTION";
    return this.#guarded(async () => {
      if (!["INFO","VALIDATE","MIGRATE"].includes(operation)) fail("OPERATION_REJECTED");
      if (!this.#proof || ++this.#operations > 32) fail("STATE_REJECTED");
      if (operation === "MIGRATE") {
        if (this.#currentState !== "MIGRATION_AUTHORIZED") fail("AUTHORIZATION_REJECTED");
        if (this.#fixture.now >= this.#authorizationExpiry) fail("AUTHORIZATION_EXPIRED");
        const currentPending = pendingSet(this.#fixture.pending,this.#proof.versions);
        if (JSON.stringify(currentPending) !== JSON.stringify(this.#pending)) fail("PENDING_MISMATCH");
        this.#transactionOutcome = "UNKNOWN";
        this.#transition("MIGRATING");
        stageCode = "MIGRATION_FAILED";
        await this.#wait("MIGRATE");
        this.#migrated = isGuardedLocalDriver(this.#fixture) ? this.#fixture.committedCount() : this.#pending.length;
        this.#transactionOutcome = isGuardedLocalDriver(this.#fixture) ? "COMMITTED" : "SIMULATED_COMMITTED";
        this.#transition("POST_VALIDATING");
        stageCode = "POST_VALIDATION_FAILED";
        await this.#wait("POST_VALIDATE");
        await this.#cleanup();
        this.#alive();
        if (this.#cleanupResult === "FAIL") fail("CLEANUP_FAILED");
        this.#transition("COMPLETED");
        this.#stopWaiter();
      } else {
        if (!["HISTORY_PRIVILEGE_VERIFIED","AWAITING_MIGRATE_AUTHORIZATION"].includes(this.#currentState)) fail("STATE_REJECTED");
        stageCode = operation === "INFO" ? "WRAPPER_EXCEPTION" : "VALIDATION_FAILED";
        await this.#wait(operation);
        const observed = pendingSet(this.#fixture.pending,this.#proof.versions);
        this.#pending = observed;
        if (operation === "VALIDATE") {
          this.#validated = true;
          this.#transition("VALIDATED");
          this.#transition("AWAITING_MIGRATE_AUTHORIZATION");
        }
      }
    },() => stageCode);
  }
  async cancel(): Promise<Receipt> { await this.#terminate("CANCELLED","CANCELLED"); return this.receipt(); }
  async finishWithoutMigration(): Promise<Receipt> {
    return this.#guarded(async () => {
      if (this.#currentState !== "AWAITING_MIGRATE_AUTHORIZATION") fail("STATE_REJECTED");
      await this.#cleanup();
      this.#alive();
      if (this.#cleanupResult === "FAIL") fail("CLEANUP_FAILED");
      this.#transition("COMPLETED"); this.#stopWaiter();
    },"CLEANUP_FAILED");
  }
  receipt(): Receipt {
    // Build from an allowlist; never spread input, fixture output or errors.
    return Object.freeze({receiptVersion:"1",sessionId:this.#sessionId,target:this.#proof?"LOCAL_REHEARSAL":"NONE",source:this.#proof?.source??null,state:this.#currentState,preflight:this.#proof?"PASS":"NOT_RUN",validation:this.#validated?"PASS":"NOT_RUN",artifact:this.#proof?"MATCH":"NOT_RUN",history:this.#proof?"VERIFIED":"NOT_RUN",privileges:this.#proof?"VERIFIED":"NOT_RUN",pendingVersions:Object.freeze([...this.#pending]),migrationCount:this.#migrated,transactionOutcome:this.#transactionOutcome,cleanup:this.#cleanupResult,failureCode:this.#failure});
  }
}

Object.freeze(LocalFixture.prototype);
Object.freeze(LocalMigrationSession.prototype);

Object.freeze(SharedRehearsalLease.prototype);
