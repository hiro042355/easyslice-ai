import type {
  DurableWorkflowDatabaseCommand,
  DurableWorkflowDatabaseExecutionResult,
  DurableWorkflowTransactionClock,
  DurableWorkflowTransactionSession,
  DurableWorkflowTransactionSessionFactory,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";

export type SessionEvents = {
  begin: number;
  execute: number;
  commit: number;
  rollback: number;
  release: number;
  discard: number;
  commands: DurableWorkflowDatabaseCommand[];
};

export function createClock(initial = 10): DurableWorkflowTransactionClock & { advance(value: number): void } {
  let monotonic = initial;
  return Object.freeze({
    nowUtc: () => "2026-07-16T00:00:00.000Z",
    monotonicMilliseconds: () => monotonic,
    advance: (value: number) => { monotonic = value; },
  });
}

export function createSessionFactory(overrides: Partial<DurableWorkflowTransactionSession> = {}): {
  factory: DurableWorkflowTransactionSessionFactory;
  events: SessionEvents;
} {
  const events: SessionEvents = { begin: 0, execute: 0, commit: 0, rollback: 0, release: 0, discard: 0, commands: [] };
  const session: DurableWorkflowTransactionSession = Object.freeze({
    async begin() { events.begin += 1; return { status: "active" }; },
    async execute(command: DurableWorkflowDatabaseCommand): Promise<DurableWorkflowDatabaseExecutionResult> {
      events.execute += 1;
      events.commands.push(command);
      return { status: "success", rows: [], rowCount: 0 };
    },
    async commit() { events.commit += 1; return { status: "committed" }; },
    async rollback() { events.rollback += 1; return { status: "rolled-back" }; },
    release() { events.release += 1; },
    discard() { events.discard += 1; },
    ...overrides,
  });
  return {
    events,
    factory: Object.freeze({ async acquire() { return { status: "acquired", session }; } }),
  };
}

export const defaultOptions = Object.freeze({
  isolation: "read-committed" as const,
  accessMode: "read-write" as const,
  deadlineMonotonicMilliseconds: 1_000,
});

export const emptyCommand = Object.freeze({
  commandVersion: "1.0" as const,
  statementId: "foundation.noop",
  parameters: Object.freeze([]),
  expectedResult: "none" as const,
});
